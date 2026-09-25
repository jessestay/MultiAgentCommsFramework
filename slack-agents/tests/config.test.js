// tests/config.test.js — Validates agent config structure
'use strict';

const { AGENTS, CHANNELS, ALL_CHANNELS, DELEGATION_TARGETS, AGENT_BY_ID, DM_CHANNELS, HUMAN_VOICE } = require('../config');

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

describe('MACF end-user communication standard', () => {
  test('DM_CHANNELS declares Slack, Muse, and Claude dispatch', () => {
    expect(DM_CHANNELS).toEqual(expect.arrayContaining(['slack', 'muse', 'claude-dispatch']));
  });

  test('HUMAN_VOICE carries the step-by-step end-user request standard', () => {
    expect(HUMAN_VOICE).toMatch(/step-by-step/i);
    expect(HUMAN_VOICE).toMatch(/Google's developer documentation framework/);
    expect(HUMAN_VOICE).toMatch(/CEO-role holder/);
    expect(HUMAN_VOICE).toMatch(/direct link/i);
    expect(HUMAN_VOICE).toMatch(/operators, not askers/i);
  });
});

describe('MACF CEO role', () => {
  const { CEO_SUCCESSION, ACTING_CEO_ID, CEO_CHARTER } = require('../config');

  test('CEO succession chain is Claude Dispatch -> Jarvis Jr. -> Exec PM', () => {
    expect(CEO_SUCCESSION).toEqual(['claude-dispatch', 'jarvis-jr', 'execPM']);
  });

  test('acting CEO is one of the succession holders', () => {
    expect(CEO_SUCCESSION).toContain(ACTING_CEO_ID);
  });

  test('CEO charter is exported and upholds Jesse\'s hard boundaries', () => {
    expect(CEO_CHARTER).toMatch(/world-class CEO/);
    expect(CEO_CHARTER).toMatch(/explicit approval/);
    expect(CEO_CHARTER).toMatch(/No spend without approval/);
  });

  test('in-Slack CEO voice (Exec PM) carries the charter', () => {
    expect(AGENTS.execPM.systemPrompt).toContain('CEO CHARTER');
  });
});

describe('Expert skill lenses', () => {
  const { EXPERT_WIRING } = require('../config');

  const LENS_HEADERS = {
    'ryan-holiday': 'RYAN HOLIDAY lens',
    'derral-eves': 'DERRAL EVES lens',
    'eli-schwartz': 'ELI SCHWARTZ lens',
    'lily-ray': 'LILY RAY lens',
    'eugene-schwartz': 'EUGENE SCHWARTZ lens',
    'nick-saraev': 'NICK SARAEV lens',
    'brock-johnson': 'BROCK JOHNSON lens',
    'mari-smith': 'MARI SMITH lens',
    'brendan-kane': 'BRENDAN KANE lens',
    'justin-welsh': 'JUSTIN WELSH lens',
    'sam-parr': 'SAM PARR lens',
    'richard-millington': 'RICHARD MILLINGTON lens',
    'jesse-voice': 'JESSE STAY VOICE lens',
  };

  test('content-writing members inherit the Jesse voice lens', () => {
    ['cmo', 'cco', 'facebook'].forEach(id => {
      expect(EXPERT_WIRING[id]).toContain('jesse-voice');
    });
  });

  test('every marketing member inherits Holiday + Eves', () => {
    ['cmo', 'cco', 'facebook', 'cuxo'].forEach(id => {
      expect(EXPERT_WIRING[id]).toContain('ryan-holiday');
      expect(EXPERT_WIRING[id]).toContain('derral-eves');
    });
  });

  test('every wired lens appears in its persona prompt (no map/prompt drift)', () => {
    Object.entries(EXPERT_WIRING).forEach(([id, slugs]) => {
      slugs.forEach(slug => {
        expect(AGENTS[id].systemPrompt).toContain(LENS_HEADERS[slug]);
      });
    });
  });

  test('domain skills land on their owning personas', () => {
    expect(EXPERT_WIRING.cmo).toEqual(expect.arrayContaining(['eli-schwartz', 'lily-ray', 'nick-saraev', 'richard-millington']));
    expect(EXPERT_WIRING.cco).toEqual(expect.arrayContaining(['eugene-schwartz', 'brendan-kane', 'sam-parr', 'justin-welsh']));
    expect(EXPERT_WIRING.facebook).toEqual(expect.arrayContaining(['mari-smith', 'brock-johnson']));
    expect(EXPERT_WIRING.cro).toEqual(expect.arrayContaining(['eli-schwartz', 'lily-ray']));
    expect(EXPERT_WIRING.jobcoach).toContain('justin-welsh');
  });

  test('non-marketing, non-domain personas carry no expert lenses', () => {
    ['execPM', 'lawyer', 'cfo', 'cto'].forEach(id => {
      expect(AGENTS[id].systemPrompt).not.toMatch(/EXPERT LENSES/);
    });
  });
});
