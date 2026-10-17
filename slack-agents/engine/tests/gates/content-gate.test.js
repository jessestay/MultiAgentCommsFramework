'use strict';
// Content quality gate — executable scorer tests.
// Rule source: engine/content-quality-gate.md (rules 0-7).
// Fail-closed: schema errors, any rule < 4, or average < 4 => REJECT.

const { scoreContent } = require('../../gates/contentGate');

function goodDraft(overrides = {}) {
  return {
    label: '1',
    platform: 'LinkedIn',
    hook: "Your AI agent reading 187,000 of your text messages isn't a bug. It's the business model.",
    body: [
      'I think most people have this backwards. We act shocked when an AI assistant',
      'reads our messages, but the product was never the chat window. The product',
      'is the data exhaust. Here is the operating detail nobody mentions: these',
      'systems get better the more of your life they ingest, and the companies',
      'building them know it. That is not a conspiracy, it is the incentive',
      'structure, and human nature has not changed to make it benign.',
      'Get the full breakdown here: https://gadgets.muse.ai/privacy-report',
      'So here is my take: treat every AI product like a landlord. It will use',
      'what you give it. Act accordingly. Trust the incentives, not the interface.',
    ].join(' '),
    persona: 'Justin Welsh',
    format: 'image-caption',
    image_direction: 'Real phone on a desk, 1:1, bold 5-word overlay top third',
    mcp_tools_used: ['image_search'],
    visuals_routed_via_cuxo: true,
    links: ['https://gadgets.muse.ai/privacy-report'],
    ...overrides,
  };
}

describe('content gate schema', () => {
  test('rejects a draft missing required fields (fail closed)', () => {
    const r = scoreContent({ platform: 'LinkedIn', body: 'hi' });
    expect(r.verdict).toBe('REJECT');
    expect(r.schema_errors.length).toBeGreaterThan(0);
  });

  test('rejects an unknown platform', () => {
    const r = scoreContent(goodDraft({ platform: 'MySpace' }));
    expect(r.verdict).toBe('REJECT');
  });

  test('rejects a persona not in the platform map', () => {
    const r = scoreContent(goodDraft({ platform: 'LinkedIn', persona: 'Brock Johnson' }));
    expect(r.verdict).toBe('REJECT');
    expect(r.failures).toContain('expert-lens');
  });
});

describe('content gate scoring', () => {
  test('a strong draft passes with per-rule 0-5 scores for all 8 rules', () => {
    const r = scoreContent(goodDraft());
    expect(r.verdict).toBe('PASS');
    expect(r.rules).toHaveLength(8);
    for (const rule of r.rules) {
      expect(rule.score).toBeGreaterThanOrEqual(0);
      expect(rule.score).toBeLessThanOrEqual(5);
      expect(rule.id).toBeTruthy();
      expect(['deterministic', 'heuristic']).toContain(rule.method);
    }
    expect(r.average).toBeGreaterThanOrEqual(4);
  });

  test('fail-closed: average below 4 rejects even if no single rule tanks', () => {
    const r = scoreContent(goodDraft({
      hook: 'Some thoughts on AI and data.',
      body: 'In this post I will explore various topics related to artificial intelligence and data usage patterns in modern applications.',
      persona: 'Justin Welsh',
    }));
    expect(r.verdict).toBe('REJECT');
    expect(r.average).toBeLessThan(4);
  });

  test('fail-closed: any single rule below 4 rejects (doc: rewrite, never present as-is)', () => {
    // Neutral banned opener kills the hook rule even if everything else is fine.
    const r = scoreContent(goodDraft({ hook: "In this post, here are some thoughts about AI." }));
    expect(r.rules.find((x) => x.id === 'hook').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
    expect(r.failures).toContain('hook');
  });

  test('rule 2 (bold open): throat-clearing first line fails', () => {
    const r = scoreContent(goodDraft({
      body: "It's worth noting that AI systems process data. Furthermore, we should leverage these insights to unlock value going forward.",
    }));
    expect(r.rules.find((x) => x.id === 'bold-open').score).toBeLessThan(4);
  });

  test('rule 5 (practical links): mentioning a gettable thing without a link fails', () => {
    const r = scoreContent(goodDraft({
      body: 'I tested the new gadget this week and you should get it too, it changed my workflow completely.',
      links: [],
    }));
    expect(r.rules.find((x) => x.id === 'links').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 5: invented/malformed URLs fail', () => {
    const r = scoreContent(goodDraft({ links: ['not a url', 'https://'] }));
    expect(r.rules.find((x) => x.id === 'links').score).toBeLessThan(4);
  });

  test('rule 6 (format): visual format without image direction fails', () => {
    const r = scoreContent(goodDraft({ format: 'carousel', image_direction: '' }));
    expect(r.rules.find((x) => x.id === 'format').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 7 (MCP tools): visual draft not routed via CUXO fails', () => {
    const r = scoreContent(goodDraft({ visuals_routed_via_cuxo: false }));
    expect(r.rules.find((x) => x.id === 'mcp-tools').score).toBeLessThan(4);
    expect(r.verdict).toBe('REJECT');
  });

  test('rule 4 (expert lens): persona with no visible lens markers fails', () => {
    const r = scoreContent(goodDraft({
      persona: 'Ryan Holiday',
      body: 'Here is a generic marketing tip. Post more often and use hashtags for growth.',
      hook: 'Posting more is the only growth strategy that matters.',
    }));
    expect(r.rules.find((x) => x.id === 'expert-lens').score).toBeLessThan(4);
  });

  test('every gate rule has a code path or an explicit NOT-AUTOMATABLE flag', () => {
    const r = scoreContent(goodDraft());
    for (const rule of r.rules) {
      expect(rule.automatable === true || typeof rule.notAutomatableReason === 'string').toBe(true);
    }
  });
});
