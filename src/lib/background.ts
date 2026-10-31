import { after } from "next/server";
import { log } from "@/lib/log";

/**
 * Runs work after the response has been sent (Vercel `waitUntil` semantics
 * through Next's `after`). Falls back to fire-and-forget outside a request.
 */
export function runInBackground(name: string, task: () => Promise<unknown>): void {
  if (process.env.LIELU_DISABLE_BACKGROUND === "1") return;
  const wrapped = async () => {
    try {
      await task();
    } catch (err) {
      log.error("background.failed", { name, err });
    }
  };
  try {
    after(wrapped);
  } catch {
    void wrapped();
  }
}
