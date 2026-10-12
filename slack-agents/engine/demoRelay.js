#!/usr/bin/env node
/**
 * Demo Relay — passes agent demos from Slack to Jesse.
 *
 * Jesse's law (Oct 10, 2026): ALL demos go to Jesse for final approval.
 * Flow: agents demo in Slack → CEO relays EVERYTHING to Jesse in the main chat.
 *
 * No filtering — Jesse approves or rejects each demo himself.
 * Demos not meeting the standard are flagged as [NEEDS-WORK] but still relayed.
 *
 * Tracks relayed demos in .demo-relay-state.json to avoid duplicates.
 */

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '.demo-relay-state.json');
const SPRINT_DEMO_STATE = path.join(__dirname, '.sprint-demo-state.json');

// Jesse's demo standard — must match utils/agentBase.js DEMO_STANDARD
const ACTION_LABELS = ['[Needs Approval]', '[Needs Feedback]', '[FYI]'];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { relayed: {}, lastRelay: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Receipt-based demo qualification (Oct 12, 2026 — #724, Phase 3, US-108).
 *
 * The prose standard (qualifiesAsDemo) is DELETED. A demo exists for a
 * task iff the receipts ledger holds, within the window, an artifact
 * receipt attributable to that task — and, for file artifacts, the file
 * still exists with a matching hash at relay time (verify, don't
 * pattern-match). The relay line is formatted from receipt fields, so the
 * artifact Jesse sees is one the engine itself issued and just
 * re-verified, traceable to a receipt ID.
 */
const DEMO_ARTIFACT_KINDS = ['file', 'slack_message', 'vikunja_task'];

function demoForTask(taskId, { windowHours = 24 } = {}) {
  let artifacts;
  try {
    artifacts = require('./receipts').artifactsForTask(taskId);
  } catch (e) {
    return { qualifies: false, reason: `ledger unreadable: ${e.message}` };
  }
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const candidates = (artifacts || []).filter(a =>
    DEMO_ARTIFACT_KINDS.includes(a.kind) && new Date(a.ts).getTime() >= cutoff);
  if (!candidates.length) {
    return { qualifies: false, reason: 'no artifact receipt for this task in the window' };
  }
  const a = candidates[candidates.length - 1];
  if (a.kind === 'file') {
    let buf;
    try {
      buf = fs.readFileSync(a.ref);
    } catch {
      return { qualifies: false, reason: 'artifact failed re-verification: file missing (deleted since receipt)', staleReceipt: a };
    }
    if (a.sha256) {
      const sha = require('crypto').createHash('sha256').update(buf).digest('hex');
      if (sha !== a.sha256) {
        return { qualifies: false, reason: 'artifact failed re-verification: hash mismatch (file changed since receipt)', staleReceipt: a };
      }
    }
  }
  return {
    qualifies: true,
    demo: {
      taskId,
      agent: a.agentId || 'unknown',
      artifactKind: a.kind,
      artifactRef: a.ref,
      receiptId: a.receiptId,
      ts: a.ts,
      label: '[FYI]',
    },
  };
}

/** The relay line for a qualified demo — every field from the receipt. */
function formatRelayLine(demo) {
  return `[RELAY-DEMO] ${demo.label || '[FYI]'} | ${demo.agent} | task #${demo.taskId} | ${demo.artifactKind}: ${demo.artifactRef} | receipt ${demo.receiptId}`;
}

/**
 * Verify an artifact URL is live (returns 2xx).
 * Used by the relay before surfacing to Jesse — "living artifact link."
 */
async function verifyArtifactLink(url) {
  try {
    const axios = require('axios');
    const resp = await axios.head(url, { timeout: 10000, maxRedirects: 5 });
    return resp.status >= 200 && resp.status < 400;
  } catch {
    try {
      // Fallback to GET if HEAD is not allowed
      const axios = require('axios');
      const resp = await axios.get(url, { timeout: 10000, maxRedirects: 5, maxContentLength: 1024 * 1024 });
      return resp.status >= 200 && resp.status < 400;
    } catch {
      return false;
    }
  }
}

module.exports = {
  demoForTask,
  formatRelayLine,
  verifyArtifactLink,
  loadState,
  saveState,
  scanForDemos,
  ACTION_LABELS,
};

/**
 * Scan Slack channels for demo messages from agents.
 * Returns array of qualifying demos not yet relayed.
 */
async function scanForDemos() {
  const { WebClient } = require('@slack/web-api');
  const { execFileSync } = require('child_process');

  let token;
  try {
    const fetch = `import sys
sys.path.insert(0, '/opt/hatch/skills/skill-creator/bin')
from dynamic_credentials import dynamic_credential_entry
entry = dynamic_credential_entry('custom.slack')
sys.stdout.write(entry['surrogate'])`;
    token = execFileSync('python3', ['-c', fetch], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch (e) {
    console.log('[demoRelay] Token fetch failed, skipping scan');
    return [];
  }

  const client = new WebClient(token);
  const channels = ['C0ASH4TF604', 'C0ASDH1HC1Y', 'C0ASA532BGD']; // #management, #marketing, etc.
  const twoHoursAgo = Date.now() / 1000 - 7200;

  const state = loadState();
  const newDemos = [];

  for (const channelId of channels) {
    try {
      const hist = await client.conversations.history({ channel: channelId, limit: 50 });
      const recent = (hist.messages || []).filter(m => parseFloat(m.ts) > twoHoursAgo);

      for (const m of recent) {
        const text = m.text || '';
        // Skip directives (inputs), only look at agent outputs
        if (text.includes('[from: CEO')) continue;
        const isAgentPost = text.includes('[from:') || text.includes('[work engine');
        const isAutonomousDemo = text.includes('[DEMO]');
        if (!isAgentPost && !isAutonomousDemo) continue;

        // Skip already relayed
        const msgKey = `${channelId}:${m.ts}`;
        if (state.relayed[msgKey]) continue;

        // Autonomous [DEMO] posts carry a local artifact path, not a URL.
        // Read the file and relay its content directly — Jesse reads it in chat.
        if (isAutonomousDemo && !isAgentPost) {
          const pathMatch = text.match(/Artifact:\s*(\/home\/hatch\/workspace\/[^\s]+)/);
          if (pathMatch) {
            try {
              const content = fs.readFileSync(pathMatch[1], 'utf8');
              const agentMatch2 = text.match(/\[DEMO\]\s*(\w+)/);
              const demo = {
                label: '[FYI]',
                title: `${agentMatch2 ? agentMatch2[1] : 'agent'} hourly autonomous demo`,
                artifactLink: null,
                localPath: pathMatch[1],
                agent: agentMatch2 ? agentMatch2[1].toLowerCase() : 'unknown',
                task: 'hourly',
                timestamp: m.ts,
                fullText: content.slice(0, 3000),
                needsWork: false,
                needsWorkReason: null,
              };
              demo.channelId = channelId;
              demo.msgKey = msgKey;
              newDemos.push(demo);
              state.relayed[msgKey] = {
                relayedAt: new Date().toISOString(),
                agent: demo.agent,
                title: demo.title,
              };
            } catch (e) {
              console.log(`[demoRelay] Could not read artifact ${pathMatch[1]}: ${e.message}`);
            }
          }
          continue;
        }

        // Receipt-based qualification (#724 Phase 3): the message must
        // reference a task, and that task must hold a live artifact
        // receipt. The message's own prose qualifies nothing.
        const taskMatch = text.match(/task\s*#?(\d+)/i) || text.match(/#(\d{2,})/);
        if (!taskMatch) continue;
        const demoCheck = demoForTask(parseInt(taskMatch[1], 10));
        if (demoCheck.qualifies) {
          const d = demoCheck.demo;
          const demo = {
            label: d.label,
            title: (text.split('\n').find(l => l.trim()) || `Task #${d.taskId} demo`).slice(0, 120),
            artifactLink: d.artifactRef,
            agent: d.agent,
            task: `#${d.taskId}`,
            timestamp: m.ts,
            fullText: text,
            needsWork: false,
            needsWorkReason: null,
            receiptId: d.receiptId,
          };
          demo.channelId = channelId;
          demo.msgKey = msgKey;

          newDemos.push(demo);
          state.relayed[msgKey] = {
            relayedAt: new Date().toISOString(),
            agent: demo.agent,
            title: demo.title,
          };
        }
      }
    } catch (e) {
      console.log(`[demoRelay] Channel ${channelId} scan failed: ${e.message}`);
    }
  }

  if (newDemos.length > 0) {
    state.lastRelay = new Date().toISOString();
    saveState(state);
  }

  return newDemos;
}

// CLI: check a task's receipt-backed demo status
if (require.main === module) {
  const taskId = parseInt(process.argv[2], 10);
  if (taskId) {
    console.log(JSON.stringify(demoForTask(taskId), null, 2));
  } else {
    console.log('Usage: node demoRelay.js <taskId>');
    console.log('Shows whether the task holds a relayable artifact receipt.');
  }
}
