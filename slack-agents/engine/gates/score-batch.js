#!/usr/bin/env node
'use strict';
// engine/gates/score-batch.js — batch choke point for the weekly content worker.
//
// Usage: node engine/gates/score-batch.js drafts.json
// drafts.json: { "week_of": "2026-10-05", "drafts": [ {hook, body, platform, persona,
//   format, image_direction, mcp_tools_used, visuals_routed_via_cuxo, links, ...},
//   ... ], "visuals": [ {label, platform, base, ...}, ... ] }
//
// Scores every draft through the content gate and every visual through the
// visual gate (Jasmine Star filter wired in). Prints a per-item report.
// Exit 0: every item PASSED — the batch may proceed to post_drafts.py.
// Exit 1: any item REJECTED or any schema error — fail closed, the batch
//   must NOT post. Rewrite the failing items and re-run.
//
// The weekly content batch worker MUST run this before post_drafts.py.
// (content-quality-gate.md, Enforcement.)

const fs = require('fs');
const { scoreContent } = require('./contentGate');
const { scoreVisual } = require('./visualGate');

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node engine/gates/score-batch.js drafts.json');
    process.exit(2);
  }
  let batch;
  try {
    batch = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`cannot read ${file}: ${e.message}`);
    process.exit(2);
  }
  const drafts = Array.isArray(batch.drafts) ? batch.drafts : [];
  const visuals = Array.isArray(batch.visuals) ? batch.visuals : [];
  let failed = 0;

  console.log(`Scoring batch: ${drafts.length} draft(s), ${visuals.length} visual(s)`);
  for (const d of drafts) {
    const r = scoreContent(d);
    const tag = r.verdict === 'PASS' ? 'PASS' : 'REJECT';
    console.log(`[${tag}] draft ${d.label || '?'} (${d.platform || '?'}) avg=${r.average}` +
      (r.verdict === 'PASS' ? '' : ` failing=${r.failures.join(',')}`));
    if (r.schema_errors.length) console.log(`       schema: ${r.schema_errors.join('; ')}`);
    if (r.verdict !== 'PASS') {
      failed++;
      for (const rule of r.rules.filter((x) => x.score < 4)) {
        console.log(`       - ${rule.id}: ${rule.score}/5 [${rule.method}] ${rule.notes}`);
      }
    }
  }
  for (const v of visuals) {
    const r = scoreVisual(v);
    const tag = r.verdict === 'PASS' ? 'PASS' : 'REJECT';
    console.log(`[${tag}] visual ${v.label || '?'} (${v.platform || '?'}) avg=${r.average}` +
      (r.verdict === 'PASS' ? '' : ` failing=${r.failures.join(',')}`));
    if (r.schema_errors.length) console.log(`       schema: ${r.schema_errors.join('; ')}`);
    if (r.verdict !== 'PASS') {
      failed++;
      for (const rule of r.rules.filter((x) => x.score < 4)) {
        console.log(`       - ${rule.id}: ${rule.score}/5 [${rule.method}] ${rule.notes}`);
      }
    }
  }

  if (failed > 0) {
    console.error(`\nFAIL-CLOSED: ${failed} item(s) rejected. Batch must NOT post. Rewrite and re-run.`);
    process.exit(1);
  }
  console.log('\nAll items passed. Batch may proceed.');
}

main();
