export interface UnreadBadgeProps {
  count: number;
  className?: string;
}

/** Small pill with the unread count; anything above 99 renders as "99+". */
export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <span
      aria-label={`${label} unread`}
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-center font-mono text-[10px] leading-none font-semibold text-ink ${className ?? ""}`}
    >
      {label}
    </span>
  );
}
