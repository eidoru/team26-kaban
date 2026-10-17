import { MAX_PROOF_BYTES } from "@domain/constants";
import { api } from "../api/client";
import { getSupabaseStorageClient } from "./supabaseClient";

const MAX_EDGE = 1600;

/**
 * Phone photos are often 3–10 MB. Re-encode to a JPEG no larger than 1600px on its long edge, which
 * keeps a receipt or GCash screenshot readable at a fraction of the size. Falls back to the original
 * when the browser can't decode it (HEIC outside Safari).
 */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Why this file can't be a proof, or null. */
export function proofFileError(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Choose a photo or screenshot.";
  return null;
}

/** Upload a proof photo and return its path for the submission (R-SUB-01, R-DEC-08). */
export async function uploadProof(groupId: string, file: File): Promise<string> {
  const blob = await shrink(file);
  if (blob.size > MAX_PROOF_BYTES) {
    throw new Error(`That photo is too big. Use one under ${Math.round(MAX_PROOF_BYTES / 1024 / 1024)} MB.`);
  }
  const contentType = blob.type || file.type;
  const { path, token } = await api.requestProofUpload(groupId, contentType);
  const { error } = await getSupabaseStorageClient()
    .storage.from("payment-proofs")
    .uploadToSignedUrl(path, token, blob, { contentType });
  if (error) throw new Error("The photo didn't upload. Check your connection and try again.");
  return path;
}
