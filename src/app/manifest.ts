import type { MetadataRoute } from "next";

/**
 * Lets the client be installed as an app. Phones need that for notifications:
 * iOS only shows them for a site added to the Home Screen, and the app's icon
 * badge carries the unread count.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "disbotclient",
    short_name: "disbotclient",
    description: "Use your Discord bot like a real client.",
    start_url: "/channels/@me",
    scope: "/",
    display: "standalone",
    background_color: "#1e1f22",
    theme_color: "#1e1f22",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
