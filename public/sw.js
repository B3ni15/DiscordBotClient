/*
 * DisbotClient's service worker.
 *
 * Its one job is notifications: phones (and installed apps) only show them
 * through a service worker, and a click on one has to bring the client forward
 * — or open it — on the right channel. It caches nothing, so a deploy is never
 * served stale.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = new URL(data.url || "/channels/@me", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: "open-channel", channelId: data.channelId || null });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
