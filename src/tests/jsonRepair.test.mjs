import test from 'node:test';
import assert from 'node:assert';
import { safeParseJSON, stripFences, repairTruncatedJSON } from '../lib/jsonRepair.js';

test('jsonRepair — stripFences removes closed and open markdown fences', () => {
  const fenced = "```json\n{\"a\": 1}\n```";
  assert.strictEqual(stripFences(fenced), '{"a": 1}');

  const unclosed = "```json\n{\"a\": 1, \"b\": 2";
  assert.strictEqual(stripFences(unclosed), '{"a": 1, "b": 2');
});

test('jsonRepair — safeParseJSON parses standard JSON', () => {
  const input = '{"expressions": [{"expr": "test"}]}';
  const res = safeParseJSON(input);
  assert.deepStrictEqual(res, { expressions: [{ expr: 'test' }] });
});

test('jsonRepair — safeParseJSON handles text before JSON object', () => {
  const input = 'Here is the JSON:\n{"expressions": [{"expr": "hello"}]}';
  const res = safeParseJSON(input);
  assert.deepStrictEqual(res, { expressions: [{ expr: 'hello' }] });
});

test('jsonRepair — repairTruncatedJSON recovers JSON cut off inside a string property', () => {
  const truncated = '{"expressions": [{"expr": "get through", "decomposition": "some incomplete text without closing quote';
  const res = repairTruncatedJSON(truncated);
  assert.ok(res);
  assert.ok(Array.isArray(res.expressions));
  assert.strictEqual(res.expressions[0].expr, 'get through');
});

test('jsonRepair — safeParseJSON recovers real-world truncated chunk output', () => {
  const truncatedChunk = '```json\n{\n  "expressions": [\n    {\n      "expr": "get through to someone",\n      "ipa": "ɡɛt θʁuː ˈtuː ˈsʌmwən",\n      "meaning": "parvenir à faire comprendre, à atteindre quelqu’un",\n      "decomposition": "* **get :** sens physique de bouger ➔ **glissement :** atteindre';
  const res = safeParseJSON(truncatedChunk);
  assert.strictEqual(res.expressions[0].expr, 'get through to someone');
  assert.strictEqual(res.expressions[0].meaning, 'parvenir à faire comprendre, à atteindre quelqu’un');
});

test('jsonRepair — throws error on empty or unrepairable input', () => {
  assert.throws(() => safeParseJSON(''), /Réponse IA vide/);
  assert.throws(() => safeParseJSON('invalid text without json'), /JSON invalide\/tronqué/);
});
