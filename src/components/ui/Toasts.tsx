"use client";

import { useUI } from "@/lib/store/ui";

/**
 * Short-lived feedback for actions that have no dialog of their own — a role
 * handed out from a context menu, a channel created, a request Discord refused.
 */
export function Toasts() {
  const toasts = useUI((state) => state.toasts);
  const dismiss = useUI((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={`pointer-events-auto max-w-md animate-pop-in rounded px-4 py-2 text-sm shadow-lg transition-opacity hover:opacity-80 ${
            toast.tone === "error" ? "bg-danger text-white" : "bg-floating text-bright"
          }`}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}
