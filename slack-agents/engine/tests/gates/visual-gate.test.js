'use strict';
// Visual quality gate — executable scorer tests.
// Rule source: engine/visual-quality-gate.md (rules 1-5) + Jasmine Star persona filter.
// Fail-closed: schema errors, any rule < 4, or average < 4 => REJECT.

const { scoreVisual } = require('../../gates/visualGate');

function goodVisual(overrides = {}) {
  return {
    label: '1',
    platform: 'LinkedIn',
    hook: "Your AI agent reading your text messages isn't a bug. It's the business model.",
    base: 'stock',
    ai_glossy: false,
    overlay_text: 'YOUR TEXT MESSAGES ARE THE PRODUCT',
    overlay_readable_at_thumbnail: true,
    overlay_contrast: 'high',
    stands_alone_without_caption: true,
    creates_question_or_feeling: true,
    has_impossible_physics: false,
    has_watermark_artifacts: false,
    aspect_ratio: '1:1',
    image_direction: 'Real phone on a real desk, subject top third, natural window light, film grain',
    story_or_emotion: 'The uneasy feeling of being watched by something you invited in',
    has_human_element: true,
    ...overrides,
  };
}

describe('visual gate schema', () => {
  test('rejects a visual missing required fields (fail closed)', () => {
    const r = scoreVisual({ platform: 'LinkedIn' });
    expect(r.verdict).toBe('REJECT');
    expect(r.schema_errors.length).toBeGreaterThan(0);
  });

  test('rejects an unknown base type', () => {
    const r = scoreVisual(goodVisual({ base: '3d-render' }));
    expect(r.verdict).toBe('REJECT');
  });
});

describe('visual gate scoring', () => {
  test('a strong stock-first visual passes with per-rule 0-5 scores', () => {
    const r = scoreVisual(goodVisual());
    expect(r.verdict).toBe('PASS');
    expect(r.rules.length).toBeGreaterThanOrEqual(5);
    for (const rule of r.rules) {
      expect(rule.score).toBeGreaterThanOrEqual(0);
      expect(rule.score).toBeLessThanOrEqual(5);
    }
    expect(r.average).toBeGreaterThanOrEqual(4);
  });

  test('rule 1 (stock-first): pure-AI with glossy synthetic sheen fails', () => {
    const r = scoreVisual(goodVisual({ base: 'ai', ai_glossy: true }));
    expect(r.rules.find((x) => x.id === 'stock-first').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
    expect(r.failures).toContain('stock-first');
  });

  test('rule 2 (text overlay): more than ~7 words on the image fails', () => {
    const r = scoreVisual(goodVisual({
      overlay_text: 'This is a very long sentence with far too many words on it',
    }));
    expect(r.rules.find((x) => x.id === 'text-overlay').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 2: overlay not readable at thumbnail size fails', () => {
    const r = scoreVisual(goodVisual({ overlay_readable_at_thumbnail: false }));
    expect(r.rules.find((x) => x.id === 'text-overlay').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 3 (one-second test): image that needs its caption to make sense fails', () => {
    const r = scoreVisual(goodVisual({ stands_alone_without_caption: false }));
    expect(r.rules.find((x) => x.id === 'one-second').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 4 (human-created look): impossible physics fails', () => {
    const r = scoreVisual(goodVisual({ has_impossible_physics: true }));
    expect(r.rules.find((x) => x.id === 'human-look').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 5 (platform sizing): wrong aspect ratio for the platform fails', () => {
    const r = scoreVisual(goodVisual({ platform: 'TikTok', aspect_ratio: '1:1' }));
    expect(r.rules.find((x) => x.id === 'platform-size').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('Jasmine Star persona filter is wired into the visual gate scorer', () => {
    const r = scoreVisual(goodVisual());
    const personaRule = r.rules.find((x) => x.id === 'persona-filter');
    expect(personaRule).toBeDefined();
    expect(personaRule.score).toBeGreaterThanOrEqual(4);
    expect(r.persona).toBe('Jasmine Star');
  });

  test('a visual that would not stop the scroll fails the persona filter', () => {
    const r = scoreVisual(goodVisual({
      has_human_element: false,
      overlay_text: '',
      story_or_emotion: '',
      creates_question_or_feeling: false,
    }));
    expect(r.rules.find((x) => x.id === 'persona-filter').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('every visual rule has a code path or an explicit NOT-AUTOMATABLE flag', () => {
    const r = scoreVisual(goodVisual());
    for (const rule of r.rules) {
      expect(rule.automatable === true || typeof rule.notAutomatableReason === 'string').toBe(true);
    }
  });
});
