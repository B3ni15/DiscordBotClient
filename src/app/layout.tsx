import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/** Discord ships "gg sans"; Inter is the closest freely available match. */
const appSans = Inter({
  variable: "--font-app-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const appMono = JetBrains_Mono({
  variable: "--font-app-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

const SITE_URL = "https://disbotclient.xyz";
const DESCRIPTION =
  "Use your Discord bot like a real client. Read and send messages, DMs, threads and " +
  "reactions, see who is online and who is in voice, and manage slash commands — all in " +
  "the browser. Your bot token stays on your machine and nothing is stored on a server.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "disbotclient — use your Discord bot like a client",
    template: "%s · disbotclient",
  },
  description: DESCRIPTION,
  applicationName: "disbotclient",
  keywords: [
    "Discord bot client",
    "Discord bot dashboard",
    "bot token client",
    "Discord bot messages",
    "Discord slash commands",
    "Discord gateway browser",
    "self-hosted Discord client",
  ],
  category: "developer tools",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "disbotclient",
    title: "disbotclient — use your Discord bot like a client",
    description: DESCRIPTION,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: "disbotclient — use your Discord bot like a client",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: "#5865f2",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${appSans.variable} ${appMono.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
