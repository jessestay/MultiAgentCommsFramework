// tests/macf-bugs.test.js — Test-first: verify all known MACF bugs are fixed.
// Run with: node tests/macf-bugs.test.js
// No external dependencies required — tests logic directly.

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name);
    console.error('     ' + err.message);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Bug 1: morning-briefing.js must not hardcode 'exec-pm' channel
console.log('Bug 1: morning-briefing channel name');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../api/cron/morning-briefing.js', 'utf8');

  test("morning-briefing does NOT hardcode exec-pm as channel arg", () => {
    assert(
      !src.includes("postAsAgent('exec-pm', 'exec-pm'"),
      "Found postAsAgent with exec-pm channel — should be null to use agent default management"
    );
  });

  test("morning-briefing uses null channel", () => {
    const hasNull = src.includes("postAsAgent('exec-pm', null") ||
      (src.includes("'exec-pm',") && src.includes("null,"));
    assert(hasNull, "Expected postAsAgent to pass null as channel");
  });
}

// Bug 2: weekly-transkrybe.js must not hardcode 'transkrybe' channel
console.log('Bug 2: weekly-transkrybe channel name');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../api/cron/weekly-transkrybe.js', 'utf8');

  test("weekly-transkrybe does NOT hardcode transkrybe channel", () => {
    assert(
      !src.includes("postAsAgent('transkrybe', 'transkrybe'"),
      "Found postAsAgent with transkrybe channel — channel renamed to cto, should use null"
    );
  });

  test("weekly-transkrybe uses null channel", () => {
    assert(
      src.includes("postAsAgent('transkrybe', null") || src.includes("'transkrybe',") && src.includes("null,"),
      "Expected postAsAgent to pass null as channel so agent default cto is used"
    );
  });
}

// Bug 3 (CRITICAL): invoke.js must not block when INTERNAL_SECRET is unset
console.log('Bug 3 (CRITICAL): invoke.js agent-to-agent auth');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../api/internal/invoke.js', 'utf8');

  test("invoke.js does NOT use !expected guard", () => {
    assert(
      !src.includes('!expected ||') && !src.includes('! expected ||'),
      "Found !expected || — this blocks all agent-to-agent calls when INTERNAL_SECRET is not set"
    );
  });

  test("invoke.js only enforces secret when INTERNAL_SECRET is configured", () => {
    assert(
      src.includes('if (expected && secret !== expected)'),
      "Expected: if (expected && secret !== expected)"
    );
  });
}

// Bug 4: exec-pm.js system prompt — correct GoFundMe URL + missing projects
console.log('Bug 4: exec-pm system prompt completeness');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../agents/exec-pm.js', 'utf8');

  test("exec-pm has correct GoFundMe URL", () => {
    assert(
      src.includes('https://www.gofundme.com/f/help-louis-stay-get-a-wheelchair'),
      "exec-pm has wrong GoFundMe URL"
    );
  });

  test("exec-pm knows about Canvassador", () => {
    assert(src.toLowerCase().includes('canvassador'), "exec-pm missing Canvassador project");
  });

  test("exec-pm knows about staynalive.com blog", () => {
    assert(src.includes('staynalive.com'), "exec-pm missing staynalive.com blog project");
  });

  test("exec-pm knows Louis has ME/CFS and hEDS", () => {
    assert(src.includes('ME/CFS') && src.includes('hEDS'), "exec-pm must mention ME/CFS and hEDS");
    assert(!src.toLowerCase().includes('cerebral palsy'), "exec-pm incorrectly mentions cerebral palsy");
  });

  test("exec-pm knows about AI CEO LinkedIn series", () => {
    assert(
      src.toLowerCase().includes('ai ceo') || src.toLowerCase().includes('linkedin'),
      "exec-pm should know about the AI CEO LinkedIn series"
    );
  });
}

// Bug 5: transkrybe.js — correct product description
console.log('Bug 5: transkrybe product description');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../agents/transkrybe.js', 'utf8');

  test("transkrybe is NOT described as audio transcription", () => {
    assert(
      !src.toLowerCase().includes('audio transcription') &&
      !src.toLowerCase().includes('audio/music transcription'),
      "Transkrybe is a SHEET MUSIC transposition tool, not audio transcription"
    );
  });

  test("transkrybe is described as sheet music transposition", () => {
    assert(
      src.toLowerCase().includes('sheet music') || src.toLowerCase().includes('transpos'),
      "Transkrybe should be described as transposing sheet music"
    );
  });
}

// Bug 6: state.js — correct GoFundMe URL + Canvassador project
console.log('Bug 6: state.js DEFAULT_STATE');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../lib/state.js', 'utf8');

  test("state.js has correct GoFundMe URL", () => {
    assert(
      src.includes('help-louis-stay-get-a-wheelchair'),
      "state.js has wrong GoFundMe URL"
    );
  });

  test("state.js includes Canvassador project", () => {
    assert(src.toLowerCase().includes('canvassador'), "state.js missing Canvassador project");
  });

  test("state.js includes staynalive_blog project", () => {
    assert(
      src.includes('staynalive') && (src.includes('blog') || src.includes('Blog')),
      "state.js missing staynalive.com blog project"
    );
  });
}

// Bug 7: events.js — channel history uses per-agent token
console.log('Bug 7: events.js per-agent token for history');
{
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../api/slack/events.js', 'utf8');

  test("getChannelHistory accepts a token parameter", () => {
    assert(
      src.includes('getChannelHistory(channelId') &&
      (src.includes('getChannelHistory(channelId, ') ||
       !src.includes("Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN")),
      "getChannelHistory should accept a token parameter"
    );
  });
}

// Summary
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) {
  console.log('Some bugs still present — fix them and re-run.');
  process.exit(1);
} else {
  console.log('All bugs fixed!');
  process.exit(0);
}
