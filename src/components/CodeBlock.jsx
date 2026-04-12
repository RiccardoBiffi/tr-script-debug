export default function CodeBlock({ label, value, compact = false }) {
  return (
    <div className="code-block">
      <div className="code-block__label">{label}</div>
      <pre className={`code-block__value${compact ? ' code-block__value--compact' : ''}`}>
        {value || '—'}
      </pre>
    </div>
  );
}
