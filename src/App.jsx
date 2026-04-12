import { useDeferredValue, useEffect, useState } from 'react';
import CodeBlock from './components/CodeBlock.jsx';
import DebuggerBar from './components/DebuggerBar.jsx';
import ErrorList from './components/ErrorList.jsx';
import Field from './components/Field.jsx';
import HeaderBar from './components/HeaderBar.jsx';
import InstructionLane from './components/InstructionLane.jsx';
import PanelHeader from './components/PanelHeader.jsx';
import Sidebar from './components/Sidebar.jsx';
import StackPane from './components/StackPane.jsx';
import { PRESETS, cloneForm, createInitialForm } from './data/presets.js';
import { buildModel } from './lib/app-model.js';

export default function App() {
  const [form, setForm] = useState(createInitialForm);
  const [playhead, setPlayhead] = useState(0);
  const [sidebarTab, setSidebarTab] = useState('context');
  const [showAltStack, setShowAltStack] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESETS[0].id);
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
    setSelectedPresetId(preset.id);
    setForm(cloneForm(preset.form));
    setPlayhead(0);
  }

  const isRunnable = frames.length > 0 && model.errors.length === 0;
  const statusTone = frame?.success ? 'good' : frame?.error ? 'bad' : 'neutral';
  const finalityTone = frame?.txFinality?.isFinal ? 'good' : 'warn';
  const finalityMessage = frame?.txFinality?.message ?? 'Transaction finality will appear here.';
  const timePreview = model.context
    ? new Date(model.context.chainTime * 1000).toLocaleString()
    : '—';

  return (
    <div className="app-shell">
      <HeaderBar
        frame={frame}
        activePlayhead={activePlayhead}
        maxPlayhead={maxPlayhead}
        statusTone={statusTone}
        finalityTone={finalityTone}
      />

      <Sidebar
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        form={form}
        patchField={patchField}
        timePreview={timePreview}
        model={model}
      />

      <div className="content-shell">
        <ErrorList errors={model.errors} />

        <main className="workspace">
          <section className="workspace__column workspace__column--controls">
            <section className="panel">
              <PanelHeader eyebrow="Examples" title="Script Examples" />
              <Field label="Preset" value={selectedPresetId} onChange={() => {}}>
                <select
                  className="field__input"
                  value={selectedPresetId}
                  onChange={(event) => {
                    const preset = PRESETS.find(({ id }) => id === event.target.value);
                    if (preset) {
                      loadPreset(preset);
                    }
                  }}
                >
                  {PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </Field>
            </section>

            <section className="panel">
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
              <PanelHeader eyebrow="Trace" title="Instruction Trace" />
              <InstructionLane instructions={model.script.instructions} frame={frame} />
            </section>
          </section>

          <section className="workspace__column workspace__column--visualizer">
            <section className="panel panel--visualizer">
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
                <StackPane
                  title="Main Stack"
                  items={frame?.stack ?? []}
                  emptyLabel="Main stack is empty."
                  prominent
                />
                {showAltStack ? (
                  <StackPane title="Alt Stack" items={frame?.altStack ?? []} emptyLabel="Alt stack is empty." />
                ) : null}
              </div>
            </section>
          </section>
        </main>
      </div>

      <DebuggerBar
        frame={frame}
        finalityMessage={finalityMessage}
        isRunnable={isRunnable}
        activePlayhead={activePlayhead}
        maxPlayhead={maxPlayhead}
        onReset={() => setPlayhead(0)}
        onPrevious={() => setPlayhead((current) => Math.max(current - 1, 0))}
        onNext={() => setPlayhead((current) => Math.min(current + 1, maxPlayhead))}
        onRun={() => setPlayhead(maxPlayhead)}
      />
    </div>
  );
}
