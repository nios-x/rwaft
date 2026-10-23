import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { CONTACT_URL, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "../lib/site";
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

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const bingVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI app builder",
    "AI website builder",
    "AI website generator",
    "no-code app builder",
    "prompt to app",
    "text to website",
    "React app generator",
    "deploy React app",
    "Lovable alternative",
    "Bolt alternative",
    "v0 alternative",
    "rwaft",
  ],
  // The root layout's canonical is inherited by every route below it. That is
  // right while the console is a single page; a new page must set its own.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  // Search Console and Bing Webmaster Tools ownership tags, emitted only when
  // set. A DNS TXT record on rwaft.live verifies just as well without these.
  verification: {
    google: googleVerification || undefined,
    other: bingVerification ? { "msvalidate.01": bingVerification } : undefined,
  },
  category: "technology",
  formatDetection: { telephone: false, email: false, address: false },
};

/**
 * Structured data. WebSite is what Google reads for the site name shown above
 * a result; Organization ties the logo and the source repository to it. No
 * ratings, reviews or usage figures: none exist, and none may be invented.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      // The same account the footer shows.
      sameAs: [CONTACT_URL],
    },
  ],
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
        <script
          type="application/ld+json"
          // `<` is escaped so no string in the payload can close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
        />
        {children}
      </body>
    </html>
  );
}
