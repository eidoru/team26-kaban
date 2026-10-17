import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "./errors.js";

/** R-DEC-08: private bucket, created by migration 20261017000000_payment_proofs. */
export const PROOF_BUCKET = "payment-proofs";
/** How long a link to view a proof stays valid. */
const VIEW_SECONDS = 60 * 60;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const PROOF_CONTENT_TYPES = Object.keys(EXTENSIONS);

let client: SupabaseClient | null = null;

/** Server-side Storage access with the secret key. Browsers never touch the bucket directly. */
function storage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new AppError(503, "Proof uploads aren't set up on this server.", "STORAGE_OFF");
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client.storage.from(PROOF_BUCKET);
}

/** Proofs live under their group's folder, so a path can be checked against the group it's used in. */
export function isProofPathFor(groupId: string, path: string): boolean {
  return new RegExp(`^${groupId}/[0-9a-f-]{36}\\.(jpg|png|webp|heic|heif)$`).test(path);
}

/** A one-time upload slot for one image. The browser uploads straight to Storage with the token. */
export async function createProofUpload(groupId: string, contentType: string) {
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new AppError(400, "Proof must be a photo (JPEG, PNG, WebP or HEIC).", "BAD_PROOF_TYPE");
  const path = `${groupId}/${randomUUID()}.${ext}`;
  const { data, error } = await storage().createSignedUploadUrl(path);
  if (error || !data) throw new AppError(502, "Couldn't prepare the upload. Try again.", "STORAGE_ERROR");
  return { path, token: data.token };
}

/** Whether an upload actually landed, so a submission never points at nothing. */
export async function proofExists(path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await storage().list(folder, { search: name, limit: 1 });
  return !!data?.some((file) => file.name === name);
}

/** Short-lived links to view proofs, keyed by path. Paths that fail are left out. */
export async function proofViewUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();
  const { data } = await storage().createSignedUrls(unique, VIEW_SECONDS);
  const urls = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return urls;
}
