/**
 * Notifications through the service worker (`public/sw.js`).
 *
 * `new Notification()` only works on desktop browsers; Android Chrome throws
 * and iOS has no constructor at all. `registration.showNotification()` works
 * everywhere notifications do, so it is tried first and the constructor is the
 * fallback.
 */

export interface ShowOptions {
  body: string;
  icon?: string;
  /** One live notification per tag; a newer one replaces it. */
  tag?: string;
  silent?: boolean;
  /** Opened when the notification is clicked and no client window is open. */
  url: string;
  channelId?: string;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers the worker once; resolves to null where there is none to be had. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  registration ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null);
  return registration;
}

/** Shows a notification; `onClick` only runs for the constructor fallback. */
export async function showNotification(
  title: string,
  options: ShowOptions,
  onClick?: () => void,
): Promise<boolean> {
  const { url, channelId, ...rest } = options;
  const init: NotificationOptions & { renotify?: boolean } = {
    ...rest,
    // A replaced notification should still buzz the phone.
    renotify: Boolean(rest.tag),
    data: { url, channelId },
  };

  const worker = await registerServiceWorker();
  if (worker) {
    try {
      await worker.showNotification(title, init);
      return true;
    } catch {
      // Fall through to the constructor.
    }
  }
  try {
    const notification = new Notification(title, init);
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Calls `onOpen` when a notification click asks this window to show a channel. */
export function listenForNotificationClicks(onOpen: (channelId: string) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const handle = (event: MessageEvent) => {
    const data = event.data as { type?: string; channelId?: string | null } | null;
    if (data?.type === "open-channel" && data.channelId) onOpen(data.channelId);
  };
  navigator.serviceWorker.addEventListener("message", handle);
  return () => navigator.serviceWorker.removeEventListener("message", handle);
}
