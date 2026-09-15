/**
 * Default "jump to message" behaviour for the navigation panels.
 *
 * It looks for `[data-message-id="<id>"]` in the DOM, so the chat renderer has to
 * put that attribute on its message rows. When the message is not rendered (it is
 * outside the loaded history) the caller gets `false` back and can show a hint.
 */
export function jumpToMessage(messageId: string): boolean {
  if (typeof document === "undefined") return false;
  const element = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("ring-1", "ring-accent");
  window.setTimeout(() => element.classList.remove("ring-1", "ring-accent"), 1600);
  return true;
}
