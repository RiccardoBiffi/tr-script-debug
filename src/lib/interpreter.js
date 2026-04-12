import { Signer, Tx } from '@cmdcode/tapscript';
import { schnorr } from '@noble/curves/secp256k1';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { sha1 } from '@noble/hashes/sha1';
import { sha256 } from '@noble/hashes/sha256';
import { FAIL_IF_EXECUTED_OPS, NOP_OPS, isOpSuccessCode } from './opcodes.js';
import {
  asDisplayInt,
  asDisplayText,
  bytesToHex,
  castToBool,
  decodeScriptNum,
  describeStackItem,
  encodeScriptNum,
  hexToBytes,
} from './script.js';

const LOCKTIME_THRESHOLD = 500000000;
const FINAL_SEQUENCE = 0xffffffff;
const SEQUENCE_LOCKTIME_DISABLE_FLAG = 1 << 31;
const SEQUENCE_LOCKTIME_TYPE_FLAG = 1 << 22;
const SEQUENCE_LOCKTIME_MASK = 0x0000ffff;
const MAX_STACK_ELEMENTS = 1000;
const MAX_STACK_ELEMENT_SIZE = 520;
const NO_CODE_SEPARATOR = 0xffffffff;

function compactSizeLength(value) {
  if (value < 0xfd) {
    return 1;
  }

  if (value <= 0xffff) {
    return 3;
  }

  if (value <= 0xffffffff) {
    return 5;
  }

  return 9;
}

function serializedWitnessSize(items) {
  return (
    compactSizeLength(items.length) +
    items.reduce((total, item) => total + compactSizeLength(item.length) + item.length, 0)
  );
}

function doubleSha256(bytes) {
  return sha256(sha256(bytes));
}

function cloneBytes(bytes) {
  return Uint8Array.from(bytes);
}

function isExecuting(state) {
  return state.conditionStack.every((frame) => frame.branchActive);
}

function pushStack(state, value) {
  state.stack.push(cloneBytes(value));
}

function popStack(state) {
  if (state.stack.length === 0) {
    throw new Error('Stack underflow');
  }
  return state.stack.pop();
}

function peekStack(state, depth = 0) {
  const index = state.stack.length - 1 - depth;
  if (index < 0) {
    throw new Error('Stack underflow');
  }
  return state.stack[index];
}

function requireElements(state, count) {
  if (state.stack.length < count) {
    throw new Error(`Stack underflow: need ${count} item(s)`);
  }
}

function requireAltElements(state, count) {
  if (state.altStack.length < count) {
    throw new Error(`Alt stack underflow: need ${count} item(s)`);
  }
}

function enforceLimits(state) {
  const combinedSize = state.stack.length + state.altStack.length;
  if (combinedSize > MAX_STACK_ELEMENTS) {
    throw new Error(`Stack limit exceeded: ${combinedSize} > ${MAX_STACK_ELEMENTS}`);
  }

  const tooLarge = [...state.stack, ...state.altStack].find((item) => item.length > MAX_STACK_ELEMENT_SIZE);
  if (tooLarge) {
    throw new Error(`Stack element exceeds ${MAX_STACK_ELEMENT_SIZE} bytes`);
  }
}

function verifyMinimalIf(bytes) {
  const isFalse = bytes.length === 0;
  const isTrue = bytes.length === 1 && bytes[0] === 1;
  if (!isFalse && !isTrue) {
    throw new Error('MINIMALIF violation: OP_IF/OP_NOTIF only accept 0 or 1');
  }
  return isTrue;
}

function describeBytesInline(bytes) {
  const hex = bytesToHex(bytes);
  const intValue = asDisplayInt(bytes);
  const textValue = asDisplayText(bytes);
  const parts = [];

  parts.push(hex || '(empty)');
  if (intValue !== null) {
    parts.push(`int ${intValue}`);
  }
  if (textValue && textValue !== '(empty)') {
    parts.push(`text "${textValue}"`);
  }

  return parts.join(' | ');
}

function snapshotState(state, event, txMeta) {
  const stack = state.stack
    .slice()
    .reverse()
    .map((item, index) => describeStackItem(item, index));

  const altStack = state.altStack
    .slice()
    .reverse()
    .map((item, index) => describeStackItem(item, index));

  return {
    step: state.snapshotsCreated,
    status: state.error ? 'error' : state.done ? 'success' : 'ready',
    success: state.success,
    error: state.error,
    note: event.note,
    executed: event.executed,
    instructionIndex: event.instructionIndex ?? null,
    instructionLabel: event.instructionLabel ?? null,
    nextInstructionIndex: state.done ? null : state.pc,
    stack,
    altStack,
    sigopsBudget: state.sigopsBudget,
    lastCodeSeparator:
      state.lastCodeSeparator === NO_CODE_SEPARATOR ? null : state.lastCodeSeparator,
    conditionDepth: state.conditionStack.length,
    txFinality: txMeta.finality,
    combinedStackCount: state.stack.length + state.altStack.length,
  };
}

function evaluateTxFinality(context) {
  const { txLocktime, inputSequence, chainHeight, chainTime } = context;
  if (txLocktime === 0) {
    return {
      isFinal: true,
      comparisonValue: 0,
      kind: 'disabled',
      message: 'nLockTime is 0, so the spend is immediately final.',
    };
  }

  if (inputSequence === FINAL_SEQUENCE) {
    return {
      isFinal: true,
      comparisonValue: txLocktime,
      kind: txLocktime < LOCKTIME_THRESHOLD ? 'height' : 'time',
      message: 'Input sequence is final, so nLockTime does not delay finality.',
    };
  }

  const kind = txLocktime < LOCKTIME_THRESHOLD ? 'height' : 'time';
  const comparisonValue = kind === 'height' ? chainHeight : chainTime;
  const isFinal = txLocktime < comparisonValue;

  return {
    isFinal,
    comparisonValue,
    kind,
    message: isFinal
      ? `Transaction locktime ${txLocktime} is below the current ${kind} reference ${comparisonValue}.`
      : `Transaction locktime ${txLocktime} is not yet below the current ${kind} reference ${comparisonValue}.`,
  };
}

export function buildTxTemplate({
  context,
  taproot,
  witnessItems,
  scriptHex,
  outputScriptWords,
}) {
  const finalWitness = [
    ...witnessItems.map((item) => item.hex),
    scriptHex,
    taproot.controlBlock,
  ];

  const txData = Tx.create({
    version: context.txVersion,
    locktime: context.txLocktime,
    vin: [
      {
        txid: context.prevoutTxid,
        vout: context.prevoutIndex,
        sequence: context.inputSequence,
        witness: finalWitness,
        prevout: {
          value: context.prevoutValue,
          scriptPubKey: taproot.scriptPubKeyWords,
        },
      },
    ],
    vout: [
      {
        value: context.outputValue,
        scriptPubKey: outputScriptWords,
      },
    ],
  });

  return {
    txData,
    finalWitnessHex: finalWitness,
    finalWitnessSize: serializedWitnessSize(finalWitness.map((item) => hexToBytes(item))),
  };
}

function spendNote(label) {
  if (label === 'OP_CHECKLOCKTIMEVERIFY' || label === 'OP_NOP2') {
    return 'Absolute locktime requirement satisfied.';
  }
  if (label === 'OP_CHECKSEQUENCEVERIFY' || label === 'OP_NOP3') {
    return 'Relative locktime requirement satisfied.';
  }
  return `${label} executed.`;
}

function validateCheckLockTime(context, operand) {
  if (operand < 0n) {
    throw new Error('Negative locktime is not allowed');
  }

  const operandNumber = Number(operand);
  const txLocktime = context.txLocktime;
  const sameType =
    (operandNumber < LOCKTIME_THRESHOLD && txLocktime < LOCKTIME_THRESHOLD) ||
    (operandNumber >= LOCKTIME_THRESHOLD && txLocktime >= LOCKTIME_THRESHOLD);

  if (!sameType) {
    throw new Error('Locktime type mismatch between stack item and transaction locktime');
  }

  if (operandNumber > txLocktime) {
    throw new Error(`Required locktime ${operandNumber} exceeds transaction locktime ${txLocktime}`);
  }

  if (context.inputSequence === FINAL_SEQUENCE) {
    throw new Error('CHECKLOCKTIMEVERIFY requires a non-final input sequence');
  }
}

function validateCheckSequence(context, operand) {
  if (operand < 0n) {
    throw new Error('Negative sequence is not allowed');
  }

  const operandNumber = Number(operand);
  if ((operandNumber & SEQUENCE_LOCKTIME_DISABLE_FLAG) !== 0) {
    return 'Operand has the disable flag set, so CHECKSEQUENCEVERIFY acts as a NOP.';
  }

  if (context.txVersion < 2) {
    throw new Error('Transaction version must be 2 or greater for CHECKSEQUENCEVERIFY');
  }

  if ((context.inputSequence & SEQUENCE_LOCKTIME_DISABLE_FLAG) !== 0) {
    throw new Error('Input sequence has the disable flag set, so CSV cannot be satisfied');
  }

  const operandMasked = operandNumber & (SEQUENCE_LOCKTIME_TYPE_FLAG | SEQUENCE_LOCKTIME_MASK);
  const sequenceMasked =
    context.inputSequence & (SEQUENCE_LOCKTIME_TYPE_FLAG | SEQUENCE_LOCKTIME_MASK);

  const typesMatch =
    (operandMasked & SEQUENCE_LOCKTIME_TYPE_FLAG) ===
    (sequenceMasked & SEQUENCE_LOCKTIME_TYPE_FLAG);

  if (!typesMatch) {
    throw new Error('Sequence type mismatch between operand and input sequence');
  }

  if (operandMasked > sequenceMasked) {
    throw new Error(`Required sequence ${operandMasked} exceeds input sequence ${sequenceMasked}`);
  }

  return 'Relative sequence requirement satisfied.';
}

function hashForSignature(state, signature) {
  if (signature.length !== 64 && signature.length !== 65) {
    throw new Error('Tapscript Schnorr signatures must be 64 or 65 bytes long');
  }

  const sigFlag = signature.length === 65 ? signature[64] : 0x00;
  if (signature.length === 65 && sigFlag === 0x00) {
    throw new Error('65-byte Schnorr signatures must not use sighash 0x00');
  }

  const hash = Signer.taproot.hash(state.txTemplate, 0, {
    extension: state.tapleaf,
    separator_pos: state.lastCodeSeparator,
    sigflag: sigFlag,
  });

  return {
    hash,
    sigFlag,
    signatureBytes: signature.length === 65 ? signature.slice(0, 64) : signature,
  };
}

function runChecksig(label, state) {
  if (label === 'OP_CHECKSIG' || label === 'OP_CHECKSIGVERIFY') {
    requireElements(state, 2);
    const pubkey = popStack(state);
    const signature = popStack(state);

    if (pubkey.length === 0) {
      throw new Error('Public key size 0 is invalid in tapscript signature opcodes');
    }

    if (signature.length !== 0) {
      state.sigopsBudget -= 50;
      if (state.sigopsBudget < 0) {
        throw new Error('Sigops budget exhausted');
      }

      if (pubkey.length === 32) {
        const { hash, sigFlag, signatureBytes } = hashForSignature(state, signature);
        const verified = schnorr.verify(signatureBytes, hash, pubkey);
        if (!verified) {
          throw new Error('Schnorr signature validation failed');
        }

        if (label === 'OP_CHECKSIG') {
          pushStack(state, Uint8Array.from([1]));
        }

        return `Signature verified with sighash ${sigFlag.toString(16).padStart(2, '0')}.`;
      }

      if (label === 'OP_CHECKSIG') {
        pushStack(state, Uint8Array.from([1]));
      }

      return 'Unknown public key type treated as successful by tapscript rules.';
    }

    if (label === 'OP_CHECKSIGVERIFY') {
      throw new Error('CHECKSIGVERIFY fails on an empty signature');
    }

    pushStack(state, new Uint8Array());
    return 'Empty signature pushes false.';
  }

  requireElements(state, 3);
  const pubkey = popStack(state);
  const countValue = popStack(state);
  const signature = popStack(state);
  const count = decodeScriptNum(countValue, 4);

  if (pubkey.length === 0) {
    throw new Error('Public key size 0 is invalid in tapscript signature opcodes');
  }

  if (signature.length !== 0) {
    state.sigopsBudget -= 50;
    if (state.sigopsBudget < 0) {
      throw new Error('Sigops budget exhausted');
    }

    if (pubkey.length === 32) {
      const { hash } = hashForSignature(state, signature);
      const signatureBytes = signature.length === 65 ? signature.slice(0, 64) : signature;
      const verified = schnorr.verify(signatureBytes, hash, pubkey);
      if (!verified) {
        throw new Error('Schnorr signature validation failed');
      }
    }
  }

  const result = signature.length === 0 ? count : count + 1n;
  pushStack(state, encodeScriptNum(result));
  return signature.length === 0 ? 'Empty signature left the counter unchanged.' : 'Signature incremented the CHECKSIGADD counter.';
}

function runOpcode(state, instruction) {
  const { label } = instruction;
  const active = isExecuting(state);

  if (label === 'OP_IF' || label === 'OP_NOTIF') {
    if (!active) {
      state.conditionStack.push({
        parentActive: false,
        branchActive: false,
      });
      state.pc += 1;
      return {
        executed: false,
        note: `${label} was parsed inside an inactive branch.`,
      };
    }

    requireElements(state, 1);
    const predicate = popStack(state);
    const truthy = verifyMinimalIf(predicate);
    const branchActive = label === 'OP_IF' ? truthy : !truthy;
    state.conditionStack.push({
      parentActive: true,
      branchActive,
    });
    state.pc += 1;
    return {
      executed: true,
      note: `${label} selected the ${branchActive ? 'true' : 'false'} branch.`,
    };
  }

  if (label === 'OP_ELSE') {
    const frame = state.conditionStack.at(-1);
    if (!frame) {
      throw new Error('ELSE without a matching IF');
    }

    frame.branchActive = frame.parentActive && !frame.branchActive;
    state.pc += 1;
    return {
      executed: frame.parentActive,
      note: frame.parentActive
        ? `ELSE flipped execution to the ${frame.branchActive ? 'alternate' : 'original'} branch.`
        : 'ELSE stayed inactive because the parent branch is inactive.',
    };
  }

  if (label === 'OP_ENDIF') {
    if (state.conditionStack.length === 0) {
      throw new Error('ENDIF without a matching IF');
    }
    state.conditionStack.pop();
    state.pc += 1;
    return {
      executed: active,
      note: 'Conditional block closed.',
    };
  }

  if (!active) {
    state.pc += 1;
    return {
      executed: false,
      note: `${label} was skipped because the current branch is inactive.`,
    };
  }

  if (FAIL_IF_EXECUTED_OPS.has(label)) {
    throw new Error(`${label} fails immediately when executed in tapscript`);
  }

  if (NOP_OPS.has(label)) {
    state.pc += 1;
    return { executed: true, note: `${label} is a no-op.` };
  }

  if (label === 'OP_PUSHDATA1' || label === 'OP_PUSHDATA2' || label === 'OP_PUSHDATA4') {
    throw new Error(`Use raw literals in ASM mode instead of ${label}`);
  }

  if (label === 'OP_0' || label === 'OP_FALSE') {
    pushStack(state, new Uint8Array());
  } else if (label === 'OP_1NEGATE') {
    pushStack(state, encodeScriptNum(-1n));
  } else if (label === 'OP_TRUE' || /^OP_(?:[1-9]|1[0-6])$/.test(label)) {
    const numeric = label === 'OP_TRUE' ? 1n : BigInt(label.slice(3));
    pushStack(state, encodeScriptNum(numeric));
  } else if (label === 'OP_VERIFY') {
    requireElements(state, 1);
    const value = popStack(state);
    if (!castToBool(value)) {
      throw new Error('VERIFY encountered false');
    }
  } else if (label === 'OP_TOALTSTACK') {
    requireElements(state, 1);
    state.altStack.push(popStack(state));
  } else if (label === 'OP_FROMALTSTACK') {
    requireAltElements(state, 1);
    state.stack.push(state.altStack.pop());
  } else if (label === 'OP_2DROP') {
    requireElements(state, 2);
    popStack(state);
    popStack(state);
  } else if (label === 'OP_2DUP') {
    requireElements(state, 2);
    pushStack(state, peekStack(state, 1));
    pushStack(state, peekStack(state, 1));
  } else if (label === 'OP_3DUP') {
    requireElements(state, 3);
    pushStack(state, peekStack(state, 2));
    pushStack(state, peekStack(state, 2));
    pushStack(state, peekStack(state, 2));
  } else if (label === 'OP_2OVER') {
    requireElements(state, 4);
    pushStack(state, peekStack(state, 3));
    pushStack(state, peekStack(state, 3));
  } else if (label === 'OP_2ROT') {
    requireElements(state, 6);
    const values = state.stack.splice(-6);
    state.stack.push(values[2], values[3], values[4], values[5], values[0], values[1]);
  } else if (label === 'OP_2SWAP') {
    requireElements(state, 4);
    const values = state.stack.splice(-4);
    state.stack.push(values[2], values[3], values[0], values[1]);
  } else if (label === 'OP_IFDUP') {
    requireElements(state, 1);
    if (castToBool(peekStack(state))) {
      pushStack(state, peekStack(state));
    }
  } else if (label === 'OP_DEPTH') {
    pushStack(state, encodeScriptNum(BigInt(state.stack.length)));
  } else if (label === 'OP_DROP') {
    requireElements(state, 1);
    popStack(state);
  } else if (label === 'OP_DUP') {
    requireElements(state, 1);
    pushStack(state, peekStack(state));
  } else if (label === 'OP_NIP') {
    requireElements(state, 2);
    const top = popStack(state);
    popStack(state);
    state.stack.push(top);
  } else if (label === 'OP_OVER') {
    requireElements(state, 2);
    pushStack(state, peekStack(state, 1));
  } else if (label === 'OP_PICK' || label === 'OP_ROLL') {
    requireElements(state, 2);
    const depth = Number(decodeScriptNum(popStack(state), 4));
    if (!Number.isInteger(depth) || depth < 0) {
      throw new Error(`${label} requires a non-negative depth`);
    }
    if (depth >= state.stack.length) {
      throw new Error(`${label} depth ${depth} is out of range`);
    }

    const index = state.stack.length - 1 - depth;
    const value = cloneBytes(state.stack[index]);
    if (label === 'OP_ROLL') {
      state.stack.splice(index, 1);
    }
    state.stack.push(value);
  } else if (label === 'OP_ROT') {
    requireElements(state, 3);
    const values = state.stack.splice(-3);
    state.stack.push(values[1], values[2], values[0]);
  } else if (label === 'OP_SWAP') {
    requireElements(state, 2);
    const values = state.stack.splice(-2);
    state.stack.push(values[1], values[0]);
  } else if (label === 'OP_TUCK') {
    requireElements(state, 2);
    const top = peekStack(state);
    const second = peekStack(state, 1);
    state.stack.splice(-2, 2, top, second, top);
  } else if (label === 'OP_SIZE') {
    requireElements(state, 1);
    pushStack(state, encodeScriptNum(BigInt(peekStack(state).length)));
  } else if (label === 'OP_EQUAL' || label === 'OP_EQUALVERIFY') {
    requireElements(state, 2);
    const right = popStack(state);
    const left = popStack(state);
    const equal = bytesToHex(left) === bytesToHex(right);
    if (label === 'OP_EQUALVERIFY') {
      if (!equal) {
        throw new Error('EQUALVERIFY comparison failed');
      }
    } else {
      pushStack(state, equal ? Uint8Array.from([1]) : new Uint8Array());
    }
  } else if (
    [
      'OP_1ADD',
      'OP_1SUB',
      'OP_NEGATE',
      'OP_ABS',
      'OP_NOT',
      'OP_0NOTEQUAL',
    ].includes(label)
  ) {
    requireElements(state, 1);
    const value = decodeScriptNum(popStack(state), 4);
    let result = value;
    if (label === 'OP_1ADD') result += 1n;
    if (label === 'OP_1SUB') result -= 1n;
    if (label === 'OP_NEGATE') result = -result;
    if (label === 'OP_ABS') result = result < 0n ? -result : result;
    if (label === 'OP_NOT') result = value === 0n ? 1n : 0n;
    if (label === 'OP_0NOTEQUAL') result = value === 0n ? 0n : 1n;
    pushStack(state, encodeScriptNum(result));
  } else if (
    [
      'OP_ADD',
      'OP_SUB',
      'OP_NUMEQUAL',
      'OP_NUMEQUALVERIFY',
      'OP_NUMNOTEQUAL',
      'OP_LESSTHAN',
      'OP_GREATERTHAN',
      'OP_LESSTHANOREQUAL',
      'OP_GREATERTHANOREQUAL',
      'OP_MIN',
      'OP_MAX',
    ].includes(label)
  ) {
    requireElements(state, 2);
    const right = decodeScriptNum(popStack(state), 4);
    const left = decodeScriptNum(popStack(state), 4);
    let result = 0n;

    if (label === 'OP_ADD') result = left + right;
    if (label === 'OP_SUB') result = left - right;
    if (label === 'OP_NUMEQUAL' || label === 'OP_NUMEQUALVERIFY') result = left === right ? 1n : 0n;
    if (label === 'OP_NUMNOTEQUAL') result = left !== right ? 1n : 0n;
    if (label === 'OP_LESSTHAN') result = left < right ? 1n : 0n;
    if (label === 'OP_GREATERTHAN') result = left > right ? 1n : 0n;
    if (label === 'OP_LESSTHANOREQUAL') result = left <= right ? 1n : 0n;
    if (label === 'OP_GREATERTHANOREQUAL') result = left >= right ? 1n : 0n;
    if (label === 'OP_MIN') result = left < right ? left : right;
    if (label === 'OP_MAX') result = left > right ? left : right;

    if (label === 'OP_NUMEQUALVERIFY') {
      if (result === 0n) {
        throw new Error('NUMEQUALVERIFY comparison failed');
      }
    } else {
      pushStack(state, encodeScriptNum(result));
    }
  } else if (label === 'OP_BOOLAND' || label === 'OP_BOOLOR') {
    requireElements(state, 2);
    const right = castToBool(popStack(state));
    const left = castToBool(popStack(state));
    const result = label === 'OP_BOOLAND' ? left && right : left || right;
    pushStack(state, result ? Uint8Array.from([1]) : new Uint8Array());
  } else if (label === 'OP_WITHIN') {
    requireElements(state, 3);
    const max = decodeScriptNum(popStack(state), 4);
    const min = decodeScriptNum(popStack(state), 4);
    const value = decodeScriptNum(popStack(state), 4);
    pushStack(state, value >= min && value < max ? Uint8Array.from([1]) : new Uint8Array());
  } else if (
    ['OP_RIPEMD160', 'OP_SHA1', 'OP_SHA256', 'OP_HASH160', 'OP_HASH256'].includes(label)
  ) {
    requireElements(state, 1);
    const value = popStack(state);
    let hashed = value;
    if (label === 'OP_RIPEMD160') hashed = ripemd160(value);
    if (label === 'OP_SHA1') hashed = sha1(value);
    if (label === 'OP_SHA256') hashed = sha256(value);
    if (label === 'OP_HASH160') hashed = ripemd160(sha256(value));
    if (label === 'OP_HASH256') hashed = doubleSha256(value);
    pushStack(state, hashed);
  } else if (label === 'OP_CODESEPARATOR') {
    state.lastCodeSeparator = instruction.index;
  } else if (label === 'OP_CHECKSIG' || label === 'OP_CHECKSIGVERIFY' || label === 'OP_CHECKSIGADD') {
    const note = runChecksig(label, state);
    state.pc += 1;
    return { executed: true, note };
  } else if (label === 'OP_CHECKLOCKTIMEVERIFY' || label === 'OP_NOP2') {
    requireElements(state, 1);
    validateCheckLockTime(state.context, decodeScriptNum(peekStack(state), 5));
  } else if (label === 'OP_CHECKSEQUENCEVERIFY' || label === 'OP_NOP3') {
    requireElements(state, 1);
    const note = validateCheckSequence(state.context, decodeScriptNum(peekStack(state), 5));
    state.pc += 1;
    return { executed: true, note };
  } else {
    throw new Error(`Opcode not implemented: ${label}`);
  }

  state.pc += 1;
  return {
    executed: true,
    note: spendNote(label),
  };
}

export function executeDebugger({
  instructions,
  witnessItems,
  tapleaf,
  txTemplate,
  finalWitnessSize,
  context,
}) {
  const snapshots = [];
  const txMeta = {
    finality: evaluateTxFinality(context),
  };

  const firstSuccess = instructions.find(
    (instruction) => instruction.type === 'opcode' && isOpSuccessCode(instruction.code),
  );

  if (firstSuccess) {
    const state = {
      stack: witnessItems.map((item) => cloneBytes(item.bytes)),
      altStack: [],
      conditionStack: [],
      pc: 0,
      done: false,
      success: false,
      error: null,
      sigopsBudget: 50 + finalWitnessSize,
      lastCodeSeparator: NO_CODE_SEPARATOR,
      snapshotsCreated: 0,
    };

    snapshots.push(
      snapshotState(
        state,
        {
          executed: false,
          note: `Witness stack loaded. OP_SUCCESS${firstSuccess.code} is present, so tapscript validation succeeds before normal execution rules apply.`,
          instructionIndex: firstSuccess.index,
          instructionLabel: firstSuccess.label,
        },
        txMeta,
      ),
    );

    state.done = true;
    state.success = true;
    state.snapshotsCreated += 1;
    snapshots.push(
      snapshotState(
        state,
        {
          executed: true,
          note: `OP_SUCCESS${firstSuccess.code} short-circuits validation to success.`,
          instructionIndex: firstSuccess.index,
          instructionLabel: firstSuccess.label,
        },
        txMeta,
      ),
    );

    return { snapshots };
  }

  const state = {
    context,
    tapleaf,
    txTemplate,
    stack: witnessItems.map((item) => cloneBytes(item.bytes)),
    altStack: [],
    conditionStack: [],
    pc: 0,
    done: false,
    success: false,
    error: null,
    sigopsBudget: 50 + finalWitnessSize,
    lastCodeSeparator: NO_CODE_SEPARATOR,
    snapshotsCreated: 0,
  };

  const initialOversized = witnessItems.find((item) => item.bytes.length > MAX_STACK_ELEMENT_SIZE);
  if (initialOversized) {
    state.error = `Initial witness item exceeds ${MAX_STACK_ELEMENT_SIZE} bytes`;
    state.done = true;
  } else if (witnessItems.length > MAX_STACK_ELEMENTS) {
    state.error = `Initial witness stack exceeds ${MAX_STACK_ELEMENTS} items`;
    state.done = true;
  }

  snapshots.push(
    snapshotState(
      state,
      {
        executed: false,
        note:
          state.error ??
          `Witness stack loaded with ${witnessItems.length} item(s). Sigops budget starts at ${state.sigopsBudget}.`,
      },
      txMeta,
    ),
  );

  while (!state.done && state.pc < instructions.length) {
    const instruction = instructions[state.pc];
    let event;

    try {
      if (instruction.type === 'push') {
        if (isExecuting(state)) {
          if (instruction.data.length > MAX_STACK_ELEMENT_SIZE) {
            throw new Error(`Push exceeds ${MAX_STACK_ELEMENT_SIZE} bytes`);
          }
          pushStack(state, instruction.data);
          enforceLimits(state);
          event = {
            executed: true,
            note: `Pushed ${describeBytesInline(instruction.data)} onto the stack.`,
            instructionIndex: instruction.index,
            instructionLabel: instruction.label,
          };
        } else {
          event = {
            executed: false,
            note: `Skipped push ${instruction.label} because the current branch is inactive.`,
            instructionIndex: instruction.index,
            instructionLabel: instruction.label,
          };
        }
        state.pc += 1;
      } else {
        const result = runOpcode(state, instruction);
        if (result.executed) {
          enforceLimits(state);
        }
        event = {
          executed: result.executed,
          note: result.note,
          instructionIndex: instruction.index,
          instructionLabel: instruction.label,
        };
      }
    } catch (error) {
      state.error = error.message;
      state.done = true;
      event = {
        executed: true,
        note: error.message,
        instructionIndex: instruction.index,
        instructionLabel: instruction.label,
      };
    }

    state.snapshotsCreated += 1;
    snapshots.push(snapshotState(state, event, txMeta));
  }

  if (!state.done) {
    if (state.conditionStack.length !== 0) {
      state.error = 'Unclosed conditional block at end of script';
    } else if (state.stack.length !== 1) {
      state.error = `Tapscript must finish with exactly one stack item, found ${state.stack.length}`;
    } else if (!castToBool(state.stack.at(-1))) {
      state.error = 'Final stack item evaluates to false';
    } else {
      state.success = true;
    }

    state.done = true;
    state.snapshotsCreated += 1;
    snapshots.push(
      snapshotState(
        state,
        {
          executed: false,
          note: state.error ?? 'Execution finished successfully with a single true stack item.',
        },
        txMeta,
      ),
    );
  }

  return { snapshots };
}
