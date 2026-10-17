'use strict';

/**
 * Shared engine-gap logger (Oct 12, 2026 — CEO mechanism repair).
 *
 * Engine gaps live in engine/.engine-gaps.json and are the CEO-visible
 * incident store the self-healer already writes to. Until now the only
 * writer was a private copy inside self-healer.js, so other components
 * (directivePoll, the LLM canary) had nowhere to raise an alarm — the
 * directive poller dead-lettered directives into its own state file and
 * said nothing, and the watchdog's desktop escalation echoed into a log
 * nobody reads. This module is the one shared writer.
 *
 * Format mirrors self-healer's logEngineGap exactly:
 *   { type, detail, timestamp, source, status: 'open' }
 * Dedupe: the same gap type is not logged twice within 24h.
 *
 * Tests isolate via MACF_GAPS_PATH pointing at a temp file.
 */

const fs = require('fs');
const path = require('path');

const GAPS_PATH = process.env.MACF_GAPS_PATH
  || path.join(__dirname, '.engine-gaps.json');

const DEDUPE_WINDOW_MS = 24 * 3600 * 1000;

function readGaps(gapsPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(gapsPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function logEngineGap(type, detail, source = 'unknown', gapsPath = GAPS_PATH) {
  try {
    const gaps = readGaps(gapsPath);
    const cutoff = Date.now() - DEDUPE_WINDOW_MS;
    const recent = gaps.filter(
      (g) => g.type === type && new Date(g.timestamp).getTime() > cutoff
    );
    if (recent.length > 0) return false;

    gaps.push({
      type,
      detail,
      timestamp: new Date().toISOString(),
      source,
      status: 'open',
    });
    fs.writeFileSync(gapsPath, JSON.stringify(gaps, null, 2));
    try { fs.chmodSync(gapsPath, 0o644); } catch {}
    return true;
  } catch {
    return false;
  }
}

module.exports = { logEngineGap, readGaps, GAPS_PATH };
