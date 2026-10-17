// utils/promptCache.js — Prompt caching for the team LLM path (Phase D,
// Vikunja #789, US-D1 + US-D2).
//
// Every turn re-sends the whole conversation; without caching, the stable
// prefix (system prompt + tool definitions + the task context that heads
// every delegation) is re-paid at full price and latency on every call.
// This module is the cache layer, in three parts:
//
//   1. REQUEST CONSTRUCTION (US-D1). applyPromptCache() places Anthropic-
//      style cache_control breakpoints (ephemeral, 1-hour TTL tier) on the
//      stable prefix: the system message, the last tool definition, and
//      the stable conversation head. Dynamic content (everything after the
//      head) is never marked. Providers that ignore the markers (OpenAI-
//      style automatic caching, DeepSeek) treat them as a no-op — the
//      same construction is safe on every route. deriveSessionId() gives
//      each delegation ONE stable session_id so OpenRouter sticky routing
//      can keep the delegation on one provider instance; it is a pure
//      function of the delegation's identity (no timestamps, no random —
//      an id that changed per call would defeat the stickiness it exists
//      for). prefixHash() fingerprints the stable prefix so a changed
//      system prompt or tool set provably rebuilds the layout (US-D1.3).
//
//   2. USAGE PARSING (US-D2.1). parseUsage() normalizes every provider
//      usage shape (OpenAI prompt_tokens_details.cached_tokens, DeepSeek
//      prompt_cache_hit_tokens, Anthropic cache_read/cache_creation input
//      tokens) into { promptTokens, completionTokens, cachedTokens,
//      cacheCreationTokens }. Anthropic's input_tokens EXCLUDES cache
//      reads, so the normalized promptTokens there is the TOTAL input —
//      the only way cache-read shares are comparable across providers.
//
//   3. MEASUREMENT (US-D2.2/D2.3). computeCacheStats() computes per-turn
//      and total cache-read shares; evaluateCacheBar() applies the CEO's
//      pinned bar (cached_tokens > 0 on repeat turns AND >= 50% share by
//      turn 3); assessCacheTurns() flags zero-cache-on-repeat as a defect;
//      decideCacheFallback() makes the recorded system-only fallback
//      decision when measurement says non-system breakpoints are not
//      honored or the bar is missed. Caching is accepted on these numbers,
//      never on documentation.
//
// Pure functions throughout: no I/O, no clocks, no randomness — the same
// inputs always produce the same layout, id, hash, and verdict.
'use strict';

const crypto = require('crypto');

// The 1-hour TTL tier (US-D1.1). Anthropic's ephemeral default is 5
// minutes; delegations run far longer, so the marker asks for 1h.
const CACHE_TTL = '1h';

function cacheControlMarker() {
  return { type: 'ephemeral', ttl: CACHE_TTL };
}

function deepCopy(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function sanitizeIdPart(s) {
  return String(s).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Session identity (US-D1.2) ─────────────────────────────────────────────
// Scope precedence: runId (one delegation attempt) > taskId (the durable
// unit of work) > a hash of the seed text (the task context, when no ids
// exist). A runId is already globally unique, so the run scope needs no
// agent namespace — the run IS the delegation, and every call made for it
// (by whichever worker picks it up) must land on the same session. The
// task and seed scopes keep the agent namespace: one task can be worked
// by different agents across delegations, and their prefixes (personas)
// differ, so their sessions must too. Nothing usable -> null, and
// callers then skip cache wiring.
function deriveSessionId({ agentId, taskId, runId, seed } = {}) {
  if (runId !== undefined && runId !== null && runId !== '') {
    return `macf:run:${sanitizeIdPart(runId)}`;
  }
  const agent = sanitizeIdPart(agentId || 'agent') || 'agent';
  let scope = null;
  if (taskId !== undefined && taskId !== null && taskId !== '') {
    scope = `task:${sanitizeIdPart(taskId)}`;
  } else if (seed) {
    scope = `seed:${crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 16)}`;
  }
  if (!scope) return null;
  return `macf:${agent}:${scope}`;
}

// ─── Stable-prefix extraction + fingerprint (US-D1.1/D1.3) ──────────────────

function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b && typeof b === 'object' && typeof b.text === 'string')
      .map(b => b.text)
      .join('');
  }
  return '';
}

function findSystemIndex(messages) {
  return (messages || []).findIndex(m => m && m.role === 'system');
}

// The stable head: the first user message after the system message, or —
// on the native-loop wire shape, which carries no system message — the
// first user message (the task context, byte-stable across the turns of
// one delegation). -1 when there is no markable head.
function findHeadIndex(messages, sysIdx) {
  const list = messages || [];
  const from = sysIdx >= 0 ? sysIdx + 1 : 0;
  for (let i = from; i < list.length; i++) {
    if (list[i] && list[i].role === 'user') return i;
  }
  return -1;
}

function stripMarkers(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map(t => {
    if (!t || typeof t !== 'object') return t;
    const { cache_control, ...rest } = t;
    return rest;
  });
}

// Fingerprint of the STABLE PREFIX ONLY: system text + head text + tool
// definitions (markers stripped). Everything after the head is dynamic
// and excluded, so equal prefixes hash equal on every turn of a
// conversation, while any change to the system prompt or the tool set —
// the inputs the layout is built from — produces a different hash.
function prefixHash({ systemPrompt, tools, messages } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const sysIdx = findSystemIndex(list);
  const headIdx = findHeadIndex(list, sysIdx);
  const systemText = sysIdx >= 0
    ? contentText(list[sysIdx].content)
    : (typeof systemPrompt === 'string' ? systemPrompt : '');
  const headText = headIdx >= 0 ? contentText(list[headIdx].content) : '';
  const canonical = JSON.stringify({ system: systemText, head: headText, tools: stripMarkers(tools) });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─── Request construction (US-D1.1) ─────────────────────────────────────────

function markMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.content === 'string') {
    msg.content = [{ type: 'text', text: msg.content, cache_control: cacheControlMarker() }];
    return true;
  }
  if (Array.isArray(msg.content) && msg.content.length) {
    const last = msg.content[msg.content.length - 1];
    if (last && typeof last === 'object') {
      last.cache_control = cacheControlMarker();
      return true;
    }
  }
  return false;
}

// Build the cache-annotated request parts. Returns NEW message/tool
// arrays — the caller's arrays are never mutated (the delegation loop
// reuses its message array across turns; mutating it would corrupt the
// conversation and the Phase A checkpoints taken from it).
//
// mode 'full':        system + last tool + head breakpoints.
// mode 'system-only': the system breakpoint only (US-D2.2 fallback).
// mode 'off':         nothing marked, session dropped.
function applyPromptCache({ messages, tools, sessionId, mode } = {}) {
  const m = mode || 'full';
  const inMessages = Array.isArray(messages) ? messages : [];
  const hash = prefixHash({ messages: inMessages, tools });
  if (m === 'off') {
    return { messages: deepCopy(inMessages), tools: deepCopy(tools), sessionId: null, prefixHash: hash, breakpoints: [] };
  }
  const outMessages = deepCopy(inMessages);
  const outTools = deepCopy(tools);
  const breakpoints = [];
  const sysIdx = findSystemIndex(outMessages);
  const headIdx = findHeadIndex(outMessages, sysIdx);
  if (sysIdx >= 0 && markMessage(outMessages[sysIdx])) {
    breakpoints.push({ at: 'system', index: sysIdx });
  }
  if (m === 'full') {
    if (Array.isArray(outTools) && outTools.length) {
      const last = outTools[outTools.length - 1];
      if (last && typeof last === 'object') {
        last.cache_control = cacheControlMarker();
        breakpoints.push({ at: 'tools' });
      }
    }
    if (headIdx >= 0 && headIdx !== sysIdx && markMessage(outMessages[headIdx])) {
      breakpoints.push({ at: 'head', index: headIdx });
    }
  }
  return { messages: outMessages, tools: outTools, sessionId: sessionId || null, prefixHash: hash, breakpoints };
}

// ─── Usage parsing (US-D2.1) ────────────────────────────────────────────────

function num(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : undefined;
}

// Normalize a provider usage block into
// { promptTokens, completionTokens, cachedTokens, cacheCreationTokens },
// or undefined when the provider reported no usage at all (callers then
// keep the field absent, exactly as before Phase D).
function parseUsage(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  // Already normalized (our own shape) — pass through.
  if (num(raw.promptTokens) !== undefined || num(raw.completionTokens) !== undefined) {
    return {
      promptTokens: num(raw.promptTokens) || 0,
      completionTokens: num(raw.completionTokens) || 0,
      cachedTokens: num(raw.cachedTokens) || 0,
      cacheCreationTokens: num(raw.cacheCreationTokens) || 0,
    };
  }
  // OpenAI-style (also LiteLLM's normalized gateway shape and OpenRouter).
  if (num(raw.prompt_tokens) !== undefined || num(raw.completion_tokens) !== undefined) {
    const details = (raw.prompt_tokens_details && typeof raw.prompt_tokens_details === 'object')
      ? raw.prompt_tokens_details : {};
    const cached = num(raw.prompt_cache_hit_tokens) !== undefined
      ? num(raw.prompt_cache_hit_tokens) // DeepSeek native field name
      : (num(details.cached_tokens) || 0);
    return {
      promptTokens: num(raw.prompt_tokens) || 0,
      completionTokens: num(raw.completion_tokens) || 0,
      cachedTokens: cached,
      cacheCreationTokens: 0,
    };
  }
  // Anthropic native: input_tokens excludes cache reads/creations, so the
  // normalized prompt total adds them back (see header).
  if (num(raw.input_tokens) !== undefined || num(raw.output_tokens) !== undefined ||
      num(raw.cache_read_input_tokens) !== undefined || num(raw.cache_creation_input_tokens) !== undefined) {
    const read = num(raw.cache_read_input_tokens) || 0;
    const creation = num(raw.cache_creation_input_tokens) || 0;
    return {
      promptTokens: (num(raw.input_tokens) || 0) + read + creation,
      completionTokens: num(raw.output_tokens) || 0,
      cachedTokens: read,
      cacheCreationTokens: creation,
    };
  }
  return undefined;
}

// ─── Measurement (US-D2.1 / D2.2 / D2.3) ────────────────────────────────────

function computeCacheStats(turns) {
  const list = Array.isArray(turns) ? turns : [];
  const perTurn = list.map(t => {
    const promptTokens = Number(t && t.promptTokens) || 0;
    const cachedTokens = Number(t && t.cachedTokens) || 0;
    return { promptTokens, cachedTokens, share: promptTokens > 0 ? cachedTokens / promptTokens : 0 };
  });
  const totalPromptTokens = perTurn.reduce((a, t) => a + t.promptTokens, 0);
  const totalCachedTokens = perTurn.reduce((a, t) => a + t.cachedTokens, 0);
  return {
    perTurn,
    totalPromptTokens,
    totalCachedTokens,
    totalShare: totalPromptTokens > 0 ? totalCachedTokens / totalPromptTokens : 0,
    turnCount: perTurn.length,
  };
}

// The CEO-pinned acceptance bar (Oct 16, 2026): cached_tokens > 0 on
// repeat turns AND cache-read share >= 50% of input tokens by turn 3.
function evaluateCacheBar(turns, { minShare = 0.5 } = {}) {
  const stats = computeCacheStats(turns);
  const cachedPositive = stats.perTurn.some((t, i) => i >= 1 && t.cachedTokens > 0);
  const turn3Share = stats.perTurn.length >= 3 ? stats.perTurn[2].share : null;
  const meetsBar = cachedPositive && turn3Share !== null && turn3Share >= minShare;
  let reason;
  if (meetsBar) reason = `bar met: cached tokens on repeat turns and turn-3 cache-read share ${(turn3Share * 100).toFixed(1)}% >= ${(minShare * 100).toFixed(0)}%`;
  else if (!cachedPositive) reason = 'no cached tokens reported on any repeat turn';
  else if (turn3Share === null) reason = 'fewer than 3 turns measured — the bar is a turn-3 bar';
  else reason = `turn-3 cache-read share ${(turn3Share * 100).toFixed(1)}% is below the ${(minShare * 100).toFixed(0)}% bar`;
  return { meetsBar, cachedPositive, turn3Share, minShare, reason };
}

// US-D2.3: with an unchanged stable prefix inside the TTL, a repeat turn
// reporting ZERO cached tokens is a caching defect — flagged, never
// silently accepted. A cold first turn is expected and not flagged. When
// the prefix was NOT stable, zero cache is explained and not a defect.
function assessCacheTurns(turns, { prefixStable = true } = {}) {
  const flags = [];
  if (prefixStable) {
    const list = Array.isArray(turns) ? turns : [];
    list.forEach((t, i) => {
      if (i < 1) return;
      const promptTokens = Number(t && t.promptTokens) || 0;
      const cachedTokens = Number(t && t.cachedTokens) || 0;
      if (promptTokens > 0 && cachedTokens === 0) {
        flags.push({ type: 'ZERO_CACHE_ON_REPEAT', turn: i });
      }
    });
  }
  return { flags, defect: flags.length > 0 };
}

// US-D2.2: the recorded fallback decision. When full breakpoints measure
// as not honored (zero cached on repeats) or below the bar, the
// configuration falls back to system-only breakpoints and re-measures;
// the decision carries the measured share that caused it.
function decideCacheFallback({ mode = 'full', turns } = {}) {
  const stats = computeCacheStats(turns);
  if (mode !== 'full') {
    return {
      mode, changed: false, measuredShare: stats.totalShare,
      reason: `already in '${mode}' mode — no fallback to make; measured share recorded`,
    };
  }
  if (stats.turnCount < 2) {
    return {
      mode: 'full', changed: false, measuredShare: stats.totalShare,
      reason: 'insufficient measurement: no repeat turns yet — a fallback decision needs at least one repeat call',
    };
  }
  const bar = evaluateCacheBar(turns);
  if (bar.meetsBar) {
    return {
      mode: 'full', changed: false, measuredShare: bar.turn3Share,
      reason: `full breakpoints honored — ${bar.reason}`,
    };
  }
  if (stats.totalCachedTokens === 0) {
    return {
      mode: 'system-only', changed: true, measuredShare: 0,
      reason: 'zero cached tokens on repeat turns with full breakpoints — non-system breakpoints not honored on this route; falling back to system-only breakpoints and re-measuring',
    };
  }
  return {
    mode: 'system-only', changed: true, measuredShare: bar.turn3Share !== null ? bar.turn3Share : stats.totalShare,
    reason: `cache-read share below the bar with full breakpoints (${bar.reason}); falling back to system-only breakpoints and re-measuring`,
  };
}

module.exports = {
  CACHE_TTL,
  cacheControlMarker,
  deriveSessionId,
  prefixHash,
  applyPromptCache,
  parseUsage,
  computeCacheStats,
  evaluateCacheBar,
  assessCacheTurns,
  decideCacheFallback,
};
