export default function InstructionLane({ instructions, frame }) {
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
