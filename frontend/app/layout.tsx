import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { THEME_BOOT_SCRIPT } from "../lib/useTheme";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// The voice of the brand: the wordmark, the hero line and section headings.
// Geist stays the UI face, where a neutral workhorse reads best.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

// Monospace is reserved for raw build output, which really is code.
const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "rwaft · Describe an app, get a link",
  description: "Describe an app in plain words. rwaft writes it, builds it, and hosts it, and you watch the real build as it happens.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#030305" },
  ],
};

/**
 * Direction contract, emitted into the built HTML so it can be audited
 * against what actually shipped.
 */
const CONTRACT = `<!--
THESIS: The user-pinned Lovable/Bolt pattern, kept simple: one prompt box to start, then chat beside a live preview. Nothing on screen that isn't the build.
OWN-WORLD: Near-white (or near-black) canvas, white surfaces with 1px hairlines, one black primary action, one violet accent for links and focus, status pills for line/building/live/failed, Bricolage Grotesque for the wordmark and headlines over Geist for UI; working light and dark themes.
STORY: A maker types an idea on the home screen, lands in a workspace where rwaft replies step by step in plain words with the raw log inside each reply, sees their place in line, and gets the live site in the preview.
FIRST VIEWPORT: Home: minimal header, centered "What should we build?", one large prompt box with mode switch, cost and send, example chips, recent builds below. Build: chat column left, preview panel right with Preview/Log tabs and an address bar.
FORM: Brief-pinned by the user ("simplistic like Lovable, Bolt"); no roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
