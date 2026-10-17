// durable-a5-live-experiment.test.js — Phase A, US-A5.3 (Vikunja #789).
//
// ═══════════════════════════════════════════════════════════════════════════
// LIVE EXPERIMENT — SKIPPED BY DEFAULT. DO NOT un-skip in CI or in the
// normal suite run. This file exists to satisfy US-A5.3: the plan flags
// "does the deployed LiteLLM gateway fall back when an upstream returns
// HTTP 200 with EMPTY content?" as assumed-not-documented, and Phase C's
// design depends on the answer. This experiment produces the answer
// against the REAL deployed gateway instead of trusting documentation.
//
// RUN IT MANUALLY, once, with the gateway up:
//   MACF_LIVE_GATEWAY_EXPERIMENT=1 npx jest engine/tests/durable-a5-live-experiment.test.js --forceExit
//
// EXPERIMENT PROTOCOL (operator steps):
//   1. Precondition: the desktop LiteLLM gateway is running and reachable
//      (utils/litellm isConfigured() === true), and the smart chain has at
//      least two legs configured (today: macf-smart-paid -> macf-smart-free).
//   2. Stage an empty-returning primary: point the FIRST leg of the smart
//      chain at a stub upstream that returns HTTP 200 with
//      choices[0].message.content === '' for every request (e.g. a local
//      mock OpenAI server), leaving the second leg on the real provider.
//      Restore the gateway config afterwards.
//   3. Run this file with the env gate on. The test issues ONE chatTurn on
//      the smart tier and records, into the Phase C design notes:
//        - whether the caller received non-empty text (gateway fell back)
//          or an empty result / all-models-failed error (gateway treated
//          the empty 200 as success and did NOT fall back);
//        - which model/leg produced the final answer, when visible;
//        - gateway version + timestamp.
//   4. The result is appended as a dated JSON line to
//      engine/phase-c-design-notes.md (created on first run). Phase C
//      (US-C1/US-C2) must cite the recorded line before relying on either
//      answer — see the stories doc, Definition of Done for Phase A.
//
// WHY the requires live INSIDE the test body: this file is collected by
// every normal jest run. Loading the real litellm at module scope would
// drag axios + the ESM-only proxy-agent packages into collection for a
// test that is skipped — the exact failure AGENTS.md warns about. Inside
// the body, nothing loads unless the experiment actually runs.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const RUN_LIVE = process.env.MACF_LIVE_GATEWAY_EXPERIMENT === '1';
const describeLive = RUN_LIVE ? describe : describe.skip;

describeLive('US-A5.3 — LIVE EXPERIMENT: gateway behavior on HTTP 200 with empty content', () => {
  test('records whether the deployed gateway falls back on an empty 200', async () => {
    const litellm = require('../../utils/litellm');
    expect(litellm.isConfigured()).toBe(true);
    const startedAt = new Date().toISOString();
    let outcome;
    try {
      const turn = await litellm.chatTurn({
        systemPrompt: 'You are a probe. Answer with one short sentence.',
        messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
        model: 'smart',
        maxTokens: 50,
      });
      outcome = {
        experiment: 'US-A5.3 gateway empty-200 fallback',
        at: startedAt,
        gatewayConfigured: true,
        receivedText: !!(turn && turn.text),
        textPreview: turn && turn.text ? String(turn.text).slice(0, 80) : null,
        toolsDropped: !!(turn && turn.toolsDropped),
        interpretation: turn && turn.text
          ? 'Caller received content. With the primary leg staged to return empty 200s, this means the gateway DID fall back (or the staged primary was not actually first in the chain — verify staging before citing).'
          : 'Caller received an empty turn: the gateway treated the empty 200 as success and did NOT fall back at the gateway layer. Phase C must detect emptiness at the app layer (US-C1).',
      };
    } catch (err) {
      outcome = {
        experiment: 'US-A5.3 gateway empty-200 fallback',
        at: startedAt,
        gatewayConfigured: true,
        receivedText: false,
        error: String(err && err.message).slice(0, 300),
        interpretation: 'The call chain exhausted and threw. If the staged primary returned empty 200s, an all-models-failed error mentioning empty responses means the CALLER-side chain (utils/litellm) detected the empties — record which layer detected them before Phase C relies on it.',
      };
    }
    const notesPath = path.join(__dirname, '..', 'phase-c-design-notes.md');
    fs.appendFileSync(notesPath, `\n<!-- US-A5.3 live experiment result -->\n\`\`\`json\n${JSON.stringify(outcome, null, 2)}\n\`\`\`\n`);
    // The experiment's deliverable is the recorded line, not an assertion:
    // either answer is a valid experimental result. Fail only if the
    // recording itself did not happen.
    expect(fs.readFileSync(notesPath, 'utf8')).toContain('US-A5.3');
  }, 120000);
});
