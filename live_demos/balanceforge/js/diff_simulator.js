// Differentiable simulator module (experimental).
//
// What's here:
//
//   1. A minimal tape-based reverse-mode autodiff system (Var) — enough
//      to compute gradients of any scalar loss through arbitrary
//      compositions of +, -, *, /, neg, sin, cos, exp, sqrt, tanh, and
//      relu. No matrix abstractions — operations are scalar so the
//      graph stays trivially serializable.
//
//   2. A differentiable mass-spring system. Point masses connected by
//      ideal Hooke springs with linear damping. Explicit symplectic
//      Euler step (semi-implicit — update v from f then x from new v)
//      so the gradient stays well-behaved over moderate trajectories
//      without an autograd-aware constraint solver.
//
//   3. A demo task `pullToTarget` that exercises end-to-end gradient
//      flow: optimize a control input (or material parameter) to
//      minimize squared distance to a target after N steps. Used by
//      the smoke test to confirm gradients propagate correctly.
//
// Out of scope for now (next iterations):
//
//   - Eulerian fluid simulation (grid-based MAC solver). Differentiable
//     fluid sims are heavy: each step is a Poisson solve, which means
//     a linear system. Tape-based AD through the solver works but
//     blows up memory; the standard approach is to differentiate the
//     IMPLICIT solver via adjoint-method linear systems. Substantial.
//
//   - Differentiable path tracer. Even harder: discontinuities at
//     primary visibility boundaries, light source sampling, etc.
//     Production solutions (Mitsuba 3, redner) edge-sample at silhouettes.
//
//   - Rod / constraint solver. Our physics.js uses Gauss-Seidel
//     position projection for rod constraints. Tape AD through 8
//     solver passes works but produces large graphs; alternative is
//     implicit-function-theorem adjoints. Future port.
//
// Why "experimental": this module is NOT yet wired into the main
// trainer. It exists so gradient-based methods (FD-GD / Adam / L-BFGS)
// can switch to TRUE gradients instead of finite-difference probes for
// the differentiable setups we add. First real customer will be a
// simple pendulum where the swing-up cost is C^∞ in the policy
// weights — letting us compare CMA-ES vs Adam-with-true-gradients
// honestly.
(function () {
  if (typeof window === 'undefined') {
    if (typeof global !== 'undefined') {
      // Node smoke-test path: stash the module on the same global BF
      // namespace the rest of the codebase uses.
      global.window = global.window || {};
    }
  }
  const root = typeof window !== 'undefined' ? window : global;
  root.BF = root.BF || {};
  const BF = root.BF;

  // ---- Tape-based reverse-mode autodiff -------------------------------
  //
  // Each `Var` is a node in the computation graph. `val` is the forward
  // value, `grad` accumulates dLoss/dself during backward(), and
  // `_back(g)` is a closure that pushes `g` into the gradients of this
  // node's inputs. The tape is the topologically-ordered list of nodes
  // that ran during forward; backward walks it in reverse.

  let _tape = null;

  function _record(node) {
    if (_tape !== null) _tape.push(node);
    return node;
  }

  class Var {
    constructor(val, back) {
      this.val = val;
      this.grad = 0;
      this._back = back || null;
    }
  }

  function v(x) { return new Var(x, null); }

  function add(a, b) {
    a = (a instanceof Var) ? a : v(a);
    b = (b instanceof Var) ? b : v(b);
    const out = new Var(a.val + b.val, (g) => { a.grad += g; b.grad += g; });
    return _record(out);
  }
  function sub(a, b) {
    a = (a instanceof Var) ? a : v(a);
    b = (b instanceof Var) ? b : v(b);
    const out = new Var(a.val - b.val, (g) => { a.grad += g; b.grad += -g; });
    return _record(out);
  }
  function mul(a, b) {
    a = (a instanceof Var) ? a : v(a);
    b = (b instanceof Var) ? b : v(b);
    const out = new Var(a.val * b.val, (g) => {
      a.grad += g * b.val;
      b.grad += g * a.val;
    });
    return _record(out);
  }
  function div(a, b) {
    a = (a instanceof Var) ? a : v(a);
    b = (b instanceof Var) ? b : v(b);
    const out = new Var(a.val / b.val, (g) => {
      a.grad += g / b.val;
      b.grad += -g * a.val / (b.val * b.val);
    });
    return _record(out);
  }
  function neg(a) {
    a = (a instanceof Var) ? a : v(a);
    const out = new Var(-a.val, (g) => { a.grad += -g; });
    return _record(out);
  }
  function sqr(a) { return mul(a, a); }

  function sin(a) {
    a = (a instanceof Var) ? a : v(a);
    const c = Math.cos(a.val);
    const out = new Var(Math.sin(a.val), (g) => { a.grad += g * c; });
    return _record(out);
  }
  function cos(a) {
    a = (a instanceof Var) ? a : v(a);
    const s = Math.sin(a.val);
    const out = new Var(Math.cos(a.val), (g) => { a.grad += -g * s; });
    return _record(out);
  }
  function exp(a) {
    a = (a instanceof Var) ? a : v(a);
    const e = Math.exp(a.val);
    const out = new Var(e, (g) => { a.grad += g * e; });
    return _record(out);
  }
  function sqrt(a) {
    a = (a instanceof Var) ? a : v(a);
    const r = Math.sqrt(a.val);
    const out = new Var(r, (g) => { a.grad += g * 0.5 / Math.max(1e-12, r); });
    return _record(out);
  }
  function tanh(a) {
    a = (a instanceof Var) ? a : v(a);
    const t = Math.tanh(a.val);
    const out = new Var(t, (g) => { a.grad += g * (1 - t * t); });
    return _record(out);
  }
  // ReLU's gradient is undefined at 0; we pick the +side derivative
  // (sub-gradient 0 at negatives). Standard convention.
  function relu(a) {
    a = (a instanceof Var) ? a : v(a);
    const out = new Var(a.val > 0 ? a.val : 0, (g) => {
      a.grad += a.val > 0 ? g : 0;
    });
    return _record(out);
  }

  // Compute gradients of `loss` w.r.t. every node it depends on. Caller
  // is expected to read .grad off the inputs they care about.
  function backward(loss) {
    if (_tape === null) {
      throw new Error('backward() called with no active tape; wrap forward in withTape()');
    }
    loss.grad = 1;
    // Walk in reverse topological order. Nodes were pushed in forward
    // order, so the reverse is exactly what we want.
    for (let i = _tape.length - 1; i >= 0; i--) {
      const node = _tape[i];
      if (node._back && node.grad !== 0) node._back(node.grad);
    }
  }

  // Open a tape, run `fn`, close the tape. Returns whatever `fn`
  // returns. Caller can then call backward() inside fn (or after,
  // before withTape unwinds -- backward is reentrant-safe as long as
  // the tape isn't cleared until withTape exits).
  function withTape(fn) {
    const prev = _tape;
    _tape = [];
    try {
      return fn();
    } finally {
      _tape = prev;
    }
  }

  // Reset the accumulated grad on each Var that participated in `vars`.
  // Useful when running many backward passes on the same parameter
  // Vars (e.g. gradient descent loop).
  function zeroGrad(vars) {
    for (const x of vars) {
      if (x instanceof Var) x.grad = 0;
    }
  }

  // ---- Differentiable mass-spring -------------------------------------
  //
  // State: arrays of x, y, vx, vy Vars. Springs: { i, j, restLen, k }.
  // Step uses symplectic Euler (update v from forces, then x from new
  // v). Damping is applied as a per-spring viscous term proportional
  // to the rate of length change. Gravity is a constant downward force.

  function makeMassSpringWorld(opts) {
    opts = opts || {};
    const n = opts.numNodes | 0 || 2;
    const world = {
      x: new Array(n),
      y: new Array(n),
      vx: new Array(n),
      vy: new Array(n),
      mass: new Float64Array(n),
      pinned: new Uint8Array(n),
      springs: [],
      gravity: opts.gravity != null ? opts.gravity : 9.8,
      damping: opts.damping != null ? opts.damping : 0.1,
      // External control force per node, scalar per axis (Vars or
      // numbers). Reset every step by callers that want per-step
      // control.
      fx_ext: new Array(n),
      fy_ext: new Array(n),
    };
    for (let i = 0; i < n; i++) {
      world.x[i] = v(0); world.y[i] = v(0);
      world.vx[i] = v(0); world.vy[i] = v(0);
      world.mass[i] = 1;
      world.fx_ext[i] = v(0); world.fy_ext[i] = v(0);
    }
    return world;
  }

  function addSpring(world, i, j, opts) {
    opts = opts || {};
    const dx0 = world.x[i].val - world.x[j].val;
    const dy0 = world.y[i].val - world.y[j].val;
    const restLen = opts.restLen != null
      ? opts.restLen
      : Math.sqrt(dx0 * dx0 + dy0 * dy0);
    world.springs.push({
      i, j,
      restLen: (restLen instanceof Var) ? restLen : v(restLen),
      k: (opts.k instanceof Var) ? opts.k : v(opts.k != null ? opts.k : 100),
    });
  }

  // Run one symplectic Euler step. dt is a plain number (the
  // integrator is differentiable in state + parameters, not in the
  // step size itself for now). Pinned nodes have their force zeroed
  // and velocity held at 0 -- the pin acts as a Lagrangian fixed
  // constraint without a solver.
  function step(world, dt) {
    const n = world.x.length;
    const fx = new Array(n);
    const fy = new Array(n);
    for (let i = 0; i < n; i++) {
      // Gravity (downward = +y in our convention; flip if your
      // setup uses screen-coords-up).
      fx[i] = v(0);
      fy[i] = v(world.mass[i] * world.gravity);
      // External force (control input).
      fx[i] = add(fx[i], world.fx_ext[i]);
      fy[i] = add(fy[i], world.fy_ext[i]);
    }
    // Spring forces: F = -k * (|d| - rest) * d_hat - damping * (d_hat · dv) * d_hat
    for (const s of world.springs) {
      const dx = sub(world.x[s.i], world.x[s.j]);
      const dy = sub(world.y[s.i], world.y[s.j]);
      const len = sqrt(add(sqr(dx), sqr(dy)));
      const stretch = sub(len, s.restLen);
      // Unit direction from j -> i. Guard against zero-length with a
      // tiny epsilon inside sqrt.
      const ux = div(dx, len);
      const uy = div(dy, len);
      // Spring force magnitude along ux/uy.
      const fmag = mul(neg(s.k), stretch);
      // Damping along the spring axis.
      const dvx = sub(world.vx[s.i], world.vx[s.j]);
      const dvy = sub(world.vy[s.i], world.vy[s.j]);
      const dvAlong = add(mul(dvx, ux), mul(dvy, uy));
      const dmag = mul(neg(v(world.damping)), dvAlong);
      const fxAlong = mul(add(fmag, dmag), ux);
      const fyAlong = mul(add(fmag, dmag), uy);
      fx[s.i] = add(fx[s.i], fxAlong);
      fy[s.i] = add(fy[s.i], fyAlong);
      fx[s.j] = sub(fx[s.j], fxAlong);
      fy[s.j] = sub(fy[s.j], fyAlong);
    }
    // Integrate. Pinned nodes skip the v + x updates entirely.
    for (let i = 0; i < n; i++) {
      if (world.pinned[i]) continue;
      const ax = div(fx[i], v(world.mass[i]));
      const ay = div(fy[i], v(world.mass[i]));
      world.vx[i] = add(world.vx[i], mul(ax, v(dt)));
      world.vy[i] = add(world.vy[i], mul(ay, v(dt)));
      world.x[i]  = add(world.x[i],  mul(world.vx[i], v(dt)));
      world.y[i]  = add(world.y[i],  mul(world.vy[i], v(dt)));
    }
  }

  // ---- Demo task: pull a 2-mass spring system to a target ----------------
  //
  // Two nodes connected by a spring. Node 0 is pinned (anchor). The
  // caller controls the spring's REST LENGTH each step. We minimize
  // squared distance of node 1 from a target after N steps. Returns
  // { loss, finalX, finalY } and leaves the gradients on the rest-
  // length Vars (if they were the diff'd inputs).
  //
  // This is the smallest possible end-to-end test: gradient flows
  // through dt × N spring updates back to the rest-length parameter.
  function pullToTarget(opts) {
    opts = opts || {};
    const T = opts.steps | 0 || 60;
    const dt = opts.dt || 0.02;
    const target = opts.target || { x: 1.5, y: 0 };
    // The rest length we're optimizing. Provide as a Var so gradients
    // accumulate on it.
    const restLen = (opts.restLen instanceof Var) ? opts.restLen : v(opts.restLen != null ? opts.restLen : 1);
    const world = makeMassSpringWorld({
      numNodes: 2,
      gravity: opts.gravity != null ? opts.gravity : 0,  // horizontal task
      damping: opts.damping != null ? opts.damping : 0.5,
    });
    world.x[0] = v(0); world.y[0] = v(0); world.pinned[0] = 1;
    world.x[1] = v(1); world.y[1] = v(0);
    world.springs.push({
      i: 0, j: 1, restLen, k: v(opts.k != null ? opts.k : 50),
    });
    for (let t = 0; t < T; t++) step(world, dt);
    const ex = sub(world.x[1], v(target.x));
    const ey = sub(world.y[1], v(target.y));
    const loss = add(sqr(ex), sqr(ey));
    return { loss, finalX: world.x[1].val, finalY: world.y[1].val, restLen };
  }

  BF.diffSim = {
    Var, v, withTape, backward, zeroGrad,
    add, sub, mul, div, neg, sqr, sin, cos, exp, sqrt, tanh, relu,
    makeMassSpringWorld, addSpring, step,
    pullToTarget,
  };
})();
