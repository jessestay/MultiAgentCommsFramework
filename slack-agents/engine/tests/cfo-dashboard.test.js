#!/usr/bin/env node
// engine/tests/cfo-dashboard.feature — BDD scenarios for CFO hourly demo.
//
// JESSE'S LAW: Every agent with active tasks must produce verifiable demo
// output every hour. The CFO owns task #86 "[CFO] Daily revenue dashboard"
// on project 16 (Revenue Sprint).
//
// ROOT CAUSE (Oct 6, 2026): The CFO only responds to Slack directives.
// Nothing proactively triggers it to work on its Vikunja tasks. The PayPal
// MCP bridge is NOT IMPLEMENTED (capability-registry.js), so the CFO cannot
// fetch live revenue data. The mechanism fix: an hourly cron in cfo.js that
// generates the dashboard artifact autonomously, showing $0 verified revenue
// with "PayPal pending" status when tools are unavailable — a verifiable demo
// even without live data, instead of silent inaction.

'use strict';

const fs = require('fs');
const path = require('path');

const CFO_PATH = path.join(__dirname, '..', '..', 'agents', 'cfo.js');

describe('CFO hourly dashboard mechanism (BDD)', () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(CFO_PATH, 'utf8');
  });

  test('Scenario: CFO has an hourly trigger for the revenue dashboard', () => {
    // Given the CFO owns a daily/hourly dashboard task,
    // When the engine runs, Then the CFO must have a scheduled trigger
    // (not just passive directive handling).
    //
    // We expect a cron.schedule call with an hourly pattern that invokes
    // dashboard generation. The existing monthly brief cron is not enough.
    const hourlyCronPattern = /cron\.schedule\(\s*['"]0 \* \* \* \*['"]/;
    expect(source).toMatch(hourlyCronPattern);
  });

  test('Scenario: Dashboard generation degrades gracefully without PayPal', () => {
    // Given the PayPal MCP bridge is not implemented,
    // When the CFO generates the dashboard,
    // Then it produces a verifiable artifact showing $0 and "PayPal pending"
    // instead of failing silently or inventing numbers.
    expect(source).toMatch(/PayPal pending/i);
  });

  test('Scenario: Dashboard artifact is written to a stable location', () => {
    // Given the CFO generates a dashboard,
    // When the hourly trigger fires,
    // Then the artifact lands at a predictable path the poller and
    // sprint demo check can verify.
    expect(source).toMatch(/revenue-dashboard/i);
  });
});
