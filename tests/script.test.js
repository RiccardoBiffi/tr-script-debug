import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialForm } from '../src/data/presets.js';
import {
  buildTaprootArtifacts,
  buildTaprootArtifactsWithTree,
  bytesToHex,
  castToBool,
  decodeScriptNum,
  encodeScriptNum,
  normalizeInternalKey,
  parseLockingScriptInput,
  parseScript,
  parseWitness,
} from '../src/lib/script.js';

const INTERNAL_KEY = createInitialForm().internalKey;

test('encodeScriptNum and decodeScriptNum round-trip representative values', () => {
  const values = [0n, 1n, 16n, 127n, 128n, 255n, -1n, -17n, -128n, -255n];

  for (const value of values) {
    const encoded = encodeScriptNum(value);
    const decoded = decodeScriptNum(encoded, 8);
    assert.equal(decoded, value, `Expected ${value} to round-trip`);
  }
});

test('castToBool treats negative zero as false and non-zero bytes as true', () => {
  assert.equal(castToBool(Uint8Array.from([])), false);
  assert.equal(castToBool(Uint8Array.from([0x80])), false);
  assert.equal(castToBool(Uint8Array.from([0x00, 0x80])), false);
  assert.equal(castToBool(Uint8Array.from([0x01])), true);
  assert.equal(castToBool(Uint8Array.from([0x00, 0x01])), true);
});

test('parseScript handles comments, strings, hex pushes, and tapscript opcode aliases', () => {
  const script = parseScript(`
    // comment
    1
    "hi"
    <00ff>
    OP_CAT
    OP_TRUE
    # end
  `);

  assert.deepEqual(script.errors, []);
  assert.equal(script.instructions[0].label, 'OP_1');
  assert.equal(script.instructions[1].type, 'push');
  assert.equal(bytesToHex(script.instructions[1].data), '6869');
  assert.equal(script.instructions[3].label, 'OP_CAT');
  assert.equal(script.encodedWords.at(-2), 'OP_SUCCESS126');
  assert.equal(script.encodedWords.at(-1), 'OP_1');
  assert.match(script.scriptHex, /^[0-9a-f]+$/);
});

test('parseWitness supports empty vectors and reports malformed rows', () => {
  const witness = parseWitness('0x\n<>\n"ok"\n1 2');

  assert.equal(witness.items.length, 3);
  assert.equal(witness.items[0].hex, '');
  assert.equal(witness.items[1].hex, '');
  assert.equal(witness.items[2].hex, '6f6b');
  assert.equal(witness.errors.length, 1);
  assert.match(witness.errors[0], /Witness line 4 must contain exactly one item/);
});

test('normalizeInternalKey accepts x-only and compressed keys and rejects invalid input', () => {
  const compressed = `02${INTERNAL_KEY}`;

  assert.equal(normalizeInternalKey(INTERNAL_KEY.toUpperCase()), INTERNAL_KEY);
  assert.equal(normalizeInternalKey(compressed), INTERNAL_KEY);
  assert.throws(() => normalizeInternalKey('xyz'), /Internal key must be hex/);
});

test('buildTaprootArtifacts returns usable address and script pubkey data', () => {
  const script = parseScript('OP_TRUE');
  const artifacts = buildTaprootArtifacts(script.encodedWords, INTERNAL_KEY, 'regtest');

  assert.match(artifacts.tapleaf, /^[0-9a-f]{64}$/);
  assert.match(artifacts.outputKey, /^[0-9a-f]{64}$/);
  assert.match(artifacts.controlBlock, /^[0-9a-f]+$/);
  assert.match(artifacts.address, /^bcrt1p/);
  assert.equal(artifacts.scriptPubKeyWords[0], 'OP_1');
});

test('buildTaprootArtifactsWithTree supports nested tap tree definitions', () => {
  const target = parseScript('OP_TRUE');
  const leafA = parseScript('1 OP_ADD 2 OP_EQUAL');
  const leafB = parseScript('10 OP_CHECKSEQUENCEVERIFY OP_DROP OP_TRUE');
  const leafC = parseScript('840000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE');
  const leafD = parseScript('"vault" OP_DROP OP_TRUE');
  const treeDefinition = {
    type: 'branch',
    children: [
      {
        type: 'branch',
        children: [
          { type: 'target' },
          { type: 'leaf', encodedWords: leafA.encodedWords },
        ],
      },
      {
        type: 'branch',
        children: [
          { type: 'leaf', encodedWords: leafB.encodedWords },
          {
            type: 'branch',
            children: [
              { type: 'leaf', encodedWords: leafC.encodedWords },
              { type: 'leaf', encodedWords: leafD.encodedWords },
            ],
          },
        ],
      },
    ],
  };

  const artifacts = buildTaprootArtifactsWithTree(target.encodedWords, INTERNAL_KEY, 'regtest', treeDefinition);

  assert.match(artifacts.controlBlock, /^[0-9a-f]+$/);
  assert.ok(artifacts.controlBlock.length > 130);
  assert.match(artifacts.address, /^bcrt1p/);
});

test('parseLockingScriptInput accepts both assembly and address forms', () => {
  const scriptInput = parseLockingScriptInput('OP_TRUE');
  assert.deepEqual(scriptInput.errors, []);
  assert.equal(scriptInput.scriptHex, '51');

  const artifacts = buildTaprootArtifacts(parseScript('OP_TRUE').encodedWords, INTERNAL_KEY, 'regtest');
  const addressInput = parseLockingScriptInput(artifacts.address);

  assert.deepEqual(addressInput.errors, []);
  assert.match(addressInput.scriptHex, /^5120[0-9a-f]{64}$/);
});
