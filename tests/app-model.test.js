import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialForm } from '../src/data/presets.js';
import { buildModel, parseContext, parseNumberField } from '../src/lib/app-model.js';

function createForm(overrides = {}) {
  return {
    ...createInitialForm(),
    ...overrides,
  };
}

test('parseNumberField accepts integers and rejects non-numeric values', () => {
  assert.equal(parseNumberField('Height', '123'), 123);
  assert.throws(() => parseNumberField('Height', '12.3'), /must be a non-negative integer/);
  assert.throws(() => parseNumberField('Height', '-1'), /must be a non-negative integer/);
});

test('parseContext rejects malformed prevout txids', () => {
  assert.throws(
    () =>
      parseContext(
        createForm({
          prevoutTxid: 'abcd',
        }),
      ),
    /Prevout txid must be exactly 32 bytes of hex/,
  );
});

test('buildModel wires together taproot metadata, transaction data, and debug snapshots', () => {
  const model = buildModel(createForm());

  assert.deepEqual(model.errors, []);
  assert.ok(model.taproot);
  assert.ok(model.txBundle);
  assert.ok(model.debug);
  assert.match(model.txHex, /^[0-9a-f]+$/);
  assert.equal(model.debug.snapshots[0].sigopsBudget, 50 + model.txBundle.finalWitnessSize);
  assert.equal(model.debug.snapshots.at(-1).status, 'success');
});

test('buildModel surfaces parser and witness errors without attempting execution', () => {
  const model = buildModel(
    createForm({
      scriptText: 'OP_MADE_UP 1',
      witnessText: '1 2',
    }),
  );

  assert.equal(model.debug, null);
  assert.ok(model.errors.some((error) => error.includes('OP_MADE_UP')));
  assert.ok(model.errors.some((error) => error.includes('Witness line 1')));
});

test('buildModel supports taproot presets with sibling leaves in the tree', () => {
  const model = buildModel(
    createForm({
      scriptText: '2 3 OP_ADD 5 OP_EQUAL',
      tapTreeScripts: ['OP_TRUE', '10 OP_CHECKSEQUENCEVERIFY OP_DROP OP_TRUE'],
    }),
  );

  assert.deepEqual(model.errors, []);
  assert.ok(model.taproot);
  assert.ok(model.taproot.controlBlock.length > 66);
});
