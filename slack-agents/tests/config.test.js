// tests/config.test.js — Validates agent config structure
'use strict';

const { AGENTS, CHANNELS, ALL_CHANNELS, DELEGATION_TARGETS, AGENT_BY_ID } = require('../config');

describe('MACF Config — 8 agents defined', () => {
  const EXPECTED_AGENTS = ['execPM', 'cmo', 'cco', 'jobcoach', 'cuxo', 'cro', 'lawyer', 'cfo'];

  test('All 8 agents are present', () => {
    EXPECTED_AGENTS.forEach(id => {
      expect(AGENTS[id]).toBeDefined();
    });
  });

  test('Each agent has required fields', () => {
    EXPECTED_AGENTS.forEach(id => {
      const agent = AGENTS[id];
      expect(agent.id).toBe(id);
      expect(agent.slackName).toBeTruthy();
      expect(agent.handle).toMatch(/^@/);
      expect(agent.emoji).toBeTruthy();
      expect(agent.icon).toMatch(/^:/);
      expect(agent.channels).toBeInstanceOf(Array);
      expect(agent.channels.length).toBeGreaterThan(0);
      expect(agent.primaryChannel).toBeTruthy();
      expect(agent.systemPrompt).toContain('Jesse Stay');
    });
  });

  test('exec-pm is in ALL channels', () => {
    const execChannels = AGENTS.execPM.channels;
    // exec-pm should be in every channel defined in CHANNELS
    Object.values(CHANNELS).forEach(ch => {
      expect(execChannels).toContain(ch);
    });
  });

  test('Marketing team (#marketing) has CMO, CUXO, CRO, CCO', () => {
    const marketingAgents = Object.values(AGENTS).filter(a =>
      a.channels.includes(CHANNELS.marketing)
    ).map(a => a.id);
    expect(marketingAgents).toContain('cmo');
    expect(marketingAgents).toContain('cuxo');
    expect(marketingAgents).toContain('cro');
    expect(marketingAgents).toContain('cco');
  });

  test('Research team (#research) has CMO and CRO', () => {
    const researchAgents = Object.values(AGENTS).filter(a =>
      a.channels.includes(CHANNELS.research)
    ).map(a => a.id);
    expect(researchAgents).toContain('cmo');
    expect(researchAgents).toContain('cro');
  });

  test('All agents are in #management', () => {
    const EXPECTED_AGENTS = ['execPM', 'cmo', 'cco', 'jobcoach', 'cuxo', 'cro', 'lawyer', 'cfo'];
    EXPECTED_AGENTS.forEach(id => {
      expect(AGENTS[id].channels).toContain(CHANNELS.management);
    });
  });
});

describe('CHANNELS config', () => {
  test('All expected channels are defined', () => {
    const expected = ['marketing', 'research', 'content', 'jobs', 'it', 'management'];
    expected.forEach(key => {
      expect(CHANNELS[key]).toBeTruthy();
    });
  });

  test('#transkrybe renamed to #cto', () => {
    expect(CHANNELS.it).toBe('cto');
    // Confirm no 'transkrybe' channel remains
    expect(Object.values(CHANNELS)).not.toContain('transkrybe');
  });
});

describe('DELEGATION_TARGETS routing', () => {
  test('All 8 agent handles resolve correctly', () => {
    expect(DELEGATION_TARGETS['exec pm']).toBe('execPM');
    expect(DELEGATION_TARGETS['cmo']).toBe('cmo');
    expect(DELEGATION_TARGETS['cco']).toBe('cco');
    expect(DELEGATION_TARGETS['jobcoach']).toBe('jobcoach');
    expect(DELEGATION_TARGETS['job coach']).toBe('jobcoach');
    expect(DELEGATION_TARGETS['cuxo']).toBe('cuxo');
    expect(DELEGATION_TARGETS['cro']).toBe('cro');
    expect(DELEGATION_TARGETS['lawyer']).toBe('lawyer');
    expect(DELEGATION_TARGETS['cfo']).toBe('cfo');
  });
});

describe('MACF role system prompts', () => {
  test('execPM system prompt contains Ryan Holiday reference or ES role', () => {
    expect(AGENTS.execPM.systemPrompt).toMatch(/Executive Secretary|Ryan Holiday|ES/);
  });

  test('cmo system prompt references Marketing Director', () => {
    expect(AGENTS.cmo.systemPrompt).toMatch(/Marketing Director|CMO|Chief Marketing/);
  });

  test('cco system prompt references content/writing role', () => {
    expect(AGENTS.cco.systemPrompt).toMatch(/Content|Chief Content|CTW|Technical Writer/i);
  });

  test('cuxo system prompt references Designer/UX role', () => {
    expect(AGENTS.cuxo.systemPrompt).toMatch(/Designer|UX|WCAG|accessibility/i);
  });

  test('lawyer system prompt references legal/EBL role', () => {
    expect(AGENTS.lawyer.systemPrompt).toMatch(/Lawyer|legal|EBL|Elite Business/i);
  });

  test('cfo system prompt references finance/BIC role', () => {
    expect(AGENTS.cfo.systemPrompt).toMatch(/CFO|financial|revenue|BIC|Business Income/i);
  });

  test('All system prompts contain Jesse non-negotiable rules', () => {
    Object.values(AGENTS).forEach(agent => {
      expect(agent.systemPrompt).toContain("Jesse's ✅");
      expect(agent.systemPrompt).toContain('isolated memory');
    });
  });
});
