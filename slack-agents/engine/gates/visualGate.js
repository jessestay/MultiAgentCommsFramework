'use strict';
// engine/gates/visualGate.js — the visual quality gate as executable code.
//
// Rule source: engine/visual-quality-gate.md (rules 1-5).
// The Jasmine Star persona filter (engine/personas/jasmine-star.js) is WIRED IN
// as a scored dimension ('persona-filter'), not a name in a doc.
// scoreVisual(brief) -> { verdict: 'PASS'|'REJECT', average, rules, failures, schema_errors, persona }
// Fail-closed: schema errors => REJECT. Any rule < 4 => REJECT. Average < 4 => REJECT.

const jasmineStar = require('../personas/jasmine-star');

const PLATFORMS = ['LinkedIn', 'Facebook', 'Instagram', 'X', 'TikTok', 'Blog', 'YouTube'];

const RATIOS = {
  LinkedIn: ['16:9', '1:1'],
  Facebook: ['16:9', '1:1'],
  Instagram: ['1:1', '4:5', '9:16'],
  X: ['16:9', '1:1'],
  TikTok: ['9:16'],
  Blog: ['16:9'],
  YouTube: ['16:9'],
};

function clamp(n) {
  return Math.max(0, Math.min(5, Math.round(n * 10) / 10));
}
function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}
function rule(id, name, score, notes, method, extra = {}) {
  return { id, name, score: clamp(score), max: 5, method, notes, automatable: true, ...extra };
}

function validateSchema(b) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['visual brief must be an object'];
  if (!PLATFORMS.includes(b.platform)) errors.push(`platform must be one of: ${PLATFORMS.join(', ')}`);
  if (!['stock', 'ai'].includes(b.base)) errors.push('base must be "stock" or "ai"');
  if (typeof b.ai_glossy !== 'boolean') errors.push('ai_glossy must be a boolean (CUXO attests)');
  if (typeof b.overlay_readable_at_thumbnail !== 'boolean') errors.push('overlay_readable_at_thumbnail must be a boolean');
  if (typeof b.stands_alone_without_caption !== 'boolean') errors.push('stands_alone_without_caption must be a boolean');
  if (typeof b.creates_question_or_feeling !== 'boolean') errors.push('creates_question_or_feeling must be a boolean');
  if (typeof b.has_impossible_physics !== 'boolean') errors.push('has_impossible_physics must be a boolean');
  if (typeof b.has_watermark_artifacts !== 'boolean') errors.push('has_watermark_artifacts must be a boolean');
  if (!b.aspect_ratio || typeof b.aspect_ratio !== 'string') errors.push('aspect_ratio is required');
  if (!b.image_direction || !String(b.image_direction).trim()) errors.push('image_direction is required');
  return errors;
}

// Rule 1 — stock-first, AI-second (deterministic on declared metadata)
function ruleStockFirst(b) {
  if (b.base === 'stock' && !b.ai_glossy) {
    return rule('stock-first', 'Stock-first, AI-second', 5, 'real photography base', 'deterministic');
  }
  if (b.base === 'stock' && b.ai_glossy) {
    return rule('stock-first', 'Stock-first, AI-second', 2,
      'stock base but glossy AI compositing visible — recomposite', 'deterministic');
  }
  if (b.base === 'ai' && b.ai_glossy) {
    return rule('stock-first', 'Stock-first, AI-second', 0.5,
      'pure-AI render with glossy synthetic sheen — go back to stock', 'deterministic');
  }
  return rule('stock-first', 'Stock-first, AI-second', 3.5,
    'AI base without glossy sheen (overlay use); stock preferred',
    'deterministic',
    { attested: 'CUXO attests ai_glossy; the engine cannot see the image. Attestation recorded for audit.' });
}

// Rule 2 — text overlay with intent (deterministic)
function ruleTextOverlay(b) {
  const n = countWords(b.overlay_text);
  if (n === 0) {
    return rule('text-overlay', 'Text overlay with intent', 4,
      'no overlay — allowed only if the image alone carries the hook', 'deterministic');
  }
  if (n > 7) {
    return rule('text-overlay', 'Text overlay with intent', 1,
      `${n} words on the image — over the ~7 word max; one line beats two`, 'deterministic');
  }
  let s = 4; const notes = [`${n} words — in the 3-7 band`];
  if (b.overlay_readable_at_thumbnail) { s += 1; notes.push('readable at ~300px thumbnail'); }
  else { s = 1.5; notes.push('NOT readable at thumbnail size'); }
  if (String(b.overlay_contrast || '').toLowerCase() === 'high') { notes.push('high contrast'); }
  else { s -= 0.5; notes.push('contrast not declared high'); }
  return rule('text-overlay', 'Text overlay with intent', s, notes.join('; '), 'deterministic');
}

// Rule 3 — one-second attention test (attested + heuristic)
function ruleOneSecond(b) {
  let s = 2; const notes = [];
  if (b.stands_alone_without_caption) { s += 2; notes.push('works without the caption'); }
  else { s = 1; notes.push('needs its caption to make sense — fails the one-second test'); }
  if (b.creates_question_or_feeling) { s += 1; notes.push('creates a question or feeling instantly'); }
  else notes.push('creates no instant question or feeling');
  return rule('one-second', 'One-second attention test', s, notes.join('; '), 'heuristic',
    { attested: 'CUXO attests stands_alone_without_caption; heuristic screen only.' });
}

// Rule 4 — human-created look (deterministic on attestation)
function ruleHumanLook(b) {
  let s = 4; const notes = [];
  if (b.has_impossible_physics) { s = 0.5; notes.push('impossible physics — fails'); }
  if (b.has_watermark_artifacts) { s = Math.min(s, 1); notes.push('watermark-style artifacts — fails'); }
  if (!b.has_impossible_physics && !b.has_watermark_artifacts) {
    notes.push('no floating objects, no impossible physics, no artifacts attested');
    if (/grain|film|natural light|imperfection/i.test(b.image_direction || '')) {
      s = 5; notes.push('grain/imperfection/natural light preferred');
    }
  }
  return rule('human-look', 'Human-created look', s, notes.join('; '), 'deterministic',
    { attested: 'CUXO attests physics/artifacts; the engine cannot see the image.' });
}

// Rule 5 — platform-native sizing (deterministic)
function rulePlatformSize(b) {
  const allowed = RATIOS[b.platform] || [];
  if (allowed.includes(b.aspect_ratio)) {
    return rule('platform-size', 'Platform-native sizing', 5,
      `${b.aspect_ratio} is native for ${b.platform}`, 'deterministic');
  }
  return rule('platform-size', 'Platform-native sizing', 1,
    `${b.aspect_ratio} is not native for ${b.platform} (want ${allowed.join(' or ')})`, 'deterministic');
}

// Persona filter — the Jasmine Star lens, wired in as a scored dimension.
function rulePersonaFilter(b) {
  const star = jasmineStar.scoreVisualBrief(b);
  const notes = star.principles.map((p) => `${p.id}: ${p.score}`).join('; ');
  const r = rule('persona-filter', 'Jasmine Star persona filter', star.average,
    `would_stop_scroll=${star.would_stop_scroll}; ${notes}`, 'heuristic');
  r.persona_flags = star.flags;
  r.needs_jesse_review = jasmineStar.NEEDS_JESSE_REVIEW;
  return r;
}

function scoreVisual(brief) {
  const schema_errors = validateSchema(brief);
  if (schema_errors.length > 0) {
    return {
      verdict: 'REJECT', average: 0, rules: [], failures: ['schema'],
      schema_errors, persona: 'Jasmine Star', notes: 'Fail-closed: invalid visual brief schema.',
    };
  }
  const rules = [
    ruleStockFirst(brief),
    ruleTextOverlay(brief),
    ruleOneSecond(brief),
    ruleHumanLook(brief),
    rulePlatformSize(brief),
    rulePersonaFilter(brief),
  ];
  const average = clamp(rules.reduce((a, r) => a + r.score, 0) / rules.length);
  const failures = rules.filter((r) => r.score < 4).map((r) => r.id);
  const verdict = failures.length === 0 && average >= 4 ? 'PASS' : 'REJECT';
  return {
    verdict, average, rules, failures, schema_errors: [], persona: 'Jasmine Star',
    notes: verdict === 'PASS'
      ? 'All visual rules score >= 4 including the Jasmine Star persona filter.'
      : `Fail-closed: failing rules: ${failures.join(', ')} (avg ${average}). Redo, never ship as-is.`,
  };
}

module.exports = { scoreVisual, PLATFORMS, RATIOS };
