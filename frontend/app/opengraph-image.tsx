import { SHARE_SIZE, SHARE_TYPE, shareCard } from "./_components/ShareCard";

export const alt = "rwaft: describe an app in plain words, watch the real build, get a live link";
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareCard(
    ["Describe an app.", "Get a live link."],
    "rwaft writes it, builds it and hosts it, and you watch the real build happen."
  );
}
