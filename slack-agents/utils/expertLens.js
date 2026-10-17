// utils/expertLens.js — Load expert playbook contents into generation context.
//
// ROOT-CAUSE FIX (Oct 6, 2026): config.js referenced the playbook FILES
// (~/workspace/macf/team-skills/*.md) but the LLM only saw one-paragraph
// summaries. The generated copy scored 2/5 for voice and expert lens because
// the actual guidance never reached the model. This utility loads the real
// file contents so CMO/CCO generation can include them.
'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', '..', 'macf', 'team-skills');
// Fallback for when the relative path doesn't resolve (e.g. different cwd)
const SKILLS_DIR_ABS = '/home/hatch/workspace/macf/team-skills';

const cache = {};

function skillsDir() {
  if (fs.existsSync(SKILLS_DIR)) return SKILLS_DIR;
  return SKILLS_DIR_ABS;
}

function loadLens(slug) {
  if (cache[slug]) return cache[slug];
  const filePath = path.join(skillsDir(), `${slug}.md`);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    cache[slug] = content;
    return content;
  } catch (e) {
    console.error(`[expertLens] Failed to load ${slug}:`, e.message);
    return '';
  }
}

// Load the core lenses for content generation: Jesse's voice, brand ambassador,
// and TJ Robertson's content process. Returns a condensed context block.
function loadContentLenses() {
  const voice = loadLens('jesse-voice');
  const ambassador = loadLens('jesse-stay-ambassador');
  const tjRobertson = loadLens('tj-robertson');

  // Condense: take the most actionable sections, not the full files.
  // Full files are ~20KB; we target ~3KB of high-signal guidance.
  const condense = (text, maxChars) => {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    // Take the beginning (usually principles) + key sections
    return text.slice(0, maxChars) + '\n...[truncated]';
  };

  return `
=== JESSE'S VOICE (how he writes) ===
${condense(voice, 1500)}

=== JESSE STAY BRAND AMBASSADOR (who he is) ===
${condense(ambassador, 1500)}

=== TJ ROBERTSON CONTENT PROCESS (how to structure) ===
${condense(tjRobertson, 1200)}
`.trim();
}

module.exports = { loadLens, loadContentLenses };
