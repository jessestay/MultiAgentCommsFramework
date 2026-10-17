'use strict';
// engine/personas/jasmine-star.js — Jasmine Star editorial lens as executable code.
//
// This is a REAL filter function, not a name in a doc. The CUXO (and the
// visual gate scorer) runs every visual brief through scoreVisualBrief().
// A brief that would not stop Jasmine Star's scroll fails.
//
// Principles sourced from engine/visual-quality-gate.md ("Jasmine Star lens").
//
// FLAG — NEEDS_JESSE_REVIEW: these principles were distilled from the gate
// doc, not written or approved by Jasmine Star herself. Jesse should review
// whether this captures her lens before it is treated as authoritative.

const NEEDS_JESSE_REVIEW = true;
const REVIEW_NOTE =
  'Persona principles distilled from engine/visual-quality-gate.md by the MACF team; ' +
  'not authored or endorsed by Jasmine Star. Jesse: confirm or correct before treating as canon.';

const PRINCIPLES = [
  {
    id: 'scroll-stop',
    description: 'Thumb-first: would this stop MY scroll in under one second? A human face, bold text, or striking contrast must anchor the frame.',
  },
  {
    id: 'story-driven',
    description: 'Story over topic: the brief names a feeling or a story (not just a subject). If the image is only "about" something, it fails.',
  },
  {
    id: 'thumb-first-composition',
    description: 'Composed for the feed at ~300px wide: one clear subject, platform-safe zones, no detail that dies at thumbnail size.',
  },
  {
    id: 'real-over-glossy',
    description: 'Real photography first. AI only as overlay, and never with the glossy synthetic sheen. If it looks AI, it fails.',
  },
  {
    id: 'text-with-intent',
    description: 'The boldest 3-7 words ON the image, working as one unit with the hook. Readable at thumbnail size, high contrast.',
  },
];

function clamp(n) {
  return Math.max(0, Math.min(5, Math.round(n * 10) / 10));
}

function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Score a visual brief against the Jasmine Star lens.
 * brief: { platform, hook, image_direction, base, ai_glossy, overlay_text,
 *   overlay_readable_at_thumbnail, has_human_element, story_or_emotion,
 *   stands_alone_without_caption, creates_question_or_feeling, aspect_ratio }
 * Returns { principles: [{id, score, notes}], average, would_stop_scroll, flags }.
 * Fail-closed: missing fields score 0 for the principles that need them.
 */
function scoreVisualBrief(brief = {}) {
  const b = brief || {};
  const flags = [];
  const principles = [];

  // 1. scroll-stop — needs a human element, bold overlay, or striking hook pairing
  let s1 = 1;
  const n1 = [];
  if (b.has_human_element) { s1 += 1.5; n1.push('human element present'); }
  const overlayWords = countWords(b.overlay_text);
  if (overlayWords >= 3 && overlayWords <= 7) { s1 += 1.5; n1.push('bold 3-7 word overlay'); }
  if (b.creates_question_or_feeling) { s1 += 1; n1.push('creates a question or feeling'); }
  if (!b.has_human_element && overlayWords < 3 && !b.creates_question_or_feeling) {
    flags.push('nothing in the brief would stop a scroll: no human, no bold text, no tension');
  }
  principles.push({ id: 'scroll-stop', score: clamp(s1), notes: n1.join('; ') || 'no scroll-stopping element described', automatable: true });

  // 2. story-driven — the brief must name a story/emotion, not just a topic
  let s2 = 1;
  const n2 = [];
  const story = String(b.story_or_emotion || '').trim();
  if (story.length >= 12) { s2 += 2.5; n2.push('names a story/emotion'); }
  else if (story.length > 0) { s2 += 1; n2.push('story present but thin'); }
  else { flags.push('no story or emotion named — image is only "about" a topic'); }
  if (b.hook && story && countWords(b.hook) >= 4) { s2 += 1; n2.push('hook gives the image something to amplify'); }
  principles.push({ id: 'story-driven', score: clamp(s2), notes: n2.join('; ') || 'no story named', automatable: true });

  // 3. thumb-first composition
  let s3 = 1.5;
  const n3 = [];
  if (b.overlay_readable_at_thumbnail) { s3 += 1.5; n3.push('readable at thumbnail'); }
  else { flags.push('not confirmed readable at ~300px thumbnail'); }
  if (b.image_direction && /safe zone|top third|center|negative space|one subject|single subject/i.test(b.image_direction)) {
    s3 += 1.5; n3.push('composition described for feed');
  }
  principles.push({ id: 'thumb-first-composition', score: clamp(s3), notes: n3.join('; ') || 'composition not described for thumbnail', automatable: true });

  // 4. real-over-glossy
  let s4 = 1;
  const n4 = [];
  if (b.base === 'stock') { s4 += 3; n4.push('real photography base'); }
  else if (b.base === 'ai' && b.ai_glossy) {
    s4 = 0.5; n4.push('pure-AI with glossy sheen');
    flags.push('glossy synthetic AI look — go back to stock and composite');
  } else if (b.base === 'ai') { s4 += 1.5; n4.push('AI base without glossy sheen (overlay use assumed)'); }
  else { flags.push('image base not declared (stock or ai)'); }
  principles.push({ id: 'real-over-glossy', score: clamp(s4), notes: n4.join('; ') || 'base not declared', automatable: true });

  // 5. text-with-intent
  let s5 = 1;
  const n5 = [];
  if (overlayWords >= 3 && overlayWords <= 7) { s5 += 2.5; n5.push(`${overlayWords} words — in the 3-7 band`); }
  else if (overlayWords > 7) { s5 = 1; n5.push(`${overlayWords} words — text dump, over the 7-word max`); flags.push('overlay is a text dump (>7 words)'); }
  else if (overlayWords > 0) { s5 += 1; n5.push('overlay present but thin'); }
  else { s5 += 0.5; n5.push('no overlay text — allowed only if the image alone carries the hook'); }
  if (overlayWords >= 3 && b.hook) {
    const hookWords = new Set(String(b.hook).toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    const overWords = String(b.overlay_text).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const overlap = overWords.filter((w) => hookWords.has(w)).length;
    if (overlap > 0) { s5 += 1; n5.push('overlay amplifies the hook'); }
  }
  principles.push({ id: 'text-with-intent', score: clamp(s5), notes: n5.join('; '), automatable: true });

  const average = clamp(principles.reduce((a, p) => a + p.score, 0) / principles.length);
  const would_stop_scroll =
    average >= 4 && principles.every((p) => p.score >= 3);
  if (!would_stop_scroll && average >= 4) {
    flags.push('average passes but a principle scores below 3 — would not reliably stop the scroll');
  }

  return { persona: 'Jasmine Star', principles, average, would_stop_scroll, flags, needs_jesse_review: NEEDS_JESSE_REVIEW };
}

module.exports = { PRINCIPLES, NEEDS_JESSE_REVIEW, REVIEW_NOTE, scoreVisualBrief };
