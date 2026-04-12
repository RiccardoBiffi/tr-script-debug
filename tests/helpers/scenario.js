import assert from 'node:assert/strict';
import { Signer } from '@cmdcode/tapscript';
import { schnorr } from '@noble/curves/secp256k1';
import { createInitialForm } from '../../src/data/presets.js';
import { buildModel, parseContext } from '../../src/lib/app-model.js';
import { buildTxTemplate } from '../../src/lib/interpreter.js';
import {
  buildTaprootArtifacts,
  bytesToHex,
  normalizeInternalKey,
  parseLockingScriptInput,
  parseScript,
} from '../../src/lib/script.js';

const CHECKSIG_SECRET = Uint8Array.from(Buffer.from('11'.repeat(32), 'hex'));

export function createForm(overrides = {}) {
  return {
    ...createInitialForm(),
    ...overrides,
  };
}

export function buildScenario(overrides = {}) {
  const form = createForm(overrides);
  const model = buildModel(form);
  assert.deepEqual(model.errors, [], `Expected a clean model build, got: ${model.errors.join(' | ')}`);

  return {
    form,
    model,
    frames: model.debug.snapshots,
    finalFrame: model.debug.snapshots.at(-1),
  };
}

export function createSignedChecksigForm({
  scriptTemplate = (pubkey) => `${pubkey} OP_CHECKSIG`,
  witnessTemplate = (signature) => signature,
  overrides = {},
} = {}) {
  const baseForm = createForm(overrides);
  const pubkey = bytesToHex(schnorr.getPublicKey(CHECKSIG_SECRET));
  const scriptText = scriptTemplate(pubkey);
  const script = parseScript(scriptText);
  const destination = parseLockingScriptInput(baseForm.outputScript);
  const internalKey = normalizeInternalKey(baseForm.internalKey);
  const context = parseContext(baseForm);
  const taproot = buildTaprootArtifacts(script.encodedWords, internalKey, baseForm.network);
  const unsignedBundle = buildTxTemplate({
    context,
    taproot,
    witnessItems: [],
    scriptHex: script.scriptHex,
    outputScriptWords: destination.encodedWords,
  });
  const sighash = Signer.taproot.hash(unsignedBundle.txData, 0, {
    extension: taproot.tapleaf,
  });
  const signature = bytesToHex(schnorr.sign(sighash, CHECKSIG_SECRET));

  return {
    pubkey,
    signature,
    form: {
      ...baseForm,
      scriptText,
      witnessText: witnessTemplate(signature),
    },
  };
}

export function buildSignedChecksigScenario(options = {}) {
  const fixture = createSignedChecksigForm(options);
  const model = buildModel(fixture.form);
  assert.deepEqual(model.errors, [], `Expected a clean model build, got: ${model.errors.join(' | ')}`);

  return {
    ...fixture,
    model,
    frames: model.debug.snapshots,
    finalFrame: model.debug.snapshots.at(-1),
  };
}
