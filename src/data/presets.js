const INTERNAL_KEY = '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
const PREVOUT_TXID = '11'.repeat(32);
const SAMPLE_PUBKEY = '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';
const SAMPLE_SIGNATURE =
  '3ddab2ed0789ee5982ea916152a81a3ba96a56faed6da602eee882999b85e98deeb9b9aea8f1ef454cf7a79eb095041e0e2164df8f6b354ba46ba350b1ad8933';
const BSSL_KEYS = {
  a: SAMPLE_PUBKEY,
  a1: '466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27',
  b: '3c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b1',
  b1: '2c0b7cf95324a07d05398b240174dc0c2be444d96b159aa6c7f7b1e668680991',
  c: '9ac20335eb38768d2052be1dbbc3c8f6178407458e51e6b4ad22f1d91758895b',
};
const BSSL_DELAY = 144;
const BSSL_ONE_YEAR = 52560;
const BSSL_THREE_YEARS = 157680;
const BSSL_ACTIVE_WITNESS = [
  '4e05066ffb954f09859764f398b7b05ab7d1b81c4b86dc0dab72a36dc98b7c5ce15dbe661621bba6010a43d5f2c3893bf6849f94b0bd9be5512f257b0a4a5f96',
  '1f4a1931830872b72a7b59c10b2c4b2dde26bc8f1f5c4f7d814ca370a52d1ea0e6d66fe07f26659f516db2e8399004e45438a0b66b4a295358045198d2f37827',
].join('\n');

export const ACTIVE_TAPSCRIPT_MARKER = '__ACTIVE_TAPSCRIPT__';

function buildBsslLeaf(delayOpcode, firstPubkey, secondPubkey, lockOpcode) {
  return `${delayOpcode} ${lockOpcode} OP_DROP ${firstPubkey} OP_CHECKSIGVERIFY ${secondPubkey} OP_CHECKSIG`;
}

const BSSL_ACTIVE_SCRIPT = buildBsslLeaf(
  BSSL_DELAY,
  BSSL_KEYS.c,
  BSSL_KEYS.a,
  'OP_CHECKSEQUENCEVERIFY',
);
const BSSL_A1_C_SCRIPT = buildBsslLeaf(
  BSSL_DELAY,
  BSSL_KEYS.c,
  BSSL_KEYS.a1,
  'OP_CHECKSEQUENCEVERIFY',
);
const BSSL_A_B_SCRIPT = buildBsslLeaf(
  BSSL_ONE_YEAR,
  BSSL_KEYS.b,
  BSSL_KEYS.a,
  'OP_CHECKLOCKTIMEVERIFY',
);
const BSSL_B_C_SCRIPT = buildBsslLeaf(
  BSSL_THREE_YEARS,
  BSSL_KEYS.c,
  BSSL_KEYS.b,
  'OP_CHECKLOCKTIMEVERIFY',
);
const BSSL_B1_C_SCRIPT = buildBsslLeaf(
  BSSL_THREE_YEARS,
  BSSL_KEYS.c,
  BSSL_KEYS.b1,
  'OP_CHECKLOCKTIMEVERIFY',
);

function baseForm(overrides = {}) {
  return {
    scriptText: '2 3 OP_ADD 5 OP_EQUAL',
    witnessText: '',
    tapTreeScripts: [],
    tapTreeLayout: null,
    internalKey: INTERNAL_KEY,
    network: 'regtest',
    txVersion: '2',
    txLocktime: '0',
    inputSequence: '4294967294',
    prevoutTxid: PREVOUT_TXID,
    prevoutIndex: '0',
    prevoutValue: '100000',
    outputValue: '99000',
    outputScript: 'OP_TRUE',
    chainHeight: '840000',
    chainTime: '1710000000',
    ...overrides,
  };
}

export const PRESETS = [
  {
    id: 'simple',
    name: 'Warm-up',
    summary: 'Small arithmetic path with a clean true/false ending.',
    form: baseForm(),
  },
  {
    id: 'cltv',
    name: 'Absolute Locktime',
    summary: 'Shows CLTV against editable transaction locktime and chain height.',
    form: baseForm({
      scriptText: '840000 OP_CHECKLOCKTIMEVERIFY OP_DROP OP_TRUE',
      txLocktime: '840000',
      chainHeight: '850000',
      inputSequence: '4294967294',
    }),
  },
  {
    id: 'csv',
    name: 'Relative Locktime',
    summary: 'Exercises CSV with a sequence-based delay.',
    form: baseForm({
      scriptText: '10 OP_CHECKSEQUENCEVERIFY OP_DROP OP_TRUE',
      inputSequence: '10',
      txVersion: '2',
    }),
  },
  {
    id: 'checksig',
    name: 'Taproot CHECKSIG',
    summary: 'Fully working schnorr signature example against the transaction template.',
    form: baseForm({
      scriptText: `${SAMPLE_PUBKEY} OP_CHECKSIG`,
      witnessText: SAMPLE_SIGNATURE,
    }),
  },
  {
    id: 'b-ssl',
    name: 'B-SSL Huffman Tree',
    summary: 'Five B-SSL leaves committed in a Huffman-style taproot tree.',
    form: baseForm({
      scriptText: BSSL_ACTIVE_SCRIPT,
      witnessText: BSSL_ACTIVE_WITNESS,
      inputSequence: String(BSSL_DELAY),
      tapTreeLayout: [
        [ACTIVE_TAPSCRIPT_MARKER, BSSL_A1_C_SCRIPT],
        [BSSL_A_B_SCRIPT, [BSSL_B_C_SCRIPT, BSSL_B1_C_SCRIPT]],
      ],
    }),
  },
];

export function cloneForm(form) {
  return JSON.parse(JSON.stringify(form));
}

export function createInitialForm() {
  return cloneForm(PRESETS[0].form);
}
