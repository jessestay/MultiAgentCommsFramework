// @macf/core — Agent Registry
//
// Loads role definitions from YAML, merges with instance config,
// and assembles each agent's system prompt from the template + context.
//
// Usage:
//   const registry = new AgentRegistry('./macf/registry', './config/agents.yaml');
//   await registry.load();
//   const prompt = registry.getSystemPrompt('marketing');

const fs = require('fs');
const path = require('path');

// Minimal YAML parser for role files (avoids heavy dependency)
// For production use, swap in `js-yaml` or `yaml` package.
function parseSimpleYaml(content) {
  try {
    // If js-yaml is available, use it
    const yaml = require('js-yaml');
    return yaml.load(content);
  } catch {
    // Fallback: return raw content wrapped in object for inspection
    console.warn('[registry] js-yaml not available, role metadata will be limited');
    return { raw: content };
  }
}

class AgentRegistry {
  constructor(registryPath, instanceConfigPath) {
    this.registryPath = registryPath;
    this.instanceConfigPath = instanceConfigPath;
    this.roles = new Map();       // role key → role definition
    this.instanceConfig = null;   // loaded from agents.yaml
    this.agents = new Map();      // agent key → assembled config
  }

  /**
   * Load registry and instance config, assemble agents.
   * Call this once at startup.
   */
  async load() {
    // Load instance config
    if (this.instanceConfigPath && fs.existsSync(this.instanceConfigPath)) {
      const raw = fs.readFileSync(this.instanceConfigPath, 'utf8');
      this.instanceConfig = parseSimpleYaml(raw);
    }

    // Load all role YAML files from registry
    const rolesDir = path.join(this.registryPath, 'roles');
    if (fs.existsSync(rolesDir)) {
      for (const file of fs.readdirSync(rolesDir)) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
        const raw = fs.readFileSync(path.join(rolesDir, file), 'utf8');
        const roleDef = parseSimpleYaml(raw);
        if (roleDef?.role) {
          this.roles.set(roleDef.role, roleDef);
        }
      }
    }

    // Assemble agents from instance config
    if (this.instanceConfig?.agents) {
      for (const agentConfig of this.instanceConfig.agents) {
        if (!agentConfig.enabled) continue;
        const role = this.roles.get(agentConfig.role);
        if (!role) {
          console.warn(`[registry] No role definition found for: ${agentConfig.role}`);
          continue;
        }
        const assembled = this._assembleAgent(role, agentConfig);
        const key = agentConfig.channel || agentConfig.role;
        this.agents.set(key, assembled);
        this.agents.set(agentConfig.role, assembled); // also index by role
      }
    }

    console.log(`[registry] Loaded ${this.roles.size} roles, ${this.agents.size / 2} agents`);
    return this;
  }

  /**
   * Assemble an agent config from role definition + instance override
   */
  _assembleAgent(role, instanceConfig) {
    const owner = this.instanceConfig?.owner || {};
    const projects = this.instanceConfig?.projects || [];

    // Build agent roster string for system prompt injection
    const agentRoster = (this.instanceConfig?.agents || [])
      .filter(a => a.enabled && a.role !== instanceConfig.role)
      .map(a => {
        const r = this.roles.get(a.role);
        return `- ${r?.display_name || a.role} (#${a.channel}) — ${r?.description?.split('\n')[0] || ''}`;
      })
      .join('\n');

    // Build projects string
    const projectsStr = projects
      .map(p => `- ${p.name}${p.url ? ' (' + p.url + ')' : ''}: ${p.status}`)
      .join('\n');

    // Assemble system prompt from template
    let systemPrompt = role.system_prompt_template || '';
    systemPrompt = systemPrompt
      .replace(/\{owner\.name\}/g, owner.name || '')
      .replace(/\{owner\.title\}/g, owner.title || '')
      .replace(/\{owner\.context\}/g, owner.context || '')
      .replace(/\{briefing_time\}/g, owner.briefing_time || '8am')
      .replace(/\{agent_roster\}/g, agentRoster)
      .replace(/\{projects\}/g, projectsStr)
      .replace(/\{agent\.context\}/g, instanceConfig.context || '')
      .replace(/\{communication\.style\}/g, role.communication?.style || '');

    return {
      role: role.role,
      name: instanceConfig.display_name || role.display_name || role.name,
      emoji: instanceConfig.emoji || role.emoji,
      slack_emoji: instanceConfig.slack_emoji || role.slack_emoji,
      channel: instanceConfig.channel,
      systemPrompt,
      capabilities: role.capabilities || [],
      boundaries: role.boundaries || {},
      crons: role.crons || [],
      raw: { role, instanceConfig },
    };
  }

  /**
   * Get an agent's assembled config by key (role name or channel name)
   */
  getAgent(key) {
    return this.agents.get(key) || null;
  }

  /**
   * Get an agent's system prompt
   */
  getSystemPrompt(key) {
    return this.getAgent(key)?.systemPrompt || null;
  }

  /**
   * Get all agent keys
   */
  getAgentKeys() {
    return [...new Set([...this.agents.keys()])]
      .filter(k => this.agents.get(k)?.channel); // dedupe by having a channel
  }
}

module.exports = { AgentRegistry };
