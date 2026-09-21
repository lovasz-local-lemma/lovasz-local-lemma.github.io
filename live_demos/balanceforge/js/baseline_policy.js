// BalanceForge — hand-coded baseline policies.
//
// These are parameter-free, deterministic policies used as experimental
// controls / yardsticks for trained agents. They DO NOT LEARN -- the
// trainer's mode='fixed' path keeps the harness loop uniform (step() is
// a no-op) but the actual command output comes from one of the kinds
// defined here. Each kind clamps to [-1, 1] just like the real policy
// adapters; the setup's tick() applies maxSpeed / control mode as usual.
//
// Kinds:
//   'still'      -> outputs [0, 0]. The "heavily punish moving fast"
//                   baseline. Agent starts at center (0, 0) per the
//                   dodge buildWorld and stays there. Tests whether
//                   center-still-with-no-active-control survives at all,
//                   and whether it survives BETTER or WORSE than the
//                   trained corner-sitter (i.e., is the corner protective
//                   because of the walls, or just an evolutionarily
//                   cheap way to reach stillness?).
//   'wall-wedge' -> outputs [+1, +1]. The corner-sitter reference.
//                   The wall-clamp at setups.js:1859-1862 zeros velocity
//                   on impact, so the agent wedges into the
//                   bottom-right corner and stays there with zero
//                   active control. Direct A/B against trained policies
//                   that converged to the same behavior the hard way.
//
// Future kinds (e.g. 'reactive-dodge', 'random-walker') can be added by
// extending the switch in policy(). The signature returned matches the
// rest of the codebase's policy convention: { command(obs), commandAll(obs, cmds) }.
(function (BF) {
  'use strict';
  function policy(kind) {
    const k = String(kind || 'still');
    if (k === 'still') {
      return {
        command(_obs) { return 0; },
        commandAll(_obs, cmds) {
          for (let i = 0; i < cmds.length; i++) cmds[i] = 0;
        },
      };
    }
    if (k === 'wall-wedge') {
      return {
        command(_obs) { return 1; },
        commandAll(_obs, cmds) {
          for (let i = 0; i < cmds.length; i++) cmds[i] = 1;
        },
      };
    }
    // Unknown kind -> fall back to 'still' so we never throw mid-rollout.
    // Adding new kinds is intentional; silently swallowing them isn't.
    // Log once at construction time so a typo in the preset is visible.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('baseline_policy: unknown kind "' + k + '", falling back to "still"');
    }
    return {
      command(_obs) { return 0; },
      commandAll(_obs, cmds) {
        for (let i = 0; i < cmds.length; i++) cmds[i] = 0;
      },
    };
  }

  BF.baselinePolicy = { policy: policy };
})(window.BF);
