import { waitUntil } from "@vercel/functions";

/**
 * Finish work after the response is sent, without making the user wait for it. On Vercel,
 * waitUntil keeps the function alive until the task settles (an un-awaited promise would otherwise
 * be frozen mid-flight and silently lost). Elsewhere it's a no-op and the task just runs.
 */
export function runAfterResponse(label: string, task: Promise<unknown>): void {
  waitUntil(
    task.catch((err) => {
      console.error(`Background task failed (${label})`, err);
    }),
  );
}
