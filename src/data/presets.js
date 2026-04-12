const INTERNAL_KEY = '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
const PREVOUT_TXID = '11'.repeat(32);
const SAMPLE_PUBKEY = '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';
const SAMPLE_SIGNATURE =
  '3ddab2ed0789ee5982ea916152a81a3ba96a56faed6da602eee882999b85e98deeb9b9aea8f1ef454cf7a79eb095041e0e2164df8f6b354ba46ba350b1ad8933';

function baseForm(overrides = {}) {
  return {
    scriptText: '2 3 OP_ADD 5 OP_EQUAL',
    witnessText: '',
    tapTreeScripts: [],
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
    id: 'three-leaf',
    name: 'Three-Leaf Taproot',
    summary: 'Demonstrates a taproot tree with three script leaves.',
    form: baseForm({
      scriptText: '2 3 OP_ADD 5 OP_EQUAL',
      tapTreeScripts: [
        `${SAMPLE_PUBKEY} OP_CHECKSIG`,
        '10 OP_CHECKSEQUENCEVERIFY OP_DROP OP_TRUE',
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
