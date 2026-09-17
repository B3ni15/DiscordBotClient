export interface SpinnerProps {
  /** Pixel size of the ring. */
  size?: number;
  className?: string;
  label?: string;
}

/** Indeterminate ring, used wherever something is loading or in flight. */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 animate-spin-slow rounded-full border-2 border-current border-t-transparent ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}
