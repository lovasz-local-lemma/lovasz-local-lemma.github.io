// Test outcomes belong to the task. A hanging putter is not an upright-balance
// failure, and a tracing score does not imply a binary success criterion.
(function (BF) {
  'use strict';
  function kindOf(state, params) {
    if (state.terrainRun) return 'course';
    if (params.replayHoldSeconds > 0) return 'recovery';
    if (params.objectiveId === 'ball_in_hole') return 'sunk';
    if (state.dodge) return state.dodge.noDie ? 'hit-free' : 'survived';
    if (params.objectiveId === 'pendulum_both_above') return 'above-horizon';
    if (['balance_up', 'pendulum_neat_score'].includes(params.objectiveId)) return 'upright';
    if (state.chainReach && state.chainReach.target) return 'tracking';
    return 'replay';
  }
  function accumulate(state, params, dt) {
    const m = state._replayMetrics || (state._replayMetrics = { seconds: 0, uprightSeconds: 0, errorIntegral: 0, errorSeconds: 0 });
    const horizon = Math.max(0, params.evalSeconds || 8);
    const weight = Math.min(dt, Math.max(0, horizon - m.seconds));
    if (weight <= 1e-9) return;
    const nodes = state.world.nodes;
    const segments = state.segments || [[state.cartIdx, state.tipIdx]];
    const upright = segments.length && segments.every(([a, b]) => {
      const p = nodes[a], q = nodes[b];
      return p && q && -(q.y - p.y) / Math.max(1e-9, Math.hypot(q.x - p.x, q.y - p.y)) > 0.86;
    });
    if (upright) m.uprightSeconds += weight;
    if (params.replayHoldSeconds > 0 || params.objectiveId === 'pendulum_both_above') {
      const cart = nodes[state.cartIdx];
      if (cart && (cart.x <= state.world.cartMinX + 1e-6 || cart.x >= state.world.cartMaxX - 1e-6)) m.railContact = true;
      const limit = params.replayAngleDeg === 90 || (!params.replayAngleDeg && params.objectiveId === 'pendulum_both_above')
        ? 0 : Math.cos((params.replayAngleDeg || 15) * Math.PI / 180);
      const inRange = segments.length && segments.every(([a,b])=>{
        const p=nodes[a],q=nodes[b];
        return p && q && -(q.y-p.y)/Math.max(1e-9,Math.hypot(q.x-p.x,q.y-p.y)) >= limit;
      });
      m.finalHoldSeconds = inRange ? (m.finalHoldSeconds || 0) + weight : 0;
    }
    const target = state.chainReach && state.chainReach.target, tip = nodes[state.tipIdx];
    if (target && tip) {
      const error = Math.hypot(tip.x - target.x, tip.y - target.y);
      if (Number.isFinite(error)) { m.errorIntegral += error * weight; m.errorSeconds += weight; }
    }
    m.seconds += weight;
    if (m.seconds + 1e-9 >= horizon && state.terrainRun && !m.terrainAtHorizon) {
      m.terrainAtHorizon = { reachedGoal: !!state.terrainRun.reachedGoal, dead: !!(state.dead || state.terrainRun.dead) };
    }
    if (m.seconds + 1e-9 >= horizon && state.dodge && !m.dodgeAtHorizon) {
      // Freeze the result at the evaluation horizon. A collision during the
      // extra visual linger is not part of an eight-second Test trial.
      m.dodgeAtHorizon = { dead: !!(state.dead || state.dodge.dead), hits: state.dodge.hitsTaken || 0 };
    }
  }
  function result(state, params) {
    const kind = kindOf(state, params), m = state._replayMetrics || {};
    const horizon = Math.max(0, params.evalSeconds || 8);
    if (kind === 'above-horizon') return {kind,success:(m.seconds || 0)+1e-8>=horizon &&
      (m.finalHoldSeconds || 0)+1e-8>=Math.min(30,horizon/2),railContact:!!m.railContact,finalHoldSeconds:m.finalHoldSeconds || 0};
    if (kind === 'recovery') return {kind,success:(params.replayRequireNoRail === false || !m.railContact) && (m.seconds || 0)+1e-8>=horizon && (m.finalHoldSeconds || 0)+1e-8>=params.replayHoldSeconds,
      railContact:!!m.railContact,finalHoldSeconds:m.finalHoldSeconds || 0};
    if (kind === 'course') {
      const outcome = m.terrainAtHorizon || { reachedGoal: !!state.terrainRun.reachedGoal, dead: !!(state.dead || state.terrainRun.dead) };
      return { kind, success: outcome.reachedGoal && !outcome.dead };
    }
    if (kind === 'sunk') return { kind, success: !!(state.ball && state.ball.sunk) };
    if (state.dodge) {
      const outcome = m.dodgeAtHorizon || { dead: !!(state.dead || state.dodge.dead), hits: state.dodge.hitsTaken || 0 };
      const completed = (m.seconds || state.simTime || 0) + 1e-9 >= horizon;
      return { kind, success: completed && (kind === 'hit-free' ? outcome.hits === 0 : !outcome.dead),
        hits: outcome.hits, aliveSeconds: Math.min(horizon, state.dodge.aliveTime || 0) };
    }
    if (kind === 'upright') return { kind, success: (m.uprightSeconds || 0) > horizon * 0.6,
      uprightSeconds: m.uprightSeconds || 0 };
    if (kind === 'tracking') return { kind, success: null,
      meanError: m.errorSeconds > 0 ? m.errorIntegral / m.errorSeconds : null };
    return { kind, success: null, fitness: Number.isFinite(state.liveFitness) ? state.liveFitness : null };
  }
  function createStats(now) {
    return { trials: 0, successes: 0, binaryTrials: 0, totalUpTime: 0, lastUpTime: 0,
      totalSeconds: 0, trialStartedAt: now || 0, lastResult: null };
  }
  function record(stats, outcome) {
    if (stats.lastResult && stats.lastResult.kind !== outcome.kind) {
      Object.assign(stats, createStats(stats.trialStartedAt));
    }
    stats.trials++;
    if (outcome.success != null) {
      stats.binaryTrials = (stats.binaryTrials || 0) + 1;
      if (outcome.success) stats.successes++;
    }
    stats.lastResult = outcome;
    stats.lastUpTime = outcome.uprightSeconds || 0;
    stats.totalUpTime = (stats.totalUpTime || 0) + stats.lastUpTime;
  }
  function summary(stats, state, params) {
    const kind = state ? kindOf(state, params) : 'replay';
    if (state && state.dodge && params.dodgeNoReset) {
      return state.dodge.noDie ? `continuous · ${state.dodge.hitsTaken || 0} hits`
        : `continuous · ${(state.dodge.aliveTime || 0).toFixed(1)}s survived${state.dead ? ' · hit' : ''}`;
    }
    const last = stats.lastResult;
    const compatible = !last || last.kind === kind;
    const trials = compatible ? stats.trials || 0 : 0;
    if (['sunk', 'hit-free', 'survived', 'upright', 'course', 'recovery', 'above-horizon'].includes(kind)) {
      const count = compatible ? stats.binaryTrials || 0 : 0;
      const successes = compatible ? stats.successes || 0 : 0;
      const label = kind === 'above-horizon' ? `final ${Math.min(30,(params.evalSeconds || 8)/2)}s above horizon` : kind === 'recovery' ? `final ${params.replayHoldSeconds}s ${params.replayAngleDeg === 90 ? 'above horizon' : `±${params.replayAngleDeg || 15}°`}` : kind === 'course' ? 'courses finished' : kind === 'upright' ? 'upright >60%' :
        ['survived', 'hit-free'].includes(kind) ? `${params.evalSeconds || 8}s ${kind}` : kind;
      return `${successes}/${count} ${label}${count ? ` · ${Math.round(100 * successes / count)}%` : ''}`;
    }
    if (kind === 'tracking') return `${trials} replays${last && compatible && last.meanError != null ? ` · mean error ${last.meanError.toFixed(1)}px` : ''}`;
    return `${trials} replays${last && compatible && last.fitness != null ? ` · last score ${last.fitness.toFixed(2)}` : ''}`;
  }
  function holeGeometry(state, center, width) {
    const hole = state && state.holeRegion;
    return hole && Number.isFinite(hole.minX) && Number.isFinite(hole.maxX)
      ? { center: (hole.minX + hole.maxX) / 2, width: hole.maxX - hole.minX }
      : { center, width };
  }
  function terrainSeed(seed, trial) {
    // First course matches the saved seed; subsequent courses are repeatable
    // but different. No RNG is consumed by redraws or comparison overlays.
    return ((seed >>> 0) + Math.imul(trial >>> 0, 0x9e3779b9)) >>> 0;
  }
  BF.replayMetrics = { kindOf, accumulate, result, createStats, record, summary, holeGeometry, terrainSeed };
})(window.BF);
