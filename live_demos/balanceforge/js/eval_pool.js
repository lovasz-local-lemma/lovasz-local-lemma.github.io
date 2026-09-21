// BalanceForge eval-worker pool.
//
// Manages N Web Workers, each running an isolated copy of the JS
// trainer eval path. Provides a high-level evalBatch(tasks) that
// splits the work across workers and resolves when every worker has
// reported back.
//
// Why split per-batch (not per-task)? postMessage overhead is non-
// trivial (the genome gets structured-cloned every send). Sending one
// chunk of M tasks to each worker pays the overhead M times less than
// sending one task M times. The pool divides `tasks` into roughly
// equal slices and ships one slice to each worker.
//
// Lifecycle:
//   const pool = BF.evalPool.create({ workerCount: 4 });
//   await pool.init({ setupId, params, seed });
//   const fits = await pool.evalBatch(tasks);   // tasks: [{ genome, angle, params?, config? }, ...]
//   pool.destroy();
//
// Notes / caveats:
//   - Workers loaded from `file://` may be blocked by browser
//     same-origin rules. The pool falls back to a serial in-process
//     evaluator if `new Worker(...)` throws -- the API stays the same
//     so callers don't have to branch.
//   - Determinism: each gen, callers should reuse the same trainer
//     state on workers (via init). Per-rollout RNG is driven by the
//     trainer.rng on each worker, which is seeded from `seed` at init.
//     If you want bit-exact determinism vs the serial path you must
//     send the rollout angles AND any per-rollout state (env overlay,
//     hole jitter) explicitly -- the worker only knows about (genome,
//     angle).
(function () {
  const root = typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis);
  root.BF = root.BF || {};
  const BF = root.BF;

  // Cap the pool size. Spawning one worker per hardware thread looks free but
  // isn't: every worker importScripts()es the ENTIRE eval stack (~25 modules) at
  // startup, and doing that for ~30 workers at once overwhelms worker startup ->
  // NONE of them ack `inited` within the 15s init timeout, so the whole pool
  // degrades to SERIAL (single-core) and training crawls. Measured on a 32-thread
  // machine (Browser pane): 8 workers init in 0.14s, 16 in 0.33s, but 31 never
  // finish in 15s -> total serial fallback. Beyond ~12-16 workers the per-batch
  // postMessage/split overhead also eats the parallelism gain for typical
  // popSizes. 12 keeps startup reliable AND throughput near-optimal, with margin
  // below the observed cliff. (The multi-core benchmark can still request more
  // explicitly via opts.workerCount.)
  const MAX_DEFAULT_WORKERS = 12;

  function workerCountDefault() {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      // Reserve one core for the UI thread + chart redraws so the browser
      // doesn't choke under full load, and cap so a many-core machine doesn't
      // over-spawn workers and time the whole pool out into serial.
      return Math.max(1, Math.min(navigator.hardwareConcurrency - 1, MAX_DEFAULT_WORKERS));
    }
    return 2;
  }

  function create(opts) {
    opts = opts || {};
    const workerCount = Math.max(1, opts.workerCount || workerCountDefault());
    // Cache-bust the worker URL on every pool spawn. The browser
    // aggressively caches Worker scripts (especially from file://);
    // without this, a user who refreshes the page after we push a
    // worker.js fix can still get the stale cached version every
    // time `new Worker(...)` runs -- which silently breaks the
    // parity contract between the worker and the main-thread eval
    // path. Appending a fresh ?v=<timestamp> query forces a fetch.
    const baseUrl = opts.workerUrl || 'js/eval_worker.js';
    const cacheBuster = baseUrl.indexOf('?') >= 0 ? '&' : '?';
    const workerUrl = baseUrl + cacheBuster + 'v=' + Date.now();
    let workers = [];
    let workerInited = [];
    let nextRequestId = 1;
    let pending = new Map(); // id -> { resolve, reject, expected, accumulated }
    let serialFallback = false;

    function attachWorker(w, idx) {
      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.kind === 'inited') {
          workerInited[idx] = true;
          return;
        }
        if (msg.kind === 'evalBatchDone') {
          const entry = pending.get(msg.id);
          if (!entry) return;
          // fitnessOnly mode: msg.fitnesses is a Float64Array slice.
          // fullResults mode: msg.results is an Array of result objs.
          entry.results[idx] = msg.fitnesses || msg.results;
          entry.received++;
          if (entry.received === entry.expected) {
            pending.delete(msg.id);
            if (entry.fullResults) {
              // Concatenate the per-worker arrays of result objects.
              const out = new Array(entry.totalLen);
              let off = 0;
              for (let i = 0; i < entry.results.length; i++) {
                const slice = entry.results[i];
                if (!slice) continue;
                for (let j = 0; j < slice.length; j++) out[off + j] = slice[j];
                off += slice.length;
              }
              entry.resolve(out);
            } else {
              // Concatenate slices in worker-order to rebuild the
              // full fitness array in the same order the caller's
              // tasks were submitted (we sliced sequentially).
              const out = new Float64Array(entry.totalLen);
              let off = 0;
              for (let i = 0; i < entry.results.length; i++) {
                const slice = entry.results[i];
                if (!slice) continue;
                out.set(slice, off);
                off += slice.length;
              }
              entry.resolve(out);
            }
          }
          return;
        }
        if (msg.kind === 'error') {
          const entry = pending.get(msg.id);
          if (entry) {
            pending.delete(msg.id);
            entry.reject(new Error('worker ' + idx + ': ' + msg.error));
          } else {
            console.error('[BF.evalPool] worker error (no pending):', msg.error);
          }
        }
      };
      w.onerror = (err) => {
        // Surface uncaught worker exceptions to any in-flight requests
        // so we don't deadlock the caller.
        for (const [id, entry] of pending) {
          pending.delete(id);
          entry.reject(new Error('worker ' + idx + ' crashed: ' + (err && err.message || err)));
        }
      };
    }

    try {
      for (let i = 0; i < workerCount; i++) {
        const w = new Worker(workerUrl);
        attachWorker(w, i);
        workers.push(w);
        workerInited.push(false);
      }
    } catch (e) {
      // file:// or same-origin-policy block. Drop back to a serial
      // evaluator that calls BF.trainer.evaluatePolicy on the caller's
      // thread. Same API surface.
      console.warn('[BF.evalPool] Worker construction failed; falling back to serial. ' +
                   'Serve over http(s):// to enable parallel eval. ' + (e && e.message || e));
      serialFallback = true;
      workers = [];
    }

    // Max wall time to wait for ALL workers to ack `inited` before we
    // give up on parallel and degrade to serial. A worker that throws
    // during importScripts/makeTrainer (stale cache, file:// fetch
    // block, a missing dependency, an OOM under 31-worker load, ...)
    // would otherwise never post `inited` and `init()` would hang
    // FOREVER -- which bricks training entirely because the Train
    // handler `await`s this before setting app.training. The serial
    // path is always correct (just slower), so a stuck/failed pool must
    // fall back to it, never hang. 15s is generous: a healthy pool
    // inits in well under a second; this only trips on genuine failure.
    const INIT_TIMEOUT_MS = 15000;

    function degradeToSerial(reason) {
      // Tear the (broken/partial) pool down and flip to serial so
      // evalBatch routes through serialFallbackFn. Idempotent.
      if (serialFallback) return;
      serialFallback = true;
      console.error('[BF.evalPool] parallel eval unavailable; falling back to '
        + 'SERIAL (training still runs, just not multi-core). Reason: ' + reason);
      for (const w of workers) { try { w.terminate(); } catch (_) {} }
      workers = [];
      workerInited = [];
    }

    function init(opts) {
      if (serialFallback) {
        // Serial fallback uses the trainer the caller already has;
        // there's nothing to init on workers because there are no
        // workers.
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        let acked = 0;
        let failed = 0;
        let settled = false;
        const expect = workers.length;
        const origHandlers = workers.map((w) => w.onmessage);
        const origErrs = workers.map((w) => w.onerror);
        let firstError = null;
        const finish = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
        const checkDone = () => {
          if (settled) return;
          if (acked === expect) {
            // All workers up: parallel path stays active.
            finish();
          } else if (acked + failed === expect) {
            // At least one worker failed to init. A partial pool would
            // make evalBatch hang on the dead workers' slices, so go
            // fully serial -- correct, just single-core.
            degradeToSerial(firstError || 'one or more workers failed to initialize');
            finish();
          }
        };
        // Hard ceiling: if some worker neither acks nor reports an
        // error (e.g. silently wedged), don't hang training forever.
        const timer = setTimeout(() => {
          if (settled) return;
          degradeToSerial('init timed out after ' + INIT_TIMEOUT_MS
            + 'ms (' + acked + '/' + expect + ' workers ready'
            + (firstError ? ('; first error: ' + firstError) : '') + ')');
          finish();
        }, INIT_TIMEOUT_MS);
        workers.forEach((w, idx) => {
          const orig = origHandlers[idx];
          w.onmessage = (e) => {
            const d = e.data;
            if (d && d.kind === 'inited') {
              acked++;
              w.onmessage = orig;
              checkDone();
            } else if (d && d.kind === 'initError') {
              // Distinct id-less init failure (see eval_worker.js). The
              // generic id-carrying 'error' path stays for evalBatch.
              failed++;
              if (!firstError) firstError = 'worker ' + idx + ': ' + d.error;
              checkDone();
            } else {
              // Forward anything else to the standard handler.
              orig(e);
            }
          };
          // A worker script that fails to load/parse fires onerror, not
          // a message. Count it as a failed init so we degrade instead
          // of waiting for an ack that can never come.
          w.onerror = (err) => {
            failed++;
            if (!firstError) {
              firstError = 'worker ' + idx + ' onerror: '
                + (err && (err.message || err.filename) || err);
            }
            checkDone();
            const oe = origErrs[idx];
            if (typeof oe === 'function') { try { oe(err); } catch (_) {} }
          };
          w.postMessage({
            kind: 'init',
            workerId: idx,
            setupId: opts.setupId,
            seed: opts.seed,
            params: opts.params,
            mutationParams: opts.mutationParams,
          });
        });
      });
    }

    function evalBatch(tasks, opts) {
      // opts: { fullResults?: boolean, serialFallbackFn?: function }
      //   fullResults: if true, resolves to Array of { fitness,
      //     behavior, setupBehavior } objects. If false (default),
      //     resolves to a Float64Array of fitnesses.
      //   serialFallbackFn: called per-task when workers unavailable.
      //     For fullResults the fn should return an object; otherwise
      //     a number.
      opts = opts || {};
      const fullResults = !!opts.fullResults;
      const serialFallbackFn = opts.serialFallbackFn;
      if (serialFallback || workers.length === 0) {
        if (!serialFallbackFn) {
          return Promise.reject(new Error('evalPool: no workers and no serial fallback'));
        }
        if (fullResults) {
          const out = new Array(tasks.length);
          for (let i = 0; i < tasks.length; i++) {
            out[i] = serialFallbackFn(tasks[i]) || { fitness: 0 };
          }
          return Promise.resolve(out);
        }
        const out = new Float64Array(tasks.length);
        for (let i = 0; i < tasks.length; i++) {
          out[i] = serialFallbackFn(tasks[i]) || 0;
        }
        return Promise.resolve(out);
      }
      const n = workers.length;
      const id = nextRequestId++;
      const sliceLen = Math.ceil(tasks.length / n);
      const slices = [];
      for (let i = 0; i < n; i++) {
        const lo = i * sliceLen;
        const hi = Math.min(tasks.length, lo + sliceLen);
        slices.push(tasks.slice(lo, hi));
      }
      return new Promise((resolve, reject) => {
        const entry = {
          resolve, reject,
          expected: n,
          received: 0,
          results: new Array(n).fill(null),
          totalLen: tasks.length,
          fullResults,
        };
        pending.set(id, entry);
        for (let i = 0; i < n; i++) {
          const slice = slices[i];
          if (slice.length === 0) {
            entry.results[i] = fullResults ? [] : new Float64Array(0);
            entry.received++;
            if (entry.received === entry.expected) {
              pending.delete(id);
              if (fullResults) {
                resolve([]);
              } else {
                const out = new Float64Array(entry.totalLen);
                let off = 0;
                for (const s of entry.results) { if (s) { out.set(s, off); off += s.length; } }
                resolve(out);
              }
            }
            continue;
          }
          workers[i].postMessage({ kind: 'evalBatch', id, tasks: slice, fullResults });
        }
      });
    }

    function destroy() {
      for (const w of workers) {
        try { w.postMessage({ kind: 'terminate' }); } catch (_) {}
        try { w.terminate(); } catch (_) {}
      }
      workers = [];
      workerInited = [];
      pending.clear();
    }

    return {
      workerCount: workers.length,
      isSerialFallback: () => serialFallback,
      init, evalBatch, destroy,
    };
  }

  // workerCountDefault exported so the over-spawn cap is unit-testable (a pool
  // built in Node has no Worker -> serial fallback -> workerCount 0, which can't
  // observe the cap).
  BF.evalPool = { create, workerCountDefault };
})();
