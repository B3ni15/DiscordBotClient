import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "disbotclient",
  description:
    "A Discord bot client that runs entirely in your browser. Your token never leaves your machine.",
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
