import { useEffect, useState } from "react";

export interface CommitRangeProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Called once a drag or a key press ends, not on every step, so that each change is one undo step. */
  readonly onCommit: (value: number) => void;
  readonly label: string;
  /** The value as read out by screen readers, for example "70%". */
  readonly valueText?: string;
  readonly className?: string | undefined;
}

/** A slider that shows every step while dragging and saves the result as one change. */
export function CommitRange({ value, min, max, step, onCommit, label, valueText, className }: CommitRangeProps) {
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setDraft(value);
  }, [value, dragging]);
  const commit = () => {
    setDragging(false);
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      type="range"
      className={className}
      min={min}
      max={max}
      step={step}
      value={draft}
      aria-label={label}
      {...(valueText ? { "aria-valuetext": valueText } : {})}
      onChange={(event) => {
        setDragging(true);
        setDraft(Number(event.target.value));
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}
