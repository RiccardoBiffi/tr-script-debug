import { Tx } from '@cmdcode/tapscript';
import { ACTIVE_TAPSCRIPT_MARKER } from '../data/presets.js';
import { buildTxTemplate, executeDebugger } from './interpreter.js';
import {
  buildTaprootArtifactsWithTree,
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

function parseTapTreeNode(node, errors, path = 'root') {
  if (node === ACTIVE_TAPSCRIPT_MARKER) {
    return {
      activeCount: 1,
      node: { type: 'target' },
    };
  }

  if (Array.isArray(node)) {
    if (node.length < 2) {
      errors.push(`Tap tree branch ${path} must contain at least two children`);
    }

    const children = [];
    let activeCount = 0;

    node.forEach((child, index) => {
      const parsed = parseTapTreeNode(child, errors, `${path}.${index + 1}`);
      if (parsed.node) {
        children.push(parsed.node);
        activeCount += parsed.activeCount;
      }
    });

    return {
      activeCount,
      node: { type: 'branch', children },
    };
  }

  if (typeof node === 'string') {
    const script = parseScript(node);
    script.errors.forEach((error) => {
      errors.push(`Tap tree leaf ${path}: ${error}`);
    });

    return {
      activeCount: 0,
      node: { type: 'leaf', encodedWords: script.encodedWords },
    };
  }

  errors.push(
    `Tap tree node ${path} must be a script string, nested array, or the active tapscript marker`,
  );
  return { activeCount: 0, node: null };
}

function parseTapTreeDefinition(form, errors) {
  if (form.tapTreeLayout !== undefined && form.tapTreeLayout !== null) {
    const result = parseTapTreeNode(form.tapTreeLayout, errors);

    if (result.activeCount === 0) {
      errors.push('Tap tree layout must include the active tapscript marker exactly once');
    } else if (result.activeCount > 1) {
      errors.push('Tap tree layout can only include the active tapscript marker once');
    }

    return result.node;
  }

  const siblingLeafScripts = Array.isArray(form.tapTreeScripts)
    ? form.tapTreeScripts.map((leafScript, index) => ({
        index,
        script: parseScript(leafScript),
      }))
    : [];

  siblingLeafScripts.forEach(({ index, script: leaf }) => {
    leaf.errors.forEach((error) => {
      errors.push(`Tap tree leaf ${index + 2}: ${error}`);
    });
  });

  if (siblingLeafScripts.length === 0) {
    return null;
  }

  return {
    type: 'branch',
    children: [
      { type: 'target' },
      ...siblingLeafScripts.map(({ script: leaf }) => ({
        type: 'leaf',
        encodedWords: leaf.encodedWords,
      })),
    ],
  };
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
  const tapTreeDefinition = parseTapTreeDefinition(form, errors);
  let taproot = null;
  let txBundle = null;
  let txHex = '';
  let debug = null;
  let context = null;

  if (errors.length === 0) {
    try {
      const internalKey = normalizeInternalKey(form.internalKey);
      taproot = buildTaprootArtifactsWithTree(
        script.encodedWords,
        internalKey,
        form.network,
        tapTreeDefinition,
      );
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
