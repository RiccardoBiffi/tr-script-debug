export default function HeaderBar({
  frame,
  activePlayhead,
  maxPlayhead,
  statusTone,
  finalityTone,
}) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <h1 className="topbar__title">Taproot Script Debugger</h1>
      </div>
      <div className="topbar__stats">
        <div className={`header-stat header-stat--${statusTone}`}>
          <span className="header-stat__label">Script Status</span>
          <span className="header-stat__value">{frame?.status ?? 'idle'}</span>
        </div>
        <div className="header-stat">
          <span className="header-stat__label">Steps</span>
          <span className="header-stat__value">{`${activePlayhead}/${maxPlayhead}`}</span>
        </div>
        <div className="header-stat">
          <span className="header-stat__label">Budget</span>
          <span className="header-stat__value">{frame ? String(frame.sigopsBudget) : '—'}</span>
        </div>
        <div className={`header-stat header-stat--${finalityTone}`}>
          <span className="header-stat__label">Tx Final</span>
          <span className="header-stat__value">
            {frame?.txFinality ? (frame.txFinality.isFinal ? 'yes' : 'no') : '—'}
          </span>
        </div>
      </div>
    </header>
  );
}
