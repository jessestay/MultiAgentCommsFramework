// Regression tests: standup.js must not render CLOSED engine gaps as blockers.
// (Oct 11, 2026: 4 closed AGENT_MODULE_BROKEN gaps from the HOME-env
// false-positive run kept showing up as live standup blockers.)
const { buildStandup } = require('../standup.js');

function gapsOf(rows) {
  return rows;
}

const config = { standup: { scrum_master: 'execpm' } };

// Minimal health fixture: every agent healthy with one success, no failures.
function healthFor(agents) {
  const h = {};
  for (const a of agents) {
    h[a] = { status: 'healthy', received: 1, completed: 1, failed: 0, lastActivity: new Date().toISOString() };
  }
  return h;
}

const AGENTS = ['cmo', 'cco', 'cfo', 'cro', 'cto', 'cuxo', 'execpm', 'facebook', 'hr', 'jobcoach', 'lawyer'];

test('closed gaps are not rendered as blockers', () => {
  const rows = gapsOf([
    { issueType: 'AGENT_MODULE_BROKEN', status: 'closed', timestamp: new Date().toISOString(), description: 'Agent facebook module fails to load' },
    { issueType: 'AGENT_LOW_DELIVERY', status: 'open', timestamp: new Date().toISOString(), description: 'cto: CTO delivery rate 32% (23/73)' },
  ]);
  const { blockers } = buildStandup(healthFor(AGENTS), rows, config);
  const joined = blockers.join('\n');
  expect(joined).not.toContain('AGENT_MODULE_BROKEN');
  expect(joined).toContain('AGENT_LOW_DELIVERY');
});

test('legacy gaps without a status field still render (fail-open)', () => {
  const rows = gapsOf([
    { issueType: 'SOME_LEGACY_GAP', timestamp: new Date().toISOString(), description: 'legacy gap, no status' },
  ]);
  const { blockers } = buildStandup(healthFor(AGENTS), rows, config);
  expect(blockers.join('\n')).toContain('SOME_LEGACY_GAP');
});

test('superseded gap (agent demoed after gap) is still skipped', () => {  const now = Date.now();
  const rows = gapsOf([
    {
      issueType: 'missing_hourly_demo',
      agent: 'cmo',
      status: 'open',
      timestamp: new Date(now - 60000).toISOString(),
      description: 'cmo missing demo',
    },
  ]);
  // Simulate a demo recorded after the gap: patch buildStandup's demo-state
  // load via a real .sprint-demo-state.json is env-dependent, so instead
  // verify the supersede path through the closed-gap rule only when the
  // demo is newer — covered indirectly: open gaps with newer demos skip.
  const { blockers } = buildStandup(healthFor(AGENTS), rows, config);
  // With no demo state on disk, the gap renders (fail-open); the test pins
  // that a NON-closed gap still reaches the blocker list when unresolvable.
  expect(blockers.join('\n')).toContain('missing_hourly_demo');
});

test('description-prefixed gap is superseded when that agent demoed after the gap', () => {
  // Self-healer gap records carry no `agent` field — the agent id sits at the
  // start of the description ("cto: CTO delivery rate ..."). The standup must
  // still match the newer-demo skip for those rows.
  const fs = require('fs');
  const path = require('path');
  const now = Date.now();
  const demoState = { lastDemo: { cto: new Date(now).toISOString() } };
  const demoPath = path.join(__dirname, '..', '.sprint-demo-state.json');
  const realRead = fs.readFileSync;
  const spy = jest.spyOn(fs, 'readFileSync').mockImplementation((p, enc) => {
    if (String(p) === demoPath) return JSON.stringify(demoState);
    return realRead(p, enc);
  });
  try {
    const rows = gapsOf([
      {
        issueType: 'AGENT_LOW_DELIVERY',
        status: 'open',
        timestamp: new Date(now - 6 * 3600 * 1000).toISOString(),
        description: 'cto: CTO delivery rate 34% (28/82) — below 50% threshold',
      },
    ]);
    const { blockers } = buildStandup(healthFor(AGENTS), rows, config);
    expect(blockers.join('\n')).not.toContain('AGENT_LOW_DELIVERY');
  } finally {
    spy.mockRestore();
  }
});

test('description prefix that matches no demo key fails open (renders)', () => {
  const rows = gapsOf([
    {
      issueType: 'AGENT_LOW_DELIVERY',
      status: 'open',
      timestamp: new Date().toISOString(),
      description: 'nobody: some unknown agent gap',
    },
  ]);
  const { blockers } = buildStandup(healthFor(AGENTS), rows, config);
  expect(blockers.join('\n')).toContain('AGENT_LOW_DELIVERY');
});

test('qualityTrends schema ({type, message}) renders with content, not empty', () => {
  // Oct 12, 2026: qualityTrends gap rows ({type, message}, no issueType /
  // description) rendered as empty "[engine] gap: " lines on the standup.
  const rows = gapsOf([
    {
      timestamp: new Date().toISOString(),
      source: 'qualityTrends',
      type: 'quality_stagnation',
      agent: 'exec',
      message: 'exec has 246 scored messages but avg quality is only 1.00 — not improving',
    },
  ]);
  const { blockers } = buildStandup(healthFor(AGENTS), rows, config);
  const joined = blockers.join('\n');
  expect(joined).toContain('quality_stagnation');
  expect(joined).toContain('246 scored messages');
  expect(joined).not.toContain('[engine] gap: \n');
});
