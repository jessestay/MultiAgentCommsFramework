import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fetch from 'node-fetch';

const root = path.join(process.cwd(), '.cursor');
const brokerDir = path.join(root, 'auth-broker');
const runnerDir = path.join(root, 'runner');

const genHex = () => crypto.randomBytes(32).toString('hex');

const ensureEnv = (file, contentBuilder) => {
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, contentBuilder(), 'utf8');
};

const ensureDeps = async (cwd) => new Promise((resolve, reject) => {
  if (fs.existsSync(path.join(cwd, 'node_modules'))) return resolve();
  const proc = spawn('npm', ['install'], { cwd, stdio: 'inherit' });
  proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm install failed ${code}`))));
});

const spawnService = (cwd, entry) => {
  const proc = spawn('node', [entry], { cwd, stdio: 'ignore', detached: true });
  proc.unref();
  return proc;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function healthCheck(url) {
  try {
    const resp = await fetch(url, { timeout: 2000 });
    if (!resp.ok) return false;
    const js = await resp.json();
    return js.ok === true;
  } catch {
    return false;
  }
}

async function ensureBroker() {
  const envFile = path.join(brokerDir, '.env');
  ensureEnv(envFile, () => {
    return [
      `AUTH_BROKER_SECRET=${genHex()}`,
      `AUTH_BROKER_TOKEN=${genHex()}`,
      'ALLOWED_DOMAINS=chat.openai.com,canva.com',
      'DATA_DIR=./data',
      'PORT=8787',
      'NODE_ENV=production',
    ].join('\n');
  });
  await ensureDeps(brokerDir);
  spawnService(brokerDir, 'src/server.js');
  for (let i = 0; i < 10; i += 1) {
    if (await healthCheck('http://localhost:8787/health')) return;
    await sleep(300);
  }
  throw new Error('Auth Broker failed to start');
}

async function ensureRunner() {
  const brokerEnv = fs.readFileSync(path.join(brokerDir, '.env'), 'utf8');
  const brokerToken = (brokerEnv.match(/AUTH_BROKER_TOKEN=(.+)/) || [])[1] || 'replace-broker-token';
  const envFile = path.join(runnerDir, '.env');
  ensureEnv(envFile, () => {
    return [
      'PORT=8788',
      'AUTH_BROKER_URL=http://localhost:8787',
      `AUTH_BROKER_TOKEN=${brokerToken}`,
      'BROWSERLESS_URL=https://chrome.browserless.io/function',
      'BROWSERLESS_TOKEN=replace-with-browserless-token',
      'TENANT_DEFAULT=default',
      'ALLOWED_DOMAINS=chat.openai.com,canva.com',
      'OUTPUT_DIR=./out',
    ].join('\n');
  });
  await ensureDeps(runnerDir);
  spawnService(runnerDir, 'src/server.js');
  for (let i = 0; i < 10; i += 1) {
    if (await healthCheck('http://localhost:8788/health')) return;
    await sleep(300);
  }
  throw new Error('Runner failed to start');
}

export async function ensureBrowserDemoStack() {
  await ensureBroker();
  await ensureRunner();
}

// If executed directly (optional manual bootstrap)
if (process.env.MCP_BOOTSTRAP_RUN === '1') {
  ensureBrowserDemoStack()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('Browser demo stack ready (broker 8787, runner 8788). Configure Browserless token in .cursor/runner/.env if needed.');
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}

