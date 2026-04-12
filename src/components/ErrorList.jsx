export default function ErrorList({ errors }) {
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
