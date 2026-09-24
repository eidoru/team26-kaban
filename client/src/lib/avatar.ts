// Full literal class strings so Tailwind's scanner picks every pair up.
const TONES = [
  "bg-lime-100 text-lime-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-indigo-100 text-indigo-800",
] as const;

/** Stable per-name color so the same person or group always gets the same tone. */
export function avatarTone(seed: string | null | undefined): string {
  const text = (seed ?? "").trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}
