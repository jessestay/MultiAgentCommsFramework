#!/usr/bin/env node
/**
 * Refresh worker stub: logs into target domain with service creds, captures storageState, posts to Auth Broker.
 * Replace the login steps per domain.
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

const AUTH_BROKER_URL = process.env.AUTH_BROKER_URL || 'http://localhost:8787';
const AUTH_BROKER_TOKEN = process.env.AUTH_BROKER_TOKEN || '';
const TENANT = process.env.TENANT || 'default';
const DOMAIN = process.env.DOMAIN || 'chat.openai.com';

// Service credentials (example; replace with your secret manager)
const USERNAME = process.env.SERVICE_USERNAME || '';
const PASSWORD = process.env.SERVICE_PASSWORD || '';

const tmpState = path.join(process.cwd(), `.state-${Date.now()}.json`);

async function loginAndCapture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // TODO: implement domain-specific login flows.
  await page.goto(`https://${DOMAIN}`, { waitUntil: 'networkidle' });
  if (USERNAME && PASSWORD) {
    // page.fill('#username', USERNAME); page.fill('#password', PASSWORD); page.click('button[type=submit]');
  }

  await page.waitForTimeout(2000);
  await page.context().storageState({ path: tmpState });
  await browser.close();

  return fs.readFileSync(tmpState, 'utf8');
}

async function postToBroker(stateJson) {
  const body = {
    tenant: TENANT,
    domain: DOMAIN,
    state: JSON.parse(stateJson),
    metadata: { source: 'service-account', refreshed_by: 'refresh-worker' },
  };
  const resp = await fetch(`${AUTH_BROKER_URL}/auth/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': AUTH_BROKER_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Broker error ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function main() {
  if (!AUTH_BROKER_TOKEN) throw new Error('AUTH_BROKER_TOKEN required');
  const state = await loginAndCapture();
  const res = await postToBroker(state);
  // eslint-disable-next-line no-console
  console.log('Refreshed state', res);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

