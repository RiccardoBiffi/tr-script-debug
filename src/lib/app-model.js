import { Tx } from '@cmdcode/tapscript';
import { buildTxTemplate, executeDebugger } from './interpreter.js';
import {
  buildTaprootArtifacts,
  bytesToHex,
  normalizeInternalKey,
  parseLockingScriptInput,
  parseScript,
  parseWitness,
} from './script.js';

export function parseNumberField(label, rawValue) {
  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return Number.parseInt(value, 10);
}

export function parseContext(form) {
  const txid = form.prevoutTxid.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) {
    throw new Error('Prevout txid must be exactly 32 bytes of hex');
  }

  return {
    txVersion: parseNumberField('Transaction version', form.txVersion),
    txLocktime: parseNumberField('Transaction locktime', form.txLocktime),
    inputSequence: parseNumberField('Input sequence', form.inputSequence),
    prevoutTxid: txid,
    prevoutIndex: parseNumberField('Prevout index', form.prevoutIndex),
    prevoutValue: parseNumberField('Prevout value', form.prevoutValue),
    outputValue: parseNumberField('Output value', form.outputValue),
    chainHeight: parseNumberField('Current block height', form.chainHeight),
    chainTime: parseNumberField('Current block time', form.chainTime),
  };
}

export function buildModel(form) {
  const script = parseScript(form.scriptText);
  const witness = parseWitness(form.witnessText);
  const destination = parseLockingScriptInput(form.outputScript);

  const errors = [...script.errors, ...witness.errors, ...destination.errors];
  let taproot = null;
  let txBundle = null;
  let txHex = '';
  let debug = null;
  let context = null;

  if (errors.length === 0) {
    try {
      const internalKey = normalizeInternalKey(form.internalKey);
      taproot = buildTaprootArtifacts(script.encodedWords, internalKey, form.network);
      context = parseContext(form);
      txBundle = buildTxTemplate({
        context,
        taproot,
        witnessItems: witness.items,
        scriptHex: script.scriptHex,
        outputScriptWords: destination.encodedWords,
      });
      txHex = bytesToHex(Tx.encode(txBundle.txData));
      debug = executeDebugger({
        instructions: script.instructions,
        witnessItems: witness.items,
        tapleaf: taproot.tapleaf,
        txTemplate: txBundle.txData,
        finalWitnessSize: txBundle.finalWitnessSize,
        context,
      });
    } catch (error) {
      errors.push(error.message);
    }
  }

  return {
    script,
    witness,
    destination,
    taproot,
    txBundle,
    txHex,
    debug,
    context,
    errors,
  };
}
