// engine/measure-prompt-cache.js — Phase D live measurement harness
// (Vikunja #789, US-D2.1).
//
// US-D2 accepts prompt caching on MEASUREMENT, not documentation. This
// harness runs a scripted multi-turn conversation through the REAL
// chatTurn path (desktop gateway chain, or the VM-direct OpenRouter
// chain) with the production request shape — a large stable prefix
// (system prompt built from the execution-kernel spec + the real native
// tool definitions), one stable session_id, cache_control breakpoints
// per utils/promptCache — and short dynamic follow-up turns. It reports
// per-turn input/cached tokens and cache-read share, evaluates the CEO
// bar (cached_tokens > 0 on repeat turns AND >= 50% share by turn 3),
// applies the US-D2.2 fallback decision, and records the run as a dated
// JSON block in engine/phase-d-design-notes.md.
//
// Standalone use (the reliable live path — jest drags ESM proxy-agent
// baggage into live runs; see the A5.3 experiment history):
//   cd slack-agents
//   DOTENV_CONFIG_PATH=<path to .env> node engine/measure-prompt-cache.js
//     [--chain gateway|direct] [--mode full|system-only] [--turns 4]
//     [--no-record]
// With no --chain/--mode it runs the US-D2 protocol: gateway/full first;
// if the bar is missed, gateway/system-only; if the gateway chain yields
// no usage at all (or zero cached on repeats), the direct chain too.
// Exit code is 0 whenever a measurement was recorded — meeting the bar
// or not is a FINDING, not a harness failure.
'use strict';

try {
  const dotenv = require('dotenv');
  dotenv.config();
  // Worktree runs have no local .env: DOTENV_CONFIG_PATH points at the
  // live tree's, and this dotenv version does not honor the variable on a
  // bare config() call — load it explicitly. (The library reads the file;
  // no credential value is ever printed.)
  if (!process.env.LITELLM_BASE_URL && process.env.DOTENV_CONFIG_PATH) {
    dotenv.config({ path: process.env.DOTENV_CONFIG_PATH });
  }
} catch { /* env may be pre-loaded */ }

const fs = require('fs');
const path = require('path');

const litellm = require('../utils/litellm');
const promptCache = require('../utils/promptCache');
const { openAiToolDefs } = require('../utils/anthropic');
const { TOOLS } = require('../utils/agentTools');

const NOTES_PATH = path.join(__dirname, 'phase-d-design-notes.md');
const SPEC_PATH = path.join(__dirname, '..', 'EXECUTION-KERNEL-SPEC.md');

const QUESTIONS = [
  'According to the standing reference, what is the one path allowed to mark a task done? Answer in one sentence.',
  'Name one acceptance criterion for the story "Every task is a workflow". One sentence.',
  'What must happen when an agent reply contains tool-call markup as text but no recorded step invocations? One sentence.',
  'What is the evidence of record for the kernel, and what must never be the only record? One sentence.',
];

// The stable prefix: a fixed instruction header + the execution-kernel
// spec, verbatim twice (the second copy labeled as the standing reference
// — production personas plus tool schemas are of comparable size, and a
// prefix must clear provider minimum cache sizes to measure anything).
// Deterministic by construction: same bytes on every run and every turn.
function buildSystemPrompt() {
  const spec = fs.readFileSync(SPEC_PATH, 'utf8');
  return [
    'You are the MACF measurement probe, answering questions strictly from the standing reference below. Be terse. One sentence per answer unless asked otherwise.',
    '',
    '# Standing reference — Execution Kernel Specification',
    spec,
    '',
    '# Standing reference (verbatim repeat for the record)',
    spec,
  ].join('\n');
}

function approxTokens(text) {
  return Math.round(String(text).length / 4);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// One scripted multi-turn measurement on one chain in one cache mode.
async function runMeasurement({ chain = 'gateway', mode = 'full', turnCount = 4 } = {}) {
  const systemPrompt = buildSystemPrompt();
  const tools = openAiToolDefs(TOOLS);
  const sessionId = promptCache.deriveSessionId({ agentId: 'ceo', seed: `phase-d-measurement:${chain}:${mode}` });
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: QUESTIONS[0] },
  ];
  const prefixHash = promptCache.prefixHash({ messages, tools });
  const call = chain === 'direct' ? litellm.chatTurnDirect : litellm.chatTurn;
  const turns = [];
  for (let i = 0; i < turnCount; i++) {
    if (i > 0) {
      messages.push({ role: 'user', content: QUESTIONS[i % QUESTIONS.length] });
      await sleep(1500); // let any just-written cache settle before the repeat read
    }
    const started = Date.now();
    try {
      const turn = await call({
        messages, model: 'smart', maxTokens: 300, tools,
        sessionId, cacheMode: mode,
      });
      const u = turn && turn.usage ? turn.usage : null;
      turns.push({
        turn: i,
        ok: true,
        ms: Date.now() - started,
        answeredBy: (turn && turn.model) || null,
        usageReported: !!u,
        promptTokens: u ? u.promptTokens : null,
        completionTokens: u ? u.completionTokens : null,
        cachedTokens: u && u.cachedTokens !== undefined ? u.cachedTokens : (u ? 0 : null),
        cacheCreationTokens: u && u.cacheCreationTokens !== undefined ? u.cacheCreationTokens : (u ? 0 : null),
        textPreview: turn && turn.text ? String(turn.text).slice(0, 100) : null,
      });
      messages.push({ role: 'assistant', content: (turn && turn.text) || '' });
    } catch (e) {
      turns.push({ turn: i, ok: false, ms: Date.now() - started, error: String(e && e.message).slice(0, 300) });
      break; // a dead chain gives no further signal; record and stop this run
    }
  }
  const usageTurns = turns.filter(t => t.ok && t.promptTokens !== null)
    .map(t => ({ promptTokens: t.promptTokens, cachedTokens: t.cachedTokens || 0 }));
  const stats = promptCache.computeCacheStats(usageTurns);
  const bar = promptCache.evaluateCacheBar(usageTurns);
  const assessment = promptCache.assessCacheTurns(usageTurns, { prefixStable: true });
  const fallback = promptCache.decideCacheFallback({ mode, turns: usageTurns });
  return {
    chain, mode, sessionId, prefixHash,
    prefixApproxTokens: approxTokens(systemPrompt) + approxTokens(JSON.stringify(tools)),
    systemPromptChars: systemPrompt.length,
    turns, stats, bar, assessment, fallback,
  };
}

// The US-D2 protocol: measure, fall back on the record, try the other
// chain when the first yields no cache signal.
async function runLiveMeasurement({ recordTo } = {}) {
  const runs = [];
  const gatewayFull = await runMeasurement({ chain: 'gateway', mode: 'full' });
  runs.push(gatewayFull);
  const gwUsageTurns = gatewayFull.turns.filter(t => t.ok && t.promptTokens !== null);
  if (!gatewayFull.bar.meetsBar && gwUsageTurns.length >= 2) {
    runs.push(await runMeasurement({ chain: 'gateway', mode: 'system-only' }));
  }
  const gwCached = gwUsageTurns.reduce((a, t) => a + (t.cachedTokens || 0), 0);
  if (gwUsageTurns.length === 0 || gwCached === 0) {
    // The gateway route produced no cache signal at all — measure the
    // VM-direct OpenRouter chain before concluding anything about the
    // provider (the gateway may strip what OpenRouter would honor).
    runs.push(await runMeasurement({ chain: 'direct', mode: 'full' }));
  }
  const anyBar = runs.some(r => r.bar && r.bar.meetsBar);
  const anyCached = runs.some(r => r.stats && r.stats.totalCachedTokens > 0);
  const result = {
    experiment: 'US-D2 live cache measurement',
    at: new Date().toISOString(),
    gatewayConfigured: litellm.isConfigured(),
    runs,
    conclusion: anyBar
      ? 'CEO bar MET on at least one measured run (see runs[]).'
      : anyCached
        ? 'Cached tokens observed but the CEO bar (repeat hits AND >=50% share by turn 3) was NOT met on any run — see per-run bar/fallback records.'
        : 'NO cached tokens observed on any run/chain — caching is not being honored as wired; see per-run records and the design note analysis.',
  };
  const target = recordTo || NOTES_PATH;
  const header = fs.existsSync(target) ? '' : '# Phase D design notes — prompt caching, measured (#789)\n\n';
  fs.appendFileSync(target,
    `${header}\n<!-- US-D2 live cache measurement ${result.at} -->\n## US-D2 live cache measurement — ${result.at}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
  return result;
}

function printRun(run) {
  console.log(`\n— chain=${run.chain} mode=${run.mode} session=${run.sessionId} prefixHash=${String(run.prefixHash).slice(0, 12)}… prefix≈${run.prefixApproxTokens} tokens`);
  for (const t of run.turns) {
    if (!t.ok) { console.log(`  turn ${t.turn}: ERROR ${t.error}`); continue; }
    const share = t.promptTokens ? (((t.cachedTokens || 0) / t.promptTokens) * 100).toFixed(1) : 'n/a';
    console.log(`  turn ${t.turn}: prompt=${t.promptTokens} cached=${t.cachedTokens} creation=${t.cacheCreationTokens} share=${share}% completion=${t.completionTokens} by=${t.answeredBy} (${t.ms}ms)`);
  }
  console.log(`  bar: meetsBar=${run.bar.meetsBar} (${run.bar.reason})`);
  console.log(`  assessment: defect=${run.assessment.defect} flags=${JSON.stringify(run.assessment.flags)}`);
  console.log(`  fallback: mode=${run.fallback.mode} changed=${run.fallback.changed} — ${run.fallback.reason}`);
}

async function main() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const noRecord = args.includes('--no-record');
  const chain = get('--chain');
  const mode = get('--mode');
  if (chain || mode) {
    const run = await runMeasurement({
      chain: chain || 'gateway',
      mode: mode || 'full',
      turnCount: Number(get('--turns')) || 4,
    });
    printRun(run);
    if (!noRecord) {
      const result = { experiment: 'US-D2 live cache measurement (single run)', at: new Date().toISOString(), gatewayConfigured: litellm.isConfigured(), runs: [run] };
      const header = fs.existsSync(NOTES_PATH) ? '' : '# Phase D design notes — prompt caching, measured (#789)\n\n';
      fs.appendFileSync(NOTES_PATH, `${header}\n<!-- US-D2 live cache measurement ${result.at} -->\n## US-D2 live cache measurement — ${result.at}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
      console.log(`\nrecorded to ${NOTES_PATH}`);
    }
    return;
  }
  const result = await runLiveMeasurement({ recordTo: noRecord ? '/dev/null' : NOTES_PATH });
  for (const run of result.runs) printRun(run);
  console.log(`\nCONCLUSION: ${result.conclusion}`);
  if (!noRecord) console.log(`recorded to ${NOTES_PATH}`);
}

if (require.main === module) {
  main().catch(e => { console.error('measurement harness failed:', e && e.message); process.exit(1); });
}

module.exports = { runMeasurement, runLiveMeasurement, buildSystemPrompt };
