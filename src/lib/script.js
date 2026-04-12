import { Address, Script, Tap } from '@cmdcode/tapscript';
import { getOpcodeCode, normalizeOpcode, toEncoderOpcode } from './opcodes.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(rawHex) {
  const hex = rawHex.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex value must have an even number of characters: ${rawHex}`);
  }
  if (!/^[0-9a-f]*$/i.test(hex)) {
    throw new Error(`Invalid hex value: ${rawHex}`);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

export function encodeScriptNum(value) {
  let number = BigInt(value);
  if (number === 0n) {
    return new Uint8Array();
  }

  const negative = number < 0n;
  if (negative) {
    number = -number;
  }

  const result = [];
  while (number > 0n) {
    result.push(Number(number & 0xffn));
    number >>= 8n;
  }

  if (result[result.length - 1] & 0x80) {
    result.push(negative ? 0x80 : 0x00);
  } else if (negative) {
    result[result.length - 1] |= 0x80;
  }

  return Uint8Array.from(result);
}

export function decodeScriptNum(bytes, maxLength = 4) {
  if (bytes.length > maxLength) {
    throw new Error(`Numeric input exceeds ${maxLength} bytes`);
  }

  if (bytes.length === 0) {
    return 0n;
  }

  const copy = Uint8Array.from(bytes);
  const lastIndex = copy.length - 1;
  const negative = (copy[lastIndex] & 0x80) !== 0;
  if (negative) {
    copy[lastIndex] &= 0x7f;
  }

  let result = 0n;
  for (let index = 0; index < copy.length; index += 1) {
    result += BigInt(copy[index]) << (8n * BigInt(index));
  }

  return negative ? -result : result;
}

export function castToBool(bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) {
      const isNegativeZero =
        index === bytes.length - 1 &&
        bytes[index] === 0x80 &&
        bytes.slice(0, -1).every((byte) => byte === 0);
      return !isNegativeZero;
    }
  }
  return false;
}

export function asDisplayInt(bytes, maxLength = 8) {
  try {
    return decodeScriptNum(bytes, maxLength).toString();
  } catch {
    return null;
  }
}

export function asDisplayText(bytes) {
  if (bytes.length === 0) {
    return '(empty)';
  }

  const printable = Array.from(bytes).every((byte) => byte === 9 || byte === 10 || (byte >= 32 && byte <= 126));
  if (!printable) {
    return null;
  }

  try {
    return textDecoder.decode(bytes);
  } catch {
    return null;
  }
}

function unescapeQuotedToken(rawToken) {
  const quote = rawToken[0];
  const body = rawToken.slice(1, -1);
  let value = '';

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== '\\') {
      value += char;
      continue;
    }

    const next = body[index + 1];
    index += 1;
    switch (next) {
      case 'n':
        value += '\n';
        break;
      case 'r':
        value += '\r';
        break;
      case 't':
        value += '\t';
        break;
      case '\\':
        value += '\\';
        break;
      case '"':
        value += '"';
        break;
      case "'":
        value += "'";
        break;
      default:
        value += next ?? '';
        break;
    }
  }

  return value;
}

function scanTokens(text) {
  const tokens = [];
  let index = 0;
  let line = 1;
  let column = 1;

  while (index < text.length) {
    const char = text[index];

    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1;
      column += 1;
      continue;
    }

    if (char === '\n') {
      index += 1;
      line += 1;
      column = 1;
      continue;
    }

    if (char === '#') {
      while (index < text.length && text[index] !== '\n') {
        index += 1;
        column += 1;
      }
      continue;
    }

    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') {
        index += 1;
        column += 1;
      }
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (char === '"' || char === "'") {
      const quote = char;
      let value = quote;
      index += 1;
      column += 1;

      while (index < text.length) {
        const next = text[index];
        value += next;
        index += 1;
        column += 1;

        if (next === '\\') {
          if (index < text.length) {
            value += text[index];
            index += 1;
            column += 1;
          }
          continue;
        }

        if (next === quote) {
          break;
        }

        if (next === '\n') {
          line += 1;
          column = 1;
        }
      }

      if (value[value.length - 1] !== quote) {
        throw new Error(`Unterminated quoted string at ${startLine}:${startColumn}`);
      }

      tokens.push({ raw: value, line: startLine, column: startColumn });
      continue;
    }

    if (char === '<') {
      let value = '<';
      index += 1;
      column += 1;

      while (index < text.length && text[index] !== '>') {
        value += text[index];
        index += 1;
        column += 1;
      }

      if (text[index] !== '>') {
        throw new Error(`Unterminated <hex> literal at ${startLine}:${startColumn}`);
      }

      value += '>';
      index += 1;
      column += 1;
      tokens.push({ raw: value, line: startLine, column: startColumn });
      continue;
    }

    let value = '';
    while (index < text.length) {
      const next = text[index];
      const commentStart = next === '#' || (next === '/' && text[index + 1] === '/');
      if (/\s/.test(next) || commentStart) {
        break;
      }
      value += next;
      index += 1;
      column += 1;
    }

    tokens.push({ raw: value, line: startLine, column: startColumn });
  }

  return tokens;
}

function parseDataToken(rawToken) {
  if ((rawToken.startsWith('"') && rawToken.endsWith('"')) || (rawToken.startsWith("'") && rawToken.endsWith("'"))) {
    return textEncoder.encode(unescapeQuotedToken(rawToken));
  }

  if (rawToken.startsWith('<') && rawToken.endsWith('>')) {
    return hexToBytes(rawToken.slice(1, -1));
  }

  if (/^0x[0-9a-f]*$/i.test(rawToken)) {
    return hexToBytes(rawToken);
  }

  if (/^-?\d+$/.test(rawToken)) {
    return encodeScriptNum(BigInt(rawToken));
  }

  if (/^[0-9a-f]+$/i.test(rawToken) && rawToken.length % 2 === 0) {
    return hexToBytes(rawToken);
  }

  throw new Error(`Unrecognized literal: ${rawToken}`);
}

function parseScriptToken(token, index) {
  const { raw } = token;

  if (/^-?\d+$/.test(raw)) {
    const value = BigInt(raw);
    if (value === 0n) {
      return {
        index,
        type: 'opcode',
        label: 'OP_0',
        code: 0,
        word: 'OP_0',
        source: token,
      };
    }

    if (value === -1n) {
      return {
        index,
        type: 'opcode',
        label: 'OP_1NEGATE',
        code: getOpcodeCode('OP_1NEGATE'),
        word: 'OP_1NEGATE',
        source: token,
      };
    }

    if (value > 0n && value <= 16n) {
      const label = `OP_${value.toString()}`;
      return {
        index,
        type: 'opcode',
        label,
        code: getOpcodeCode(label),
        word: label,
        source: token,
      };
    }
  }

  const opcode = normalizeOpcode(raw);
  if (opcode) {
    return {
      index,
      type: 'opcode',
      label: opcode,
      code: getOpcodeCode(opcode),
      word: opcode,
      source: token,
    };
  }

  const data = parseDataToken(raw);
  return {
    index,
    type: 'push',
    label: raw,
    data,
    word: bytesToHex(data),
    source: token,
  };
}

function parseWitnessLine(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return null;
  }

  const tokens = scanTokens(trimmed);
  if (tokens.length !== 1) {
    throw new Error(`Witness line ${lineNumber} must contain exactly one item`);
  }

  const bytes = parseDataToken(tokens[0].raw);
  return {
    line: lineNumber,
    raw: trimmed,
    bytes,
    hex: bytesToHex(bytes),
  };
}

export function parseScript(text) {
  const instructions = [];
  const errors = [];
  let tokens = [];

  try {
    tokens = scanTokens(text);
  } catch (error) {
    errors.push(error.message);
  }

  for (let index = 0; index < tokens.length; index += 1) {
    try {
      instructions.push(parseScriptToken(tokens[index], index));
    } catch (error) {
      const token = tokens[index];
      errors.push(`${error.message} at ${token.line}:${token.column}`);
    }
  }

  const words = instructions.map((instruction) => instruction.word);
  const encodedWords = instructions.map((instruction) => {
    if (instruction.type === 'opcode') {
      return toEncoderOpcode(instruction.word);
    }
    return instruction.word;
  });
  let scriptHex = '';

  if (errors.length === 0) {
    try {
      scriptHex = Script.encode(encodedWords, false).hex;
    } catch (error) {
      errors.push(error.message);
    }
  }

  return {
    instructions,
    words,
    encodedWords,
    scriptHex,
    errors,
  };
}

export function parseWitness(text) {
  const items = [];
  const errors = [];
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    try {
      const item = parseWitnessLine(lines[index], index + 1);
      if (item) {
        items.push(item);
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  return { items, errors };
}

export function normalizeInternalKey(rawKey) {
  const clean = rawKey.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(clean)) {
    throw new Error('Internal key must be hex');
  }

  if (clean.length === 64) {
    return clean.toLowerCase();
  }

  if (clean.length === 66 && /^(02|03)/i.test(clean)) {
    return clean.slice(2).toLowerCase();
  }

  throw new Error('Internal key must be a 32-byte x-only key or 33-byte compressed pubkey');
}

export function buildTaprootArtifacts(words, internalKey, network) {
  const tapleafData = Tap.encodeScript(words);
  const tapleaf =
    typeof tapleafData === 'string'
      ? tapleafData
      : bytesToHex(tapleafData);
  const [outputKey, controlBlock] = Tap.getPubKey(internalKey, {
    target: tapleaf,
  });
  const scriptPubKeyWords = ['OP_1', outputKey];

  return {
    tapleaf,
    outputKey,
    controlBlock,
    address: Address.p2tr.fromPubKey(outputKey, network),
    scriptPubKeyWords,
    scriptPubKeyHex: Script.encode(scriptPubKeyWords, false).hex,
  };
}

export function parseLockingScriptInput(input) {
  const value = input.trim();
  if (!value) {
    return {
      words: [],
      errors: ['Destination script cannot be empty'],
      scriptHex: '',
    };
  }

  const addressPrefixes = ['bc1', 'tb1', 'bcrt1', '1', '3', 'm', 'n', '2'];
  if (addressPrefixes.some((prefix) => value.toLowerCase().startsWith(prefix))) {
    try {
      const words = Address.toScriptPubKey(value);
      return {
        words,
        encodedWords: words,
        errors: [],
        scriptHex: Script.encode(words, false).hex,
      };
    } catch (error) {
      return { words: [], errors: [error.message], scriptHex: '' };
    }
  }

  return parseScript(value);
}

export function describeStackItem(bytes, indexFromTop) {
  return {
    indexFromTop,
    hex: bytesToHex(bytes),
    size: bytes.length,
    intValue: asDisplayInt(bytes),
    textValue: asDisplayText(bytes),
    truthy: castToBool(bytes),
  };
}
