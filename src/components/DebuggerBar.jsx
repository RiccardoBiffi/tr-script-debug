export default function DebuggerBar({
  frame,
  finalityMessage,
  isRunnable,
  activePlayhead,
  maxPlayhead,
  onReset,
  onPrevious,
  onNext,
  onRun,
}) {
  return (
    <section className="debugger-bar">
      <div className="debugger-bar__message">
        <div className="debugger-bar__note">{frame?.note ?? 'Compile a valid script to start stepping.'}</div>
        <div className="debugger-bar__subnote">{finalityMessage}</div>
      </div>

      <div className="debugger-bar__controls">
        <button type="button" onClick={onReset} disabled={!isRunnable || activePlayhead === 0}>
          Reset
        </button>
        <button type="button" onClick={onPrevious} disabled={!isRunnable || activePlayhead === 0}>
          Previous
        </button>
        <button type="button" onClick={onNext} disabled={!isRunnable || activePlayhead >= maxPlayhead}>
          Next
        </button>
        <button type="button" onClick={onRun} disabled={!isRunnable}>
          Run
        </button>
      </div>
    </section>
  );
}
