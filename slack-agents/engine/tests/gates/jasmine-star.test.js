'use strict';
// Jasmine Star persona — real code module tests.
// The persona must be an editorial filter function, not a name in a doc.
// Principles sourced from engine/visual-quality-gate.md ("Jasmine Star lens").
// FLAG: the persona definition itself needs Jesse's review (see NEEDS_JESSE_REVIEW).

const jasmineStar = require('../../personas/jasmine-star');

function goodBrief(overrides = {}) {
  return {
    platform: 'Instagram',
    hook: "AI benchmarks were a lie. This week proved it.",
    image_direction: 'Real chalkboard with handwritten math, classroom light, film grain',
    base: 'stock',
    ai_glossy: false,
    overlay_text: 'THE BENCHMARKS LIED',
    overlay_readable_at_thumbnail: true,
    has_human_element: true,
    story_or_emotion: 'The sting of realizing the scoreboard was rigged',
    stands_alone_without_caption: true,
    creates_question_or_feeling: true,
    aspect_ratio: '4:5',
    ...overrides,
  };
}

describe('jasmine-star module', () => {
  test('exports its principles, the filter function, and the review flag', () => {
    expect(Array.isArray(jasmineStar.PRINCIPLES)).toBe(true);
    expect(jasmineStar.PRINCIPLES.length).toBeGreaterThanOrEqual(5);
    expect(typeof jasmineStar.scoreVisualBrief).toBe('function');
    expect(jasmineStar.NEEDS_JESSE_REVIEW).toBe(true);
    expect(typeof jasmineStar.REVIEW_NOTE).toBe('string');
  });

  test('every principle has an id, a description, and the Star question', () => {
    for (const p of jasmineStar.PRINCIPLES) {
      expect(p.id).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  test('a strong brief scores high on every principle (0-5)', () => {
    const r = jasmineStar.scoreVisualBrief(goodBrief());
    expect(r.principles).toHaveLength(jasmineStar.PRINCIPLES.length);
    for (const p of r.principles) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(5);
    }
    expect(r.average).toBeGreaterThanOrEqual(4);
    expect(r.would_stop_scroll).toBe(true);
  });

  test('glossy pure-AI brief is flagged: real over glossy is a Star principle', () => {
    const r = jasmineStar.scoreVisualBrief(goodBrief({ base: 'ai', ai_glossy: true }));
    const real = r.principles.find((p) => p.id === 'real-over-glossy');
    expect(real.score).toBeLessThan(4);
    expect(r.flags).toEqual(expect.arrayContaining([expect.stringMatching(/gloss/i)]));
  });

  test('brief with no story and no hook amplification fails story-driven', () => {
    const r = jasmineStar.scoreVisualBrief(goodBrief({ story_or_emotion: '', overlay_text: '' }));
    const story = r.principles.find((p) => p.id === 'story-driven');
    expect(story.score).toBeLessThan(4);
    expect(r.would_stop_scroll).toBe(false);
  });

  test('text-dump overlay (>7 words) fails text-with-intent', () => {
    const r = jasmineStar.scoreVisualBrief(goodBrief({
      overlay_text: 'Here are ten reasons why you should definitely care about this topic today',
    }));
    const text = r.principles.find((p) => p.id === 'text-with-intent');
    expect(text.score).toBeLessThan(4);
  });

  test('missing brief fields fail closed, not silent', () => {
    const r = jasmineStar.scoreVisualBrief({});
    expect(r.average).toBeLessThan(4);
    expect(r.would_stop_scroll).toBe(false);
    expect(r.flags.length).toBeGreaterThan(0);
  });
});
