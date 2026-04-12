import CodeBlock from './CodeBlock.jsx';
import Field from './Field.jsx';
import PanelHeader from './PanelHeader.jsx';

export default function Sidebar({
  sidebarTab,
  setSidebarTab,
  form,
  patchField,
  timePreview,
  model,
}) {
  return (
    <aside className="app-sidebar">
      <section className="panel panel--sidebar">
        <div className="sidebar-tabs" role="tablist" aria-label="Debugger sidebar sections">
          <button
            type="button"
            role="tab"
            id="tab-context"
            aria-selected={sidebarTab === 'context'}
            aria-controls="panel-context"
            className={`sidebar-tab${sidebarTab === 'context' ? ' sidebar-tab--active' : ''}`}
            onClick={() => setSidebarTab('context')}
          >
            Execution Context
          </button>
          <button
            type="button"
            role="tab"
            id="tab-taproot"
            aria-selected={sidebarTab === 'taproot'}
            aria-controls="panel-taproot"
            className={`sidebar-tab${sidebarTab === 'taproot' ? ' sidebar-tab--active' : ''}`}
            onClick={() => setSidebarTab('taproot')}
          >
            Taproot Commitments
          </button>
        </div>

        {sidebarTab === 'context' ? (
          <div className="sidebar-section" role="tabpanel" id="panel-context" aria-labelledby="tab-context">
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
          <div className="sidebar-section" role="tabpanel" id="panel-taproot" aria-labelledby="tab-taproot">
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
  );
}
