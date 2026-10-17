// durable-d-live-experiment.test.js — Phase D, US-D2.1 live measurement
// (Vikunja #789).
//
// ═══════════════════════════════════════════════════════════════════════════
// LIVE EXPERIMENT — SKIPPED BY DEFAULT. DO NOT un-skip in CI or in the
// normal suite run. US-D2 accepts caching on MEASUREMENT, not documentation:
// the plan flags an OpenRouter discrepancy (docs vs. one empirical test
// disagree on non-system breakpoints), so this experiment runs a scripted
// multi-turn conversation through the REAL chatTurn path and records the
// per-turn usage numbers — cached_tokens and cache-read share — into
// engine/phase-d-design-notes.md.
//
// RUN IT MANUALLY, with the gateway up and credentials loaded:
//   DOTENV_CONFIG_PATH=<slack-agents/.env> MACF_LIVE_CACHE_EXPERIMENT=1 \
//     npx jest engine/tests/durable-d-live-experiment.test.js --forceExit
// (or run the standalone harness: node engine/measure-prompt-cache.js)
//
// PROTOCOL:
//   1. Gateway chain, cache mode 'full': 4 turns, one stable session, a
//      large stable prefix (system + tools + task context) and short
//      dynamic follow-ups — the production delegation shape.
//   2. If the CEO bar (cached_tokens > 0 on repeats AND >= 50% cache-read
//      share by turn 3) is not met, the run is repeated in 'system-only'
//      mode (US-D2.2 fallback) and both measurements are recorded.
//   3. If the gateway path cannot run at all (unreachable / every leg
//      failing), the VM-direct OpenRouter chain is measured instead.
//   The deliverable is the RECORDED measurement — meeting the bar or not
//   is a finding, not a test failure. The test fails only if no
//   measurement could be recorded at all.
//
// WHY requires live INSIDE the test body: same reason as the A5.3 live
// experiment — loading the real litellm at module scope would drag axios +
// the ESM-only proxy-agent packages into collection for a skipped test.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const RUN_LIVE = process.env.MACF_LIVE_CACHE_EXPERIMENT === '1';
const describeLive = RUN_LIVE ? describe : describe.skip;

describeLive('US-D2 — LIVE EXPERIMENT: prompt caching measured on the real route', () => {
  test('runs the multi-turn measurement and records per-turn cached-token shares', async () => {
    const harness = require('../measure-prompt-cache');
    const notesPath = path.join(__dirname, '..', 'phase-d-design-notes.md');
    const result = await harness.runLiveMeasurement({ recordTo: notesPath });
    expect(result).toBeTruthy();
    expect(Array.isArray(result.runs)).toBe(true);
    expect(result.runs.length).toBeGreaterThanOrEqual(1);
    const recorded = fs.readFileSync(notesPath, 'utf8');
    expect(recorded).toContain('US-D2 live cache measurement');
    // At least one run must contain real per-turn usage (or a recorded
    // transport error explaining why none could be obtained).
    const anyData = result.runs.some(r => (r.turns && r.turns.length > 0) || r.error);
    expect(anyData).toBe(true);
  }, 900000);
});
