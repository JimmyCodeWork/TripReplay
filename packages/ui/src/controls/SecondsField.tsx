const SECOND = 1_000_000;

export interface SecondsFieldProps {
  readonly label: string;
  /** The current value in microseconds. */
  readonly value: number;
  readonly min?: number;
  /** Largest value in microseconds. */
  readonly max: number;
  /** Step in seconds; tenths by default. */
  readonly step?: number;
  readonly onCommit: (us: number) => void;
  readonly className?: string | undefined;
}

/** A time in seconds, saved as one change when the field loses focus or on Enter. */
export function SecondsField({ label, value, min = 0, max, step = 0.1, onCommit, className }: SecondsFieldProps) {
  return (
    <label className={className}>
      {label}
      <input
        type="number"
        min={min / SECOND}
        max={max / SECOND}
        step={step}
        key={value}
        defaultValue={Math.round(value / 100_000) / 10}
        onBlur={(event) => {
          const seconds = Number(event.target.value);
          if (Number.isFinite(seconds) && Math.round(seconds * SECOND) !== value)
            onCommit(Math.round(seconds * SECOND));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}
