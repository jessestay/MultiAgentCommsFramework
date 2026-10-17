// @macf/core — Connector Interface
//
// All platform connectors must implement this interface.
// The Slack connector and Cursor connector are reference implementations.

/**
 * MacfConnector — abstract base class for platform connectors
 *
 * A connector translates between:
 *   Platform events (Slack @mention, Cursor chat message, webhook) → MACF tasks
 *   MACF agent outputs → Platform messages
 */
class MacfConnector {
  constructor(config = {}) {
    this.config = config;
    this.registry = null;  // set by MacfRuntime.mount(connector)
  }

  /**
   * Called by MacfRuntime with the agent registry after mounting.
   * @param {AgentRegistry} registry
   */
  setRegistry(registry) {
    this.registry = registry;
  }

  /**
   * Called when an inbound event arrives from the platform.
   * The connector is responsible for:
   *   1. Parsing the raw platform event into a normalized MacfMessage
   *   2. Determining which agent should handle it
   *   3. Calling onMessage (override this in subclass)
   *
   * @param {object} rawEvent - raw platform event (Slack event payload, etc.)
   * @returns {Promise<void>}
   */
  async handleInbound(rawEvent) {
    throw new Error('handleInbound() must be implemented by connector');
  }

  /**
   * Post a message from an agent to the platform.
   *
   * @param {string} agentKey - which agent is posting
   * @param {string} channel - where to post
   * @param {string} text - message content
   * @param {object} options - platform-specific options (thread_ts, blocks, etc.)
   * @returns {Promise<object>} platform response
   */
  async postMessage(agentKey, channel, text, options = {}) {
    throw new Error('postMessage() must be implemented by connector');
  }

  /**
   * Trigger agent-to-agent communication.
   * Default implementation: posts to target channel + calls handleInbound.
   * Connectors can override for more efficient delivery.
   *
   * @param {string} fromAgent - source agent key
   * @param {string} toAgent - target agent key
   * @param {string} message - the message/task
   * @returns {Promise<void>}
   */
  async agentToAgent(fromAgent, toAgent, message) {
    throw new Error('agentToAgent() must be implemented by connector');
  }

  /**
   * Start the connector (register webhooks, poll for events, etc.)
   * Called once by MacfRuntime.
   * @returns {Promise<void>}
   */
  async start() {
    // Optional: override in subclass
  }

  /**
   * Stop the connector gracefully.
   * @returns {Promise<void>}
   */
  async stop() {
    // Optional: override in subclass
  }
}

/**
 * Normalized inbound message — connector converts platform events to this.
 */
class MacfMessage {
  constructor({ agentKey, text, channel, channelId, threadTs, userId, history, meta }) {
    this.agentKey = agentKey;    // which agent should handle this
    this.text = text;             // cleaned message text (mentions stripped)
    this.channel = channel;       // channel name
    this.channelId = channelId;   // platform channel ID
    this.threadTs = threadTs;     // thread timestamp if in thread
    this.userId = userId;         // sender's platform user ID
    this.history = history || []; // recent channel history for context
    this.meta = meta || {};       // platform-specific extras
  }
}

module.exports = { MacfConnector, MacfMessage };
