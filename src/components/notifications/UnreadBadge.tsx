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
      className={`inline-flex min-w-[18px] animate-pop-in items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-center text-[11px] leading-none font-bold text-white ${className ?? ""}`}
    >
      {label}
    </span>
  );
}
