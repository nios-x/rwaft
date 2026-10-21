import { ImageResponse } from "next/og";
import { SITE_URL } from "../lib/site";

export const alt = "rwaft: describe an app in plain words, watch the real build, get a live link";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = ["Describe an app.", "Get a live link."];
const SUB = "rwaft writes it, builds it and hosts it, and you watch the real build happen.";
const HOST = new URL(SITE_URL).host;

/**
 * Fetches a static TTF subset of a Google font (satori cannot read woff2).
 * The image is rendered once at build time; if the fetch fails the card falls
 * back to the bundled default face rather than failing the deploy.
 */
async function googleFont(family: string, weight: number, text: string) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`,
      { cache: "force-cache" }
    ).then((response) => response.text());
    const source = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!source) return null;
    const data = await fetch(source, { cache: "force-cache" }).then((response) => response.arrayBuffer());
    return { name: family, data, weight: weight as 400 | 700, style: "normal" as const };
  } catch {
    return null;
  }
}

export default async function Image() {
  const fonts = (await Promise.all([
    googleFont("Bricolage Grotesque", 700, `rwaft${HEADLINE.join("")}`),
    googleFont("Geist", 400, `${SUB}${HOST}`),
  ])).filter((font) => font !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#030305",
          // A still of the Home backdrop: blue-to-violet light over the near-black canvas.
          backgroundImage:
            "radial-gradient(ellipse 70% 90% at 92% 8%, rgba(91, 52, 240, 0.55), transparent 60%), radial-gradient(ellipse 60% 70% at 70% 110%, rgba(59, 130, 246, 0.35), transparent 60%)",
          color: "#fafafa",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 28 28">
            <rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="#fafafa" />
            <g stroke="#030305" strokeWidth="2.1" strokeLinecap="round">
              <path d="M6.6 9.6h6.4" />
              <path d="M6.6 14h8.9" />
              <path d="M6.6 18.4h5.4" />
            </g>
            <circle cx="19.7" cy="14" r="2.6" fill="#8b72ff" />
          </svg>
          <span style={{ fontFamily: "Bricolage Grotesque", fontSize: 48, fontWeight: 700, letterSpacing: "-0.02em" }}>rwaft</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Bricolage Grotesque", fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em" }}>
            {HEADLINE.map((line) => <span key={line}>{line}</span>)}
          </div>
          <span style={{ fontSize: 32, lineHeight: 1.35, color: "#a8a8b2", maxWidth: 860 }}>{SUB}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#b9a9ff" }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "#22c55e" }} />
          {HOST}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined }
  );
}
