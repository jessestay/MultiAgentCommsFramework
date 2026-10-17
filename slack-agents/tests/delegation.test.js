// tests/delegation.test.js — Tests inter-agent delegation routing in index.js
'use strict';

const { DELEGATION_TARGETS } = require('../config');

// Test the delegation detection logic extracted from index.js
function detectAddressedAgent(text) {
  if (!text) return null;

  const delegMatch = text.match(/\[from:\s*.+?\s*→\s*(.+?)\]/i);
  if (delegMatch) {
    const target = delegMatch[1].trim().toLowerCase().replace(/[\s-]+/g, '');
    return DELEGATION_TARGETS[target] || null;
  }

  const handleMap = {
    'exec-pm': 'execPM', 'execpm': 'execPM', 'exec pm': 'execPM',
    'cmo': 'cmo',
    'cco': 'cco',
    'jobcoach': 'jobcoach', 'job coach': 'jobcoach',
    'cuxo': 'cuxo',
    'cro': 'cro',
    'lawyer': 'lawyer', 'counsel': 'lawyer',
    'cfo': 'cfo',
  };
  for (const [pattern, agentId] of Object.entries(handleMap)) {
    if (new RegExp(`(@|\\b)${pattern.replace(' ', '[- ]?')}(:|\\b)`, 'i').test(text)) {
      return agentId;
    }
  }
  return null;
}

describe('Delegation pattern routing', () => {
  test('[from: X → CMO] routes to cmo', () => {
    expect(detectAddressedAgent('[from: Exec PM → CMO] Please run a campaign')).toBe('cmo');
  });

  test('[from: X → CCO] routes to cco', () => {
    expect(detectAddressedAgent('[from: CMO → CCO] Write the Monday post')).toBe('cco');
  });

  test('[from: X → Job Coach] routes to jobcoach', () => {
    expect(detectAddressedAgent('[from: Exec PM → Job Coach] Pipeline check')).toBe('jobcoach');
  });

  test('[from: X → CUXO] routes to cuxo', () => {
    expect(detectAddressedAgent('[from: CMO → CUXO] UX review needed')).toBe('cuxo');
  });

  test('[from: X → CRO] routes to cro', () => {
    expect(detectAddressedAgent('[from: CMO → CRO] Research competitors')).toBe('cro');
  });

  test('[from: X → Lawyer] routes to lawyer', () => {
    expect(detectAddressedAgent('[from: CFO → Lawyer] Contract review')).toBe('lawyer');
  });

  test('[from: X → CFO] routes to cfo', () => {
    expect(detectAddressedAgent('[from: Exec PM → CFO] Financial brief')).toBe('cfo');
  });

  test('[from: X → Exec PM] routes to execPM', () => {
    expect(detectAddressedAgent('[from: CMO → Exec PM] Need coordination')).toBe('execPM');
  });
});

describe('Direct handle addressing', () => {
  test('@cmo in message routes to cmo', () => {
    expect(detectAddressedAgent('@cmo can you give me a marketing plan?')).toBe('cmo');
  });

  test('@cco in message routes to cco', () => {
    expect(detectAddressedAgent('@cco write me a Facebook post')).toBe('cco');
  });

  test('@cuxo routes to cuxo', () => {
    expect(detectAddressedAgent('@cuxo please review the UX flow')).toBe('cuxo');
  });

  test('@lawyer routes to lawyer', () => {
    expect(detectAddressedAgent('@lawyer I got an NDA')).toBe('lawyer');
  });

  test('@cfo routes to cfo', () => {
    expect(detectAddressedAgent('@cfo what should my transkrybe pricing be?')).toBe('cfo');
  });

  test('Random message returns null', () => {
    expect(detectAddressedAgent('Hey everyone what do you think about this?')).toBeNull();
  });

  test('Empty/null message returns null', () => {
    expect(detectAddressedAgent('')).toBeNull();
    expect(detectAddressedAgent(null)).toBeNull();
  });
});

describe('Case insensitivity', () => {
  test('[from: X → cmo] lowercase works', () => {
    expect(detectAddressedAgent('[from: cro → cmo] here is my research')).toBe('cmo');
  });

  test('[from: X → LAWYER] uppercase works', () => {
    expect(detectAddressedAgent('[from: Exec PM → LAWYER] need legal review')).toBe('lawyer');
  });
});
