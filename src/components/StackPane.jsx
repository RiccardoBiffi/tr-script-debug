export default function StackPane({ title, items, emptyLabel }) {
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
