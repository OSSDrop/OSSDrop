import type { D1DatabaseLike } from "./username";

declare global {
  // eslint-disable-next-line no-var
  var DB: D1DatabaseLike | undefined;
}

/**
 * Access the Cloudflare D1 database binding.
 * Compatible with OpenNext, Cloudflare Pages/Workers, and local testing environments.
 */
export function getDb(): D1DatabaseLike {
  // 1. Cloudflare Workers / OpenNext context
  const procEnv = typeof process !== "undefined" ? (process.env as Record<string, unknown>) : null;
  if (procEnv?.DB) {
    return procEnv.DB as D1DatabaseLike;
  }

  // 2. Global DB binding in Workers
  if (typeof globalThis !== "undefined" && globalThis.DB) {
    return globalThis.DB;
  }

  throw new Error("D1 Database binding (env.DB) is not configured.");
}
