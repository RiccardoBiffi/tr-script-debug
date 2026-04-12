export default function Field({
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
