// chain_joint.js
// Joint-actuator math shared by the live physics (js/physics.js), the chain
// setups (js/setups.js), and the standalone probe. A joint MOTOR is internal:
// it applies a +τ couple to the outboard segment b→c and a −τ couple to the
// inboard a→b, so net force = 0 and net external torque = 0 — it changes the
// RELATIVE joint angle ∠abc, not the chain's angular momentum.
(function (BF) {
  // Tuned hypotheses (positional-bias / PD units, stable at dt=1/120). The
  // probe tunes these so a unit command visibly rotates a joint in ~0.5 s
  // without exploding.
  const CHAIN_JOINT = { torqueScale: 8000, servoKp: 2000, servoKd: 600, angleRange: Math.PI / 2 };

  // Force couple for joint torque τ at node b (between a→b and b→c).
  // F_c = (τ/|bc|)·perp_unit(bc), F_a = (τ/|ab|)·perp_unit(ab), F_b = −(F_a+F_c).
  // perp_unit(v) = (−vy, vx)/|v|. (+τ opens the joint; the probe confirms the
  // sign and the two perp signs are flipped together if it's backwards.)
  function jointCouple(ax, ay, bx, by, cx, cy, tau) {
    const abx = bx - ax, aby = by - ay, lab2 = abx * abx + aby * aby || 1e-9;
    const bcx = cx - bx, bcy = cy - by, lbc2 = bcx * bcx + bcy * bcy || 1e-9;
    const fcx = tau * (-bcy) / lbc2, fcy = tau * (bcx) / lbc2;
    const fax = tau * (-aby) / lab2, fay = tau * (abx) / lab2;
    return { fa: { x: fax, y: fay }, fb: { x: -(fax + fcx), y: -(fay + fcy) }, fc: { x: fcx, y: fcy } };
  }

  // Servo (PD): policy output u∈[-1,1] → target = restAngle + u·angleRange;
  // returns the torque that drives currentAngle→target.
  function servoTorque(currentAngle, restAngle, omega, u) {
    const target = restAngle + u * CHAIN_JOINT.angleRange;
    return CHAIN_JOINT.servoKp * (target - currentAngle) - CHAIN_JOINT.servoKd * omega;
  }

  BF.chainJoint = { CHAIN_JOINT, jointCouple, servoTorque };
})(window.BF = window.BF || {});
