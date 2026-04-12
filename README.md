# Taproot Script Debugger
[![CI](https://github.com/RiccardoBiffi/tr-script-debug/actions/workflows/ci.yml/badge.svg)](https://github.com/RiccardoBiffi/tr-script-debug/actions/workflows/ci.yml)

Browser-based Bitcoin Script debugger focused on Taproot script-path spends.

## Features

- Editable tapscript assembly and witness stack
- Visual main stack and alt stack
- `Reset`, `Previous`, `Next`, and `Run` execution controls
- Editable transaction and chain context:
  - current block height
  - current block time
  - transaction locktime
  - input sequence
  - prevout value and txid
- Taproot metadata panel:
  - tapleaf hash
  - output key
  - control block
  - P2TR scriptPubKey
  - address
- Built-in presets, including a working `OP_CHECKSIG` example

## Run

```bash
npm install
npm run dev
```

Build a production bundle with:

```bash
npm run build
```

## Notes

- The debugger models tapscript execution for a single-input, single-output spend template.
- `OP_CHECKSIG`, `OP_CHECKSIGVERIFY`, and `OP_CHECKSIGADD` use the editable taproot transaction context and BIP341/BIP342 sighash rules.
- Legacy opcodes that are `OP_SUCCESSx` in tapscript are accepted in the editor and compiled to their taproot meaning.
