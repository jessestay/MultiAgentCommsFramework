/**
 * engine/tests/kernel-m2-strict.test.js
 *
 * M2 of the execution kernel (Vikunja #771) — native strict tool
 * calling. Spec: EXECUTION-KERNEL-SPEC.md, US-2 (tools execute only as
 * typed steps): on the OpenAI-format route, tool definitions are sent
 * with strict: true and strict-normalized schemas (additionalProperties
 * false, every property required, originally-optional properties made
 * nullable). Strict mode makes the provider enforce the schema at
 * generation time instead of the engine cleaning up malformed calls
 * after the fact.
 *
 * BDD:
 * - Given the tool registry, every OpenAI-format def carries strict
 *   true and a normalized parameters schema.
 * - Given an optional property, it becomes required-but-nullable.
 * - Given a nested object property, normalization recurses.
 */
'use strict';

const { openAiToolDefs, normalizeStrictSchema } = require('../../utils/anthropic');

const TOOLS = {
  urlCheck: {
    description: 'Check a URL',
    argsSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  fileWrite: {
    description: 'Write a file',
    argsSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        append: { type: 'boolean' },
        meta: {
          type: 'object',
          properties: { author: { type: 'string' }, draft: { type: 'boolean' } },
          required: ['author'],
        },
      },
      required: ['path', 'content'],
    },
  },
};

describe('M2 strict tool calling: OpenAI-format defs are strict-normalized', () => {
  test('Given the registry, then every def is strict with additionalProperties false', () => {
    const defs = openAiToolDefs(TOOLS);
    expect(defs).toHaveLength(2);
    for (const d of defs) {
      expect(d.type).toBe('function');
      expect(d.function.strict).toBe(true);
      expect(d.function.parameters.additionalProperties).toBe(false);
    }
  });

  test('Given an optional property, then it becomes required and nullable; required props keep their type', () => {
    const fw = openAiToolDefs(TOOLS).find(d => d.function.name === 'fileWrite');
    expect(new Set(fw.function.parameters.required)).toEqual(new Set(['path', 'content', 'append', 'meta']));
    expect(fw.function.parameters.properties.append.type).toEqual(['boolean', 'null']);
    expect(fw.function.parameters.properties.path.type).toBe('string');
  });

  test('Given a nested object property, then normalization recurses into it', () => {
    const fw = openAiToolDefs(TOOLS).find(d => d.function.name === 'fileWrite');
    const meta = fw.function.parameters.properties.meta;
    expect(meta.additionalProperties).toBe(false);
    expect(new Set(meta.required)).toEqual(new Set(['author', 'draft']));
    expect(meta.properties.draft.type).toEqual(['boolean', 'null']);
    expect(meta.properties.author.type).toBe('string');
    // meta itself was optional at the top level → nullable, type list keeps 'object'
    expect(fw.function.parameters.properties.meta.type).toEqual(['object', 'null']);
  });

  test('Given normalizeStrictSchema on a bare schema, then the input is not mutated', () => {
    const input = { type: 'object', properties: { a: { type: 'string' } }, required: [] };
    const out = normalizeStrictSchema(input);
    expect(input.additionalProperties).toBeUndefined();
    expect(out.required).toEqual(['a']);
    expect(out.properties.a.type).toEqual(['string', 'null']);
  });
});
