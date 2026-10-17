/**
 * engine/tests/kernel-m1-arrowdialects.test.js
 *
 * Kernel M1.3 (Vikunja #771 / #758) — delegation-header arrow dialects.
 *
 * Root cause (Oct 15, 2026): the poller's delegation matcher only accepted
 * the Unicode arrow in "[from: X → Y]". Directives posted with the ASCII
 * arrow "[from: CEO -> Lawyer]" were scanned, marked seen (watermark
 * advanced), and dropped with zero log lines, zero receipts, and no
 * dead-letter — silent loss, found by comparing the poll watermark against
 * the received-directives ledger. For hours the only "responses" came from
 * the desktop legacy bot, which masked the failure.
 *
 * BDD scenarios:
 * - Given a directive header with the Unicode arrow, when parsed, then
 *   from/to are extracted (no regression).
 * - Given a directive header with the ASCII arrow, when parsed, then
 *   from/to are extracted (pre-fix: null — the directive was dropped).
 * - Given an agent-to-agent header with the ASCII arrow, when parsed, then
 *   from/to are extracted.
 * - Given ordinary channel text, when parsed, then null.
 * - Given a reply whose leading routing header uses the ASCII arrow, when
 *   sanitized for posting, then the header is preserved (pre-fix: the
 *   header-detach regex required the Unicode arrow).
 */
'use strict';

const { parseDelegationHeader, sanitizePostText } = require('../directivePoll');

describe('parseDelegationHeader arrow dialects', () => {
  test('parses the Unicode arrow header', () => {
    expect(parseDelegationHeader('[from: CEO → Lawyer] write the memo'))
      .toEqual({ from: 'CEO', to: 'Lawyer' });
  });

  test('parses the ASCII arrow header', () => {
    expect(parseDelegationHeader('[from: CEO -> Lawyer] write the memo'))
      .toEqual({ from: 'CEO', to: 'Lawyer' });
  });

  test('parses an agent-to-agent ASCII header', () => {
    expect(parseDelegationHeader('[from: Lawyer -> CEO] done'))
      .toEqual({ from: 'Lawyer', to: 'CEO' });
  });

  test('parses a multi-word target with either arrow', () => {
    expect(parseDelegationHeader('[from: CEO → Facebook Expert] regen'))
      .toEqual({ from: 'CEO', to: 'Facebook Expert' });
    expect(parseDelegationHeader('[from: CEO -> Facebook Expert] regen'))
      .toEqual({ from: 'CEO', to: 'Facebook Expert' });
  });

  test('returns null for ordinary text', () => {
    expect(parseDelegationHeader('Hourly standup — all agents healthy')).toBeNull();
    expect(parseDelegationHeader('')).toBeNull();
    expect(parseDelegationHeader(null)).toBeNull();
  });
});

describe('sanitizePostText header preservation', () => {
  test('preserves a leading ASCII-arrow routing header', () => {
    const out = sanitizePostText('[from: CEO -> Lawyer] The memo is written.');
    expect(out.startsWith('[from: CEO -> Lawyer]')).toBe(true);
    expect(out).toContain('The memo is written.');
  });

  test('preserves a leading Unicode-arrow routing header', () => {
    const out = sanitizePostText('[from: CEO → Lawyer] The memo is written.');
    expect(out.startsWith('[from: CEO → Lawyer]')).toBe(true);
    expect(out).toContain('The memo is written.');
  });
});
