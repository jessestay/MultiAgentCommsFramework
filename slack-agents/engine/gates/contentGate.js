'use strict';
// engine/gates/contentGate.js — the content quality gate as executable code.
//
// Rule source: engine/content-quality-gate.md (rules 0-7).
// scoreContent(draft) -> { verdict: 'PASS'|'REJECT', average, rules: [...], failures, schema_errors }
// Fail-closed: schema errors => REJECT. Any rule < 4 => REJECT. Average < 4 => REJECT.
//
// Scoring methods are honest about what they are:
//   'deterministic' — checkable fact (schema, word counts, URL validity, platform map).
//   'heuristic'     — stylistic proxy (opinion lexicon, voice markers). A heuristic
//                     PASS is a screen, not a verdict on quality; the human approver
//                     (Jesse) remains the final judge. Heuristic rules are marked as
//                     such in the output so nobody mistakes them for real judgment.

const PLATFORMS = ['LinkedIn', 'Facebook', 'Instagram', 'X', 'TikTok', 'Blog', 'YouTube'];

// Jesse's standing persona assignments (content-quality-gate.md rule 4).
const PERSONA_MAP = {
  LinkedIn: ['Justin Welsh', 'Ryan Holiday'],
  Facebook: ['Mari Smith', 'Ryan Holiday'],
  Instagram: ['Brock Johnson'],
  X: ['Dickie Bush'],
  TikTok: ['Brendan Kane'],
  Blog: ['Neil Patel', 'Ryan Holiday'],
  YouTube: ['Derral Eves', 'Ryan Holiday'],
};

// Signature markers that make a persona VISIBLE in the text (rule 4).
const PERSONA_MARKERS = {
  'Ryan Holiday': ['contrarian', 'timeless', 'human nature', 'ego', 'stillness', 'memento mori', 'obstacle'],
  'Justin Welsh': ['operating', 'system', 'playbook', 'operator', 'in practice', "here's how", 'here is how'],
  'Mari Smith': ['conversation', 'community', 'relationship', 'comment below', 'engage'],
  'Brock Johnson': ['reel', 'hook', 'scroll', 'visual'],
  'Dickie Bush': ['thread', 'ship', 'punchy'],
  'Brendan Kane': ['hook point', 'pattern interrupt', 'retention'],
  'Neil Patel': ['search intent', 'keyword', 'rank', 'seo', 'traffic'],
  'Derral Eves': ['packaging', 'open loop', 'thumbnail', 'cta', 'retention'],
  'Nick Saraev': ['automation', 'workflow', 'agent'],
};

const FORMATS = ['text-post', 'carousel', 'video-script', 'image-caption', 'longform-outline'];

const BANNED_OPENERS = [
  'in this post', 'here are', 'did you know', "it's worth noting", 'it is worth noting',
  'that sentence should not work', 'furthermore,', 'in conclusion', 'as an ai',
];

const OPINION_MARKERS = [
  'i think', 'i believe', "isn't", "aren't", 'is a lie', 'are a lie', 'never', 'always',
  'worst', 'best', 'dead', 'broken', 'scam', 'myth', 'wrong', 'backwards', 'my take',
  'honest', 'confess', 'nobody mentions', 'nobody tells you',
];

const SLOP_WORDS = ['delve', 'leverage', 'game-changer', 'game changer', 'unlock', 'elevate', 'furthermore', 'tapestry', 'landscape'];

const GETTABLE_HINTS = ['get it', 'buy it', 'download', 'read the', 'the paper', 'gadget', 'tool i use', 'try it', 'sign up'];

function clamp(n) {
  return Math.max(0, Math.min(5, Math.round(n * 10) / 10));
}
function words(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean);
}
function lower(s) { return String(s || '').toLowerCase(); }
function firstSentence(s) {
  const m = String(s || '').trim().match(/^[^.!?]+[.!?]/);
  return m ? m[0] : String(s || '').trim().slice(0, 160);
}
function validUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch { return false; }
}

function validateSchema(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return ['draft must be an object'];
  if (!d.hook || !String(d.hook).trim()) errors.push('hook is required');
  if (!d.body || !String(d.body).trim()) errors.push('body is required');
  if (!PLATFORMS.includes(d.platform)) errors.push(`platform must be one of: ${PLATFORMS.join(', ')}`);
  if (!FORMATS.includes(d.format)) errors.push(`format must be one of: ${FORMATS.join(', ')}`);
  if (d.persona !== undefined && (typeof d.persona !== 'string' || !d.persona.trim())) {
    errors.push('persona must be a non-empty string when provided');
  }
  // NOTE: persona-vs-platform MAP conformance is a semantic check done by the
  // expert-lens rule (ruleLens), not a schema error — it must surface as a
  // rule failure so the rewrite guidance names the lens problem.
  if (!Array.isArray(d.mcp_tools_used)) errors.push('mcp_tools_used must be an array (attested list of MCP tools used)');
  if (typeof d.visuals_routed_via_cuxo !== 'boolean') errors.push('visuals_routed_via_cuxo must be a boolean');
  if (d.links !== undefined && !Array.isArray(d.links)) errors.push('links must be an array');
  return errors;
}

function rule(id, name, score, notes, method, extra = {}) {
  return { id, name, score: clamp(score), max: 5, method, notes, automatable: true, ...extra };
}

// Rule 0 — bold-opinion hook (heuristic)
function scoreHook(d) {
  const h = lower(d.hook);
  const n = words(d.hook).length;
  let s = 2; const notes = [];
  if (n >= 4 && n <= 30) { s += 1; notes.push('hook length in band'); }
  else notes.push(`hook is ${n} words (want 4-30)`);
  for (const b of BANNED_OPENERS) {
    if (h.includes(b)) { s = 1; notes.push(`banned neutral opener: "${b}"`); }
  }
  const hits = OPINION_MARKERS.filter((m) => h.includes(m));
  if (hits.length > 0) { s += 1.5; notes.push(`opinion markers: ${hits.slice(0, 3).join(', ')}`); }
  else notes.push('no opinion marker detected');
  // The hook must contain the opinion, not just tease it: keyword overlap with body.
  const hookKeys = new Set(h.split(/\W+/).filter((w) => w.length > 4));
  const bodyLow = lower(d.body);
  const overlap = [...hookKeys].filter((w) => bodyLow.includes(w)).length;
  if (overlap >= 2) { s += 0.5; notes.push('opinion carried into the body'); }
  return rule('hook', 'Bold-opinion hook', s, notes.join('; '), 'heuristic');
}

// Rule 1 — reader-value test (heuristic + deterministic)
function ruleReaderValue(d) {
  const b = lower(d.body);
  let s = 1.5; const notes = [];
  const links = Array.isArray(d.links) ? d.links : [];
  const hasLink = links.length > 0 || /https?:\/\//.test(d.body);
  const hasNumber = /\d/.test(d.body);
  const hasTakeaway = /(my take|do this|start with|here is how|here's how|choose|act accordingly)/.test(b);
  if (hasLink) { s += 1.5; notes.push('includes a link'); }
  if (hasNumber) { s += 1; notes.push('includes concrete numbers'); }
  if (hasTakeaway) { s += 1; notes.push('lands a takeaway/decision'); }
  const questions = (d.body.match(/\?/g) || []).length;
  if (questions > 0 && !hasLink && !hasNumber) {
    s -= 1.5; notes.push(`${questions} question(s) raised with no link/number answering them`);
  }
  if (!hasLink && !hasNumber && !hasTakeaway) notes.push('reader leaves with nothing concrete');
  return rule('reader-value', 'Reader-value test', s, notes.join('; ') || 'no reader value detected', 'heuristic');
}

// Rule 2 — bold open, Jesse's opinion first (heuristic)
function ruleBoldOpen(d) {
  const first = lower(firstSentence(d.body));
  let s = 2.5; const notes = [];
  for (const banned of BANNED_OPENERS) {
    if (first.includes(banned)) { s = 1; notes.push(`throat-clearing opener: "${banned}"`); }
  }
  if (/^(the|a|an) \w+ is (a|the) /.test(first) && !OPINION_MARKERS.some((m) => first.includes(m))) {
    s -= 1; notes.push('opens with a definition');
  }
  if (OPINION_MARKERS.some((m) => first.includes(m)) || /^(i|my|here)/.test(first)) {
    s += 1.5; notes.push('opens with a stake/opinion');
  }
  return rule('bold-open', "Bold open, Jesse's opinion first", s, notes.join('; ') || 'neutral open', 'heuristic');
}

// Rule 3 — emotion and voice (heuristic)
function ruleVoice(d) {
  const b = d.body;
  const bl = lower(b);
  let s = 2; const notes = [];
  if (/\b(i|my|me)\b/i.test(b)) { s += 1; notes.push('first-person stake'); }
  const sentences = b.split(/[.!?]+/).map((x) => x.trim()).filter(Boolean);
  const lens = sentences.map((x) => words(x).length);
  if (lens.length > 2) {
    const mean = lens.reduce((a, x) => a + x, 0) / lens.length;
    const variance = lens.reduce((a, x) => a + (x - mean) ** 2, 0) / lens.length;
    if (variance > 20) { s += 0.75; notes.push('varied sentence length'); }
    else notes.push('flat sentence rhythm');
  }
  const slop = SLOP_WORDS.filter((w) => bl.includes(w));
  if (slop.length) { s -= 1.5; notes.push(`corporate slop: ${slop.join(', ')}`); }
  const last = sentences[sentences.length - 1] || '';
  if (words(last).length <= 14 && words(last).length >= 3) { s += 0.75; notes.push('aphoristic closer'); }
  return rule('emotion-voice', 'Emotion and voice', s, notes.join('; ') || 'flat', 'heuristic');
}

// Rule 4 — expert lens check (deterministic map + heuristic visibility)
function ruleLens(d) {
  const notes = [];
  let s = 2;
  const allowed = PERSONA_MAP[d.platform] || [];
  if (!d.persona) { return rule('expert-lens', 'Expert lens check', 1, 'no persona assigned', 'deterministic'); }
  if (!allowed.includes(d.persona)) {
    return rule('expert-lens', 'Expert lens check', 1, `persona "${d.persona}" not in map for ${d.platform}`, 'deterministic');
  }
  s += 1; notes.push(`persona "${d.persona}" matches ${d.platform} map`);
  const markers = PERSONA_MARKERS[d.persona] || [];
  const text = lower(d.hook + ' ' + d.body);
  const hits = markers.filter((m) => text.includes(m));
  if (hits.length > 0) { s += 2; notes.push(`lens visible: ${hits.slice(0, 3).join(', ')}`); }
  else { s -= 1; notes.push('lens claimed but no signature marker found in the text'); }
  return rule('expert-lens', 'Expert lens check', s, notes.join('; '), 'heuristic');
}

// Rule 5 — practical links (deterministic)
function ruleLinks(d) {
  const links = Array.isArray(d.links) ? d.links : [];
  const inBody = (d.body.match(/https?:\/\/\S+/g) || []);
  const all = [...links, ...inBody];
  let s = 3; const notes = [];
  const mentionsThing = GETTABLE_HINTS.some((h) => lower(d.body + ' ' + d.hook).includes(h));
  if (all.length === 0) {
    if (mentionsThing) { s = 1; notes.push('mentions a gettable thing with no link'); }
    else { s = 4; notes.push('no gettable thing mentioned; no link required'); }
  } else {
    const bad = all.filter((u) => !validUrl(u));
    if (bad.length) { s = 1.5; notes.push(`malformed/invented URLs: ${bad.slice(0, 2).join(', ')}`); }
    else { s = 5; notes.push(`${all.length} well-formed link(s) (live verification still required before publish)`); }
  }
  return rule('links', 'Practical links', s, notes.join('; '), 'deterministic');
}

// Rule 6 — format, not just text (deterministic)
function ruleFormat(d) {
  let s = 3; const notes = [];
  const needsVisual = ['carousel', 'video-script', 'image-caption'].includes(d.format);
  if (needsVisual) {
    if (d.image_direction && String(d.image_direction).trim().length >= 10) {
      s = 5; notes.push('format declared with image direction');
      if (!/\d+:\d+/.test(d.image_direction)) { s = 3.5; notes.push('image direction missing aspect ratio'); }
    } else { s = 1; notes.push(`${d.format} format with no image direction`); }
  } else {
    s = 5; notes.push(`format "${d.format}" declared; no visual required`);
  }
  return rule('format', 'Format, not just text', s, notes.join('; '), 'deterministic');
}

// Rule 7 — MCP tools used (deterministic on attestation)
function ruleMcp(d) {
  const tools = Array.isArray(d.mcp_tools_used) ? d.mcp_tools_used : [];
  let s = 2; const notes = [];
  if (tools.length > 0) { s += 1.5; notes.push(`attested tools: ${tools.join(', ')}`); }
  else notes.push('no MCP tools attested');
  const needsVisual = ['carousel', 'video-script', 'image-caption'].includes(d.format);
  if (needsVisual) {
    if (d.visuals_routed_via_cuxo) { s += 1.5; notes.push('visual routed via CUXO'); }
    else { s = 1; notes.push('visual NOT routed via CUXO — visual gate bypassed'); }
  }
  return rule('mcp-tools', 'MCP tools + CUXO routing', s, notes.join('; '),
    'deterministic',
    { notAutomatableReason: null, attested: 'Agent attests tool use; the engine cannot independently verify an agent actually called an MCP tool. Attestation is recorded for audit.' });
}

function scoreContent(draft) {
  const schema_errors = validateSchema(draft);
  if (schema_errors.length > 0) {
    return {
      verdict: 'REJECT', average: 0, rules: [], failures: ['schema'],
      schema_errors, notes: 'Fail-closed: invalid draft schema.',
    };
  }
  const rules = [
    scoreHook(draft),
    ruleReaderValue(draft),
    ruleBoldOpen(draft),
    ruleVoice(draft),
    ruleLens(draft),
    ruleLinks(draft),
    ruleFormat(draft),
    ruleMcp(draft),
  ];
  const average = clamp(rules.reduce((a, r) => a + r.score, 0) / rules.length);
  const failures = rules.filter((r) => r.score < 4).map((r) => r.id);
  const verdict = failures.length === 0 && average >= 4 ? 'PASS' : 'REJECT';
  return {
    verdict, average, rules, failures, schema_errors: [],
    notes: verdict === 'PASS'
      ? 'All 8 rules score >= 4. Heuristic passes are a screen, not a verdict — Jesse remains the final judge.'
      : `Fail-closed: failing rules: ${failures.join(', ')} (avg ${average}). Rewrite, never present as-is.`,
  };
}

module.exports = { scoreContent, PLATFORMS, PERSONA_MAP, FORMATS };
