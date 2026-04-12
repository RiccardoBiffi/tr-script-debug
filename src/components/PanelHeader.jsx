export default function PanelHeader({ eyebrow, title, action = null }) {
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
