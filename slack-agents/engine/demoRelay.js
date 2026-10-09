#!/usr/bin/env node
/**
 * Demo Relay — passes agent demos from Slack to Jesse.
 *
 * Jesse's law (Oct 8, 2026): "No link, not a demo."
 * Flow: agents demo in Slack → CEO verifies against DEMO_STANDARD → qualifying
 * demos get relayed to Jesse in the main chat.
 *
 * Only demos meeting the standard are relayed:
 * - Must have an ACTION LABEL: [Needs Approval], [Needs Feedback], or [FYI]
 * - Must have an ARTIFACT LINK (living link, not a description)
 * - Must have a TASK REFERENCE
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
 * Check if a Slack message qualifies as a demo under Jesse's standard.
 * Returns { qualifies: bool, reason: string, artifactLink: string|null }
 *
 * A real demo must DEMONSTRATE work, not just mention it. The checks:
 * 1. Action label present ([Needs Approval], [Needs Feedback], [FYI])
 * 2. Artifact link present AND verifiable (URL resolves)
 * 3. Task reference present
 * 4. Substantive description of the work (not just "copy that" / "done")
 * 5. Evidence section or concrete deliverable description
 */
function qualifiesAsDemo(text) {
  if (!text || typeof text !== 'string') {
    return { qualifies: false, reason: 'empty' };
  }

  // 1. Must have an action label
  const hasLabel = ACTION_LABELS.some(label =>
    text.toUpperCase().includes(label.toUpperCase())
  );
  if (!hasLabel) {
    return { qualifies: false, reason: 'no action label' };
  }

  // 2. Must have an artifact link (URL)
  const urlMatch = text.match(/https?:\/\/[^\s<>"]+/);
  if (!urlMatch) {
    return { qualifies: false, reason: 'no artifact link — no link, not a demo' };
  }

  // 3. Must reference a task
  const taskMatch = text.match(/task\s*#?\d+/i) || text.match(/#\d{2,}/);
  if (!taskMatch) {
    return { qualifies: false, reason: 'no task reference' };
  }

  // 4. Must have substantive description — not just an acknowledgment
  // Strip the label, URL, and task ref, then check what's left
  let substantive = text;
  for (const label of ACTION_LABELS) {
    substantive = substantive.replace(new RegExp(label.replace(/[[\]]/g, '\\$&'), 'gi'), '');
  }
  substantive = substantive.replace(/https?:\/\/[^\s<>"]+/g, '');
  substantive = substantive.replace(/task\s*#?\d+/gi, '');
  substantive = substantive.replace(/#\d{2,}/g, '');
  substantive = substantive.replace(/\[from:[^\]]+\]/gi, '');
  substantive = substantive.replace(/\[work engine[^\]]*\]/gi, '');
  substantive = substantive.trim();

  // Acknowledgment patterns that are NOT demos
  const ackPatterns = [
    /^(copy that|got it|acknowledged|roger|understood|will do|on it)[\s.!]*$/i,
    /^(copy that|got it)[\s.!]*holding/i,
    /nothing from me goes live without/i,
    /^(done|completed|finished)[\s.!]*$/i,
  ];
  for (const pattern of ackPatterns) {
    if (pattern.test(substantive)) {
      return { qualifies: false, reason: 'acknowledgment, not a demo — no work demonstrated' };
    }
  }

  // Must have minimum substantive content (at least 20 meaningful words
  // describing the work, not just filler)
  const words = substantive.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 20) {
    return { qualifies: false, reason: `insufficient description (${words.length} words, need 20+) — describe the work` };
  }

  // 5. Must describe WHAT was built/done (deliverable language)
  const deliverableSignals = [
    /built|created|generated|wrote|designed|implemented|completed|finished|produced/i,
    /artifact|deliverable|report|document|design|draft|version|update/i,
    /here(?:'s| is)|attached|linked|below/i,
    /##\s+\w+/,  // Markdown section headers (Artifact Link, Evidence, etc.)
  ];
  const hasDeliverableSignal = deliverableSignals.some(p => p.test(text));
  if (!hasDeliverableSignal) {
    return { qualifies: false, reason: 'no deliverable described — what was built?' };
  }

  return {
    qualifies: true,
    reason: 'meets standard',
    artifactLink: urlMatch[0],
  };
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

/**
 * Format a qualifying demo for Jesse.
 */
function formatForJesse(demo) {
  const label = ACTION_LABELS.find(l =>
    demo.text.toUpperCase().includes(l.toUpperCase())
  ) || '[FYI]';

  // Extract title (first meaningful line after label)
  const lines = demo.text.split('\n').filter(l => l.trim());
  const title = lines.find(l =>
    !ACTION_LABELS.some(al => l.toUpperCase().includes(al.toUpperCase()))
  ) || 'Untitled demo';

  return {
    label,
    title: title.slice(0, 120),
    artifactLink: demo.artifactLink,
    agent: demo.agentId,
    task: demo.taskRef,
    timestamp: demo.ts,
    fullText: demo.text,
  };
}

module.exports = {
  qualifiesAsDemo,
  verifyArtifactLink,
  formatForJesse,
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
        if (!text.includes('[from:') && !text.includes('[work engine')) continue;

        // Skip already relayed
        const msgKey = `${channelId}:${m.ts}`;
        if (state.relayed[msgKey]) continue;

        const check = qualifiesAsDemo(text);
        if (check.qualifies) {
          // Verify the artifact link is actually live before relaying
          const linkLive = await verifyArtifactLink(check.artifactLink);
          if (!linkLive) {
            console.log(`[demoRelay] Skipping ${msgKey}: artifact link dead (${check.artifactLink})`);
            continue;
          }

          const agentMatch = text.match(/\[from:\s*(\w+)/) || text.match(/\[work engine →\s*(\w+)/);
          const taskMatch = text.match(/task\s*#?(\d+)/i) || text.match(/#(\d{2,})/);

          const demo = formatForJesse({
            text,
            agentId: agentMatch ? agentMatch[1].toLowerCase() : 'unknown',
            taskRef: taskMatch ? `#${taskMatch[1]}` : 'unknown',
            ts: m.ts,
            artifactLink: check.artifactLink,
          });
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

// CLI: test a message against the standard
if (require.main === module) {
  const testText = process.argv.slice(2).join(' ');
  if (testText) {
    const result = qualifiesAsDemo(testText);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage: node demoRelay.js "<message text>"');
    console.log('Tests whether a message meets Jesse\'s demo standard.');
  }
}
