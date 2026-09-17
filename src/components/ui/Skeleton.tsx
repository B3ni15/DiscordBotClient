export interface SkeletonProps {
  className?: string;
  /** Inline width, handy for varying the length of placeholder lines. */
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "full";
}

const RADIUS = { sm: "4px", md: "8px", full: "999px" } as const;

/** One shimmering placeholder block. */
export function Skeleton({ className, width, height, rounded = "md" }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`skeleton block ${className ?? ""}`}
      style={{ width, height, borderRadius: RADIUS[rounded] }}
    />
  );
}

/** A handful of placeholder rows that look like a list of channels or members. */
export function SkeletonRows({
  rows = 6,
  avatar = false,
  className,
}: {
  rows?: number;
  avatar?: boolean;
  className?: string;
}) {
  // Varying widths read as content rather than as a grid of identical bars.
  const widths = ["78%", "56%", "68%", "44%", "72%", "60%", "50%", "66%"];

  return (
    <div aria-hidden className={`flex flex-col gap-2 ${className ?? ""}`}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2 px-2 py-1">
          {avatar && <Skeleton width={24} height={24} rounded="full" />}
          <Skeleton height={10} width={widths[index % widths.length]} rounded="sm" />
        </div>
      ))}
    </div>
  );
}
