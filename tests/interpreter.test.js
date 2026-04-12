import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScenario, buildSignedChecksigScenario } from './helpers/scenario.js';

test('arithmetic script succeeds with a single true result', () => {
  const { finalFrame } = buildScenario();

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.success, true);
  assert.equal(finalFrame.stack.length, 1);
  assert.equal(finalFrame.stack[0].hex, '01');
});

test('inactive branches skip failing opcodes safely', () => {
  const { frames, finalFrame } = buildScenario({
    scriptText: '0 OP_IF OP_RETURN OP_ELSE 1 OP_ENDIF',
  });

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.stack[0].hex, '01');
  assert.ok(frames.some((frame) => frame.note.includes('was skipped because the current branch is inactive')));
});

test('MINIMALIF is enforced for OP_IF and OP_NOTIF', () => {
  const { finalFrame } = buildScenario({
    scriptText: 'OP_IF 1 OP_ENDIF',
    witnessText: '2',
  });

  assert.equal(finalFrame.status, 'error');
  assert.match(finalFrame.error, /MINIMALIF violation/);
});

test('alt stack operations round-trip values correctly', () => {
  const { finalFrame } = buildScenario({
    scriptText: '1 OP_TOALTSTACK 2 OP_FROMALTSTACK OP_ADD 3 OP_EQUAL',
  });

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.altStack.length, 0);
  assert.equal(finalFrame.stack[0].hex, '01');
});

test('CHECKLOCKTIMEVERIFY succeeds with matching absolute locktime context', () => {
  const { finalFrame } = buildScenario({
    scriptText: '840000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE',
    txLocktime: '840000',
    chainHeight: '850000',
    inputSequence: '4294967294',
  });

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.txFinality.kind, 'height');
  assert.equal(finalFrame.txFinality.isFinal, true);
});

test('CHECKLOCKTIMEVERIFY fails when the input sequence is final', () => {
  const { finalFrame } = buildScenario({
    scriptText: '840000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE',
    txLocktime: '840000',
    inputSequence: '4294967295',
  });

  assert.equal(finalFrame.status, 'error');
  assert.match(finalFrame.error, /non-final input sequence/);
});

test('CHECKSEQUENCEVERIFY rejects transactions below version 2', () => {
  const { finalFrame } = buildScenario({
    scriptText: '10 OP_CHECKSEQUENCEVERIFY OP_DROP OP_TRUE',
    txVersion: '1',
    inputSequence: '10',
  });

  assert.equal(finalFrame.status, 'error');
  assert.match(finalFrame.error, /version must be 2 or greater/);
});

test('OP_SUCCESS opcodes short-circuit validation to success', () => {
  const { frames, finalFrame } = buildScenario({
    scriptText: 'OP_CAT',
    witnessText: '0x01\n0x02',
  });

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.stack.length, 2);
  assert.match(finalFrame.note, /short-circuits validation to success/);
  assert.match(frames[0].note, /OP_SUCCESS126 is present/);
});

test('OP_CHECKSIG validates a real tapscript Schnorr signature', () => {
  const { frames, finalFrame, pubkey } = buildSignedChecksigScenario();
  const checksigFrame = frames.find((frame) => frame.instructionLabel === 'OP_CHECKSIG');

  assert.equal(finalFrame.status, 'success');
  assert.ok(checksigFrame);
  assert.match(checksigFrame.note, /Signature verified with sighash 00/);
  assert.match(pubkey, /^[0-9a-f]{64}$/);
});

test('OP_CHECKSIGADD increments the running count for a valid signature', () => {
  const { finalFrame } = buildSignedChecksigScenario({
    scriptTemplate: (pubkey) => `1 ${pubkey} OP_CHECKSIGADD 2 OP_EQUAL`,
  });

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.stack[0].hex, '01');
});

test('OP_CHECKSIGVERIFY fails when given an empty signature', () => {
  const { finalFrame } = buildSignedChecksigScenario({
    scriptTemplate: (pubkey) => `${pubkey} OP_CHECKSIGVERIFY`,
    witnessTemplate: () => '0x',
  });

  assert.equal(finalFrame.status, 'error');
  assert.match(finalFrame.error, /CHECKSIGVERIFY fails on an empty signature/);
});

test('execution fails when the final stack contains more than one item', () => {
  const { finalFrame } = buildScenario({
    scriptText: '1 1',
  });

  assert.equal(finalFrame.status, 'error');
  assert.match(finalFrame.error, /must finish with exactly one stack item/);
});

test('OP_CODESEPARATOR updates the tracked separator position', () => {
  const { finalFrame } = buildScenario({
    scriptText: 'OP_CODESEPARATOR OP_TRUE',
  });

  assert.equal(finalFrame.status, 'success');
  assert.equal(finalFrame.lastCodeSeparator, 0);
});
