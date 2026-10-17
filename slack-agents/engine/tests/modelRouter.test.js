/**
 * BDD: Model configuration switching
 *
 * Feature: Model selection via configuration
 *   As a MACF operator
 *   I want to switch LLM models by editing a config file
 *   So that I can upgrade/downgrade models without code changes
 */

const { getModelForTier, getFallbackChain, getModelInfo, reloadConfig } = require('../../utils/modelRouter');

describe('Feature: Model configuration switching', () => {
  beforeEach(() => {
    reloadConfig();
  });

  // Oct 11, 2026: tiers reference desktop-gateway ALIASES, not raw model ids.
  // macf-smart-paid = DeepSeek V4 Flash primary (gateway resolves the alias);
  // the paid->paid->free continuation (Haiku 5.5 -> free) lives in the
  // gateway's router_settings.fallbacks, the second layer of the chain.
  describe('Scenario: Paid model is primary for smart tier', () => {
    test('Smart tier uses paid gateway alias as primary', () => {
      const model = getModelForTier('smart');
      expect(model).toBe('macf-smart-paid');
      const info = getModelInfo(model);
      expect(info.description).toMatch(/paid/i);
    });
  });

  describe('Scenario: Paid model fallback chain', () => {
    test('Smart tier tries paid alias before free fallback', () => {
      const chain = getFallbackChain('smart');
      expect(chain[0]).toBe('macf-smart-paid');
      expect(chain[chain.length - 1]).toBe('macf-smart-free');
    });

    test('Smart tier has a paid option before free fallback', () => {
      const chain = getFallbackChain('smart');
      const paidModels = chain.filter(id => !id.includes('free'));
      expect(paidModels.length).toBeGreaterThanOrEqual(1);
      expect(paidModels[0]).toBe('macf-smart-paid');
    });

    test('Each model has cost info for budget tracking', () => {
      const chain = getFallbackChain('smart');
      for (const modelId of chain) {
        const info = getModelInfo(modelId);
        expect(info).not.toBeNull();
        expect(typeof info.cost_per_1m).toBe('number');
      }
    });
  });

  describe('Scenario: Fallback chain provides alternatives', () => {
    test('Fallback chain lists models in priority order', () => {
      const chain = getFallbackChain('smart');
      expect(Array.isArray(chain)).toBe(true);
      expect(chain.length).toBeGreaterThan(0);
      expect(chain[0]).toBe(getModelForTier('smart'));
    });

    test('Unknown tier returns empty chain', () => {
      expect(getFallbackChain('nonexistent')).toEqual([]);
    });
  });

  describe('Scenario: All tiers are configured', () => {
    test('quick, smart, and best tiers all have at least one model', () => {
      for (const tier of ['quick', 'smart', 'best']) {
        const chain = getFallbackChain(tier);
        expect(chain.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Scenario: Model info lookup', () => {
    test('Can look up provider and cost for any configured model', () => {
      const info = getModelInfo('macf-cheap');
      expect(info.provider).toBe('litellm');
      expect(info.tier).toBe('quick');
    });

    test('Returns null for unconfigured model', () => {
      expect(getModelInfo('nonexistent-model-xyz')).toBeNull();
    });
  });
});
