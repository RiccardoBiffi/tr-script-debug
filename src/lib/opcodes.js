const baseOpcodeMap = {
  OP_0: 0,
  OP_FALSE: 0,
  OP_PUSHDATA1: 76,
  OP_PUSHDATA2: 77,
  OP_PUSHDATA4: 78,
  OP_1NEGATE: 79,
  OP_RESERVED: 80,
  OP_1: 81,
  OP_TRUE: 81,
  OP_2: 82,
  OP_3: 83,
  OP_4: 84,
  OP_5: 85,
  OP_6: 86,
  OP_7: 87,
  OP_8: 88,
  OP_9: 89,
  OP_10: 90,
  OP_11: 91,
  OP_12: 92,
  OP_13: 93,
  OP_14: 94,
  OP_15: 95,
  OP_16: 96,
  OP_NOP: 97,
  OP_VER: 98,
  OP_IF: 99,
  OP_NOTIF: 100,
  OP_VERIF: 101,
  OP_VERNOTIF: 102,
  OP_ELSE: 103,
  OP_ENDIF: 104,
  OP_VERIFY: 105,
  OP_RETURN: 106,
  OP_TOALTSTACK: 107,
  OP_FROMALTSTACK: 108,
  OP_2DROP: 109,
  OP_2DUP: 110,
  OP_3DUP: 111,
  OP_2OVER: 112,
  OP_2ROT: 113,
  OP_2SWAP: 114,
  OP_IFDUP: 115,
  OP_DEPTH: 116,
  OP_DROP: 117,
  OP_DUP: 118,
  OP_NIP: 119,
  OP_OVER: 120,
  OP_PICK: 121,
  OP_ROLL: 122,
  OP_ROT: 123,
  OP_SWAP: 124,
  OP_TUCK: 125,
  OP_CAT: 126,
  OP_SUBSTR: 127,
  OP_LEFT: 128,
  OP_RIGHT: 129,
  OP_SIZE: 130,
  OP_INVERT: 131,
  OP_AND: 132,
  OP_OR: 133,
  OP_XOR: 134,
  OP_EQUAL: 135,
  OP_EQUALVERIFY: 136,
  OP_RESERVED1: 137,
  OP_RESERVED2: 138,
  OP_1ADD: 139,
  OP_1SUB: 140,
  OP_2MUL: 141,
  OP_2DIV: 142,
  OP_NEGATE: 143,
  OP_ABS: 144,
  OP_NOT: 145,
  OP_0NOTEQUAL: 146,
  OP_ADD: 147,
  OP_SUB: 148,
  OP_MUL: 149,
  OP_DIV: 150,
  OP_MOD: 151,
  OP_LSHIFT: 152,
  OP_RSHIFT: 153,
  OP_BOOLAND: 154,
  OP_BOOLOR: 155,
  OP_NUMEQUAL: 156,
  OP_NUMEQUALVERIFY: 157,
  OP_NUMNOTEQUAL: 158,
  OP_LESSTHAN: 159,
  OP_GREATERTHAN: 160,
  OP_LESSTHANOREQUAL: 161,
  OP_GREATERTHANOREQUAL: 162,
  OP_MIN: 163,
  OP_MAX: 164,
  OP_WITHIN: 165,
  OP_RIPEMD160: 166,
  OP_SHA1: 167,
  OP_SHA256: 168,
  OP_HASH160: 169,
  OP_HASH256: 170,
  OP_CODESEPARATOR: 171,
  OP_CHECKSIG: 172,
  OP_CHECKSIGVERIFY: 173,
  OP_CHECKMULTISIG: 174,
  OP_CHECKMULTISIGVERIFY: 175,
  OP_NOP1: 176,
  OP_NOP2: 177,
  OP_CHECKLOCKTIMEVERIFY: 177,
  OP_NOP3: 178,
  OP_CHECKSEQUENCEVERIFY: 178,
  OP_NOP4: 179,
  OP_NOP5: 180,
  OP_NOP6: 181,
  OP_NOP7: 182,
  OP_NOP8: 183,
  OP_NOP9: 184,
  OP_NOP10: 185,
  OP_CHECKSIGADD: 186,
  OP_INVALIDOPCODE: 255,
};

const opSuccessList = [
  80,
  98,
  126,
  127,
  128,
  129,
  131,
  132,
  133,
  134,
  137,
  138,
  141,
  142,
  149,
  150,
  151,
  152,
  153,
  ...Array.from({ length: 68 }, (_, index) => index + 187),
];

export const OP_SUCCESS_CODES = new Set(opSuccessList);

const opcodeMap = { ...baseOpcodeMap };

for (const code of opSuccessList) {
  opcodeMap[`OP_SUCCESS${code}`] = code;
}

export const OPCODE_MAP = Object.freeze(opcodeMap);

export const CONTROL_OPS = new Set([
  'OP_IF',
  'OP_NOTIF',
  'OP_ELSE',
  'OP_ENDIF',
]);

export const NOP_OPS = new Set([
  'OP_NOP',
  'OP_NOP1',
  'OP_NOP4',
  'OP_NOP5',
  'OP_NOP6',
  'OP_NOP7',
  'OP_NOP8',
  'OP_NOP9',
  'OP_NOP10',
]);

export const FAIL_IF_EXECUTED_OPS = new Set([
  'OP_RESERVED',
  'OP_VER',
  'OP_VERIF',
  'OP_VERNOTIF',
  'OP_RESERVED1',
  'OP_RESERVED2',
  'OP_RETURN',
  'OP_INVALIDOPCODE',
  'OP_CHECKMULTISIG',
  'OP_CHECKMULTISIGVERIFY',
]);

const aliasMap = {
  FALSE: 'OP_FALSE',
  TRUE: 'OP_TRUE',
  NOP2: 'OP_NOP2',
  NOP3: 'OP_NOP3',
  CHECKLOCKTIMEVERIFY: 'OP_CHECKLOCKTIMEVERIFY',
  CHECKSEQUENCEVERIFY: 'OP_CHECKSEQUENCEVERIFY',
};

export function normalizeOpcode(token) {
  const upper = token.trim().toUpperCase();
  if (!upper) {
    return null;
  }

  const alias = aliasMap[upper];
  if (alias) {
    return alias;
  }

  if (OPCODE_MAP[upper] !== undefined) {
    return upper;
  }

  if (!upper.startsWith('OP_')) {
    const prefixed = `OP_${upper}`;
    if (OPCODE_MAP[prefixed] !== undefined) {
      return prefixed;
    }
  }

  return null;
}

export function getOpcodeCode(name) {
  return OPCODE_MAP[name];
}

export function isOpSuccessCode(code) {
  return OP_SUCCESS_CODES.has(code);
}

export function isPushConstantOpcode(name) {
  return (
    name === 'OP_0' ||
    name === 'OP_FALSE' ||
    name === 'OP_1NEGATE' ||
    /^OP_(?:[1-9]|1[0-6])$/.test(name) ||
    name === 'OP_TRUE'
  );
}

export function listOpcodes() {
  return Object.keys(OPCODE_MAP)
    .filter((name) => !name.startsWith('OP_SUCCESS'))
    .sort((left, right) => OPCODE_MAP[left] - OPCODE_MAP[right] || left.localeCompare(right));
}

export function toEncoderOpcode(name) {
  if (name === 'OP_FALSE') {
    return 'OP_0';
  }
  if (name === 'OP_TRUE') {
    return 'OP_1';
  }
  if (name === 'OP_NOP2') {
    return 'OP_CHECKLOCKTIMEVERIFY';
  }
  if (name === 'OP_NOP3') {
    return 'OP_CHECKSEQUENCEVERIFY';
  }

  const code = OPCODE_MAP[name];
  if (code !== undefined && isOpSuccessCode(code)) {
    return `OP_SUCCESS${code}`;
  }

  return name;
}
