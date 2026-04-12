import { Tx } from '@cmdcode/tapscript';
import { useDeferredValue, useEffect, useState } from 'react';
import { PRESETS, cloneForm, createInitialForm } from './data/presets.js';
import { buildTxTemplate, executeDebugger } from './lib/interpreter.js';
import {
  buildTaprootArtifacts,
  normalizeInternalKey,
  parseLockingScriptInput,
  parseScript,
  parseWitness,
} from './lib/script.js';

function parseNumberField(label, rawValue) {
  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return Number.parseInt(value, 10);
}

function parseContext(form) {
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

function buildModel(form) {
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
      txHex = Tx.encode(txBundle.txData);
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

function Field({
  label,
  value,
  onChange,
  help,
  textarea = false,
  mono = false,
  rows = 3,
  children,
}) {
  const Element = textarea ? 'textarea' : 'input';

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children ?? (
        <Element
          className={`field__input${mono ? ' field__input--mono' : ''}`}
          value={value}
          rows={textarea ? rows : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help ? <span className="field__help">{help}</span> : null}
    </label>
  );
}

function CodeBlock({ label, value, compact = false }) {
  return (
    <div className="code-block">
      <div className="code-block__label">{label}</div>
      <pre className={`code-block__value${compact ? ' code-block__value--compact' : ''}`}>
        {value || '—'}
      </pre>
    </div>
  );
}

function StatChip({ label, value, tone = 'neutral' }) {
  return (
    <div className={`stat-chip stat-chip--${tone}`}>
      <span className="stat-chip__label">{label}</span>
      <span className="stat-chip__value">{value}</span>
    </div>
  );
}

function PanelHeader({ eyebrow, title, action = null }) {
  return (
    <div className="panel__top">
      <div>
        <div className="panel__eyebrow">{eyebrow}</div>
        {title ? <div className="panel__title">{title}</div> : null}
      </div>
      {action}
    </div>
  );
}

function InstructionLane({ instructions, frame }) {
  const currentIndex = frame?.nextInstructionIndex;
  const lastIndex = frame?.instructionIndex;

  return (
    <div className="instruction-lane">
      {instructions.length === 0 ? <div className="empty-state">No instructions yet.</div> : null}
      {instructions.map((instruction) => {
        const isCurrent = currentIndex === instruction.index;
        const isLast = lastIndex === instruction.index;

        return (
          <div
            key={`${instruction.index}-${instruction.label}`}
            className={`instruction-row${isCurrent ? ' instruction-row--current' : ''}${
              isLast ? ' instruction-row--last' : ''
            }`}
          >
            <span className="instruction-row__index">{instruction.index}</span>
            <span className="instruction-row__label">{instruction.label}</span>
            <span className="instruction-row__meta">
              {instruction.type === 'push'
                ? 'push'
                : `0x${instruction.code.toString(16).padStart(2, '0')}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StackPane({ title, items, emptyLabel }) {
  return (
    <div className="stack-pane">
      <div className="stack-pane__title">{title}</div>
      {items.length === 0 ? <div className="empty-state">{emptyLabel}</div> : null}
      {items.map((item) => (
        <article key={`${title}-${item.indexFromTop}-${item.hex}`} className="stack-card">
          <div className="stack-card__header">
            <span className="stack-card__index">
              {item.indexFromTop === 0 ? 'top' : `top-${item.indexFromTop}`}
            </span>
            <span className={`stack-card__truth${item.truthy ? ' stack-card__truth--true' : ''}`}>
              {item.truthy ? 'true' : 'false'}
            </span>
          </div>
          <div className="stack-card__hex">{item.hex || '(empty)'}</div>
          <div className="stack-card__meta">bytes {item.size}</div>
          {item.intValue !== null ? <div className="stack-card__meta">int {item.intValue}</div> : null}
          {item.textValue && item.textValue !== '(empty)' ? (
            <div className="stack-card__meta">text "{item.textValue}"</div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ErrorList({ errors }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <section className="panel panel--alert">
      <div className="panel__eyebrow">Build Errors</div>
      <ul className="error-list">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </section>
  );
}

export default function App() {
  const [form, setForm] = useState(createInitialForm);
  const [playhead, setPlayhead] = useState(0);
  const [sidebarTab, setSidebarTab] = useState('context');
  const [showAltStack, setShowAltStack] = useState(false);
  const deferredForm = useDeferredValue(form);
  const model = buildModel(deferredForm);
  const frames = model.debug?.snapshots ?? [];
  const maxPlayhead = Math.max(frames.length - 1, 0);
  const activePlayhead = Math.min(playhead, maxPlayhead);
  const frame = frames[activePlayhead] ?? null;

  useEffect(() => {
    setPlayhead(0);
  }, [deferredForm]);

  function patchField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function loadPreset(preset) {
    setForm(cloneForm(preset.form));
    setPlayhead(0);
  }

  const isRunnable = frames.length > 0 && model.errors.length === 0;
  const statusTone = frame?.success ? 'good' : frame?.error ? 'bad' : 'neutral';
  const finalityTone = frame?.txFinality?.isFinal ? 'good' : 'warn';
  const currentInstruction = frame?.instructionLabel ?? (frame?.success ? 'Complete' : 'Ready');
  const finalityMessage = frame?.txFinality?.message ?? 'Transaction finality will appear here.';
  const timePreview = model.context
    ? new Date(model.context.chainTime * 1000).toLocaleString()
    : '—';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="topbar__eyebrow">Taproot Script Lab</div>
          <h1 className="topbar__title">Taproot Script Debugger</h1>
        </div>
        <div className="topbar__stats">
          <StatChip label="Script Status" value={frame?.status ?? 'idle'} tone={statusTone} />
          <StatChip label="Steps" value={`${activePlayhead}/${maxPlayhead}`} />
          <StatChip label="Budget" value={frame ? String(frame.sigopsBudget) : '—'} />
          <StatChip
            label="Tx Final"
            value={frame?.txFinality ? (frame.txFinality.isFinal ? 'yes' : 'no') : '—'}
            tone={finalityTone}
          />
        </div>
      </header>

      <section className="preset-strip">
        {PRESETS.map((preset) => (
          <button key={preset.id} className="preset" onClick={() => loadPreset(preset)} type="button">
            <span className="preset__name">{preset.name}</span>
          </button>
        ))}
      </section>

      <ErrorList errors={model.errors} />

      <main className="workspace">
        <section className="workspace__column">
          <section className="panel panel--follow">
            <PanelHeader eyebrow="Witness" title="Witness Stack" />
            <Field
              label="Witness Stack Items"
              value={form.witnessText}
              onChange={(value) => patchField('witnessText', value)}
              textarea
              mono
              rows={9}
              help="One stack item per line. Empty vector: 0, <>, or 0x."
            />
            <CodeBlock
              label="Witness Used For Spend"
              value={
                model.txBundle
                  ? model.txBundle.finalWitnessHex
                      .map((item, index) => `#${index}: ${item || '(empty)'}`)
                      .join('\n')
                  : ''
              }
              compact
            />
          </section>

          <section className="panel">
            <PanelHeader eyebrow="Trace" title="Instruction Trace" />
            <InstructionLane instructions={model.script.instructions} frame={frame} />
          </section>
        </section>

        <section className="workspace__column">
          <section className="panel panel--follow">
            <PanelHeader eyebrow="Locking Script" title="Tapscript Assembly" />
            <Field
              label="Script"
              value={form.scriptText}
              onChange={(value) => patchField('scriptText', value)}
              textarea
              mono
              rows={9}
              help="Use ASM-style tokens. Data pushes can be decimal numbers, 0x-prefixed hex, <hex>, or quoted strings."
            />
            <div className="two-up">
              <CodeBlock label="Compiled Script Hex" value={model.script.scriptHex} compact />
              <CodeBlock label="Destination Script Hex" value={model.destination.scriptHex} compact />
            </div>
          </section>

          <section className="panel">
            <PanelHeader
              eyebrow="Visualizer"
              title="Stack Visualizer"
              action={
                <button
                  type="button"
                  className={`icon-toggle${showAltStack ? ' icon-toggle--active' : ''}`}
                  onClick={() => setShowAltStack((current) => !current)}
                  aria-pressed={showAltStack}
                  aria-label={showAltStack ? 'Hide alt stack' : 'Show alt stack'}
                >
                  <span className="icon-toggle__glyph" aria-hidden="true">
                    <span />
                    <span />
                  </span>
                  <span className="icon-toggle__label">Alt Stack</span>
                </button>
              }
            />
            <div className={`stack-layout${showAltStack ? ' stack-layout--expanded' : ''}`}>
              <StackPane title="Main Stack" items={frame?.stack ?? []} emptyLabel="Main stack is empty." />
              {showAltStack ? (
                <StackPane title="Alt Stack" items={frame?.altStack ?? []} emptyLabel="Alt stack is empty." />
              ) : null}
            </div>
          </section>
        </section>

        <aside className="workspace__sidebar">
          <section className="panel panel--sidebar">
            <div className="sidebar-tabs">
              <button
                type="button"
                className={`sidebar-tab${sidebarTab === 'context' ? ' sidebar-tab--active' : ''}`}
                onClick={() => setSidebarTab('context')}
              >
                Execution Context
              </button>
              <button
                type="button"
                className={`sidebar-tab${sidebarTab === 'taproot' ? ' sidebar-tab--active' : ''}`}
                onClick={() => setSidebarTab('taproot')}
              >
                Taproot Commitments
              </button>
            </div>

            {sidebarTab === 'context' ? (
              <div className="sidebar-section">
                <PanelHeader eyebrow="Execution Context" title="Spend Template" />
                <div className="sidebar-grid sidebar-grid--three">
                  <Field label="Tx Version" value={form.txVersion} onChange={(value) => patchField('txVersion', value)} />
                  <Field label="Tx Locktime" value={form.txLocktime} onChange={(value) => patchField('txLocktime', value)} />
                  <Field
                    label="Input Sequence"
                    value={form.inputSequence}
                    onChange={(value) => patchField('inputSequence', value)}
                  />
                </div>
                <div className="sidebar-grid sidebar-grid--three">
                  <Field
                    label="Current Block Height"
                    value={form.chainHeight}
                    onChange={(value) => patchField('chainHeight', value)}
                  />
                  <Field
                    label="Current Block Time"
                    value={form.chainTime}
                    onChange={(value) => patchField('chainTime', value)}
                    help={timePreview}
                  />
                  <Field
                    label="Prevout Value"
                    value={form.prevoutValue}
                    onChange={(value) => patchField('prevoutValue', value)}
                  />
                </div>
                <div className="sidebar-grid sidebar-grid--two">
                  <Field
                    label="Prevout Txid"
                    value={form.prevoutTxid}
                    onChange={(value) => patchField('prevoutTxid', value)}
                    mono
                  />
                  <Field
                    label="Prevout Index"
                    value={form.prevoutIndex}
                    onChange={(value) => patchField('prevoutIndex', value)}
                  />
                </div>
                <Field
                  label="Output Value"
                  value={form.outputValue}
                  onChange={(value) => patchField('outputValue', value)}
                />
                <CodeBlock label="Transaction Hex Used For CHECKSIG" value={model.txHex} />
              </div>
            ) : (
              <div className="sidebar-section">
                <PanelHeader eyebrow="Taproot Commitments" title="Key, Leaf, Address" />
                <div className="sidebar-grid sidebar-grid--three">
                  <Field
                    label="Internal Key"
                    value={form.internalKey}
                    onChange={(value) => patchField('internalKey', value)}
                    mono
                    help="32-byte x-only pubkey or a compressed 33-byte pubkey."
                  />
                  <Field label="Network" value={form.network} onChange={() => {}}>
                    <select
                      className="field__input"
                      value={form.network}
                      onChange={(event) => patchField('network', event.target.value)}
                    >
                      <option value="main">main</option>
                      <option value="testnet">testnet</option>
                      <option value="regtest">regtest</option>
                    </select>
                  </Field>
                  <Field
                    label="Output Script"
                    value={form.outputScript}
                    onChange={(value) => patchField('outputScript', value)}
                    mono
                    help="Destination output for the spend transaction. Address or assembly."
                  />
                </div>
                <div className="sidebar-grid sidebar-grid--two">
                  <CodeBlock label="Tapleaf Hash" value={model.taproot?.tapleaf} compact />
                  <CodeBlock label="Output Key" value={model.taproot?.outputKey} compact />
                </div>
                <div className="sidebar-grid sidebar-grid--two">
                  <CodeBlock label="Control Block" value={model.taproot?.controlBlock} compact />
                  <CodeBlock label="Taproot scriptPubKey" value={model.taproot?.scriptPubKeyHex} compact />
                </div>
                <CodeBlock label="Address" value={model.taproot?.address} compact />
              </div>
            )}
          </section>
        </aside>
      </main>

      <section className="debugger-bar">
        <div className="debugger-bar__status">
          <div className="debugger-bar__eyebrow">Debugger</div>
          <div className="debugger-bar__instruction">{currentInstruction}</div>
          <div
            className={`debugger-bar__state${frame?.error ? ' debugger-bar__state--error' : frame?.success ? ' debugger-bar__state--success' : ''}`}
          >
            {frame?.status ?? 'idle'}
          </div>
        </div>

        <div className="debugger-bar__message">
          <div className="debugger-bar__note">{frame?.note ?? 'Compile a valid script to start stepping.'}</div>
          <div className="debugger-bar__subnote">{finalityMessage}</div>
        </div>

        <div className="debugger-bar__controls">
          <button type="button" onClick={() => setPlayhead(0)} disabled={!isRunnable || activePlayhead === 0}>
            Reset
          </button>
          <button
            type="button"
            onClick={() => setPlayhead((current) => Math.max(current - 1, 0))}
            disabled={!isRunnable || activePlayhead === 0}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPlayhead((current) => Math.min(current + 1, maxPlayhead))}
            disabled={!isRunnable || activePlayhead >= maxPlayhead}
          >
            Next
          </button>
          <button type="button" onClick={() => setPlayhead(maxPlayhead)} disabled={!isRunnable}>
            Run
          </button>
        </div>
      </section>
    </div>
  );
}
