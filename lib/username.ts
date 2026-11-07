/**
 * Username validation, sanitization, and fallback utilities.
 * 
 * ASCII ONLY POLICY:
 * Usernames are strictly restricted to ASCII alphanumeric characters, hyphens, and underscores.
 * Unicode, emoji, and Right-to-Left (RTL) characters are intentionally rejected to prevent:
 * 1. Homoglyph / visually confusable spoofing attacks (e.g. Cyrillic 'a' vs Latin 'a').
 * 2. URL routing and Punycode discrepancies across HTTP clients, edge proxies, and Web standards.
 * 3. Bidirectional text override exploits in UI and notification components.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_COOLDOWN_DAYS = 30;
export const USERNAME_COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;

/**
 * Top-level application routes and sensitive system identifiers.
 * Handled case-insensitively to avoid conflicts with URL paths (e.g. /settings, /api, /u).
 */
export const RESERVED_USERNAMES = new Set<string>([
  "admin",
  "administrator",
  "api",
  "settings",
  "submit",
  "tools",
  "forum",
  "blog",
  "about",
  "signin",
  "signup",
  "u",
  "user",
  "users",
  "login",
  "logout",
  "auth",
  "static",
  "assets",
  "_next",
  "www",
  "support",
  "help",
  "root",
  "dashboard",
  "notifications",
  "explore",
  "trending",
  "categories",
  "privacy",
  "terms",
  "legal",
  "faq",
  "status",
  "health",
  "public",
  "app",
  "ossdrop",
]);

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validates a user-supplied username string.
 * Strips leading/trailing whitespace.
 */
export function validateUsername(raw: unknown): ValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Username must be a string." };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "Username is required." };
  }

  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }

  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Username cannot exceed ${USERNAME_MAX_LENGTH} characters.`,
    };
  }

  if (!USERNAME_RE.test(trimmed)) {
    return {
      ok: false,
      error:
        "Username can only contain ASCII letters, numbers, hyphens (-), and underscores (_). Spaces and special characters are not allowed.",
    };
  }

  if (RESERVED_USERNAMES.has(trimmed.toLowerCase())) {
    return {
      ok: false,
      error: `"${trimmed}" is a reserved system name and cannot be used as a username.`,
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * Minimal D1 database interface for testability and portability.
 */
export interface D1DatabaseLike {
  prepare(query: string): {
    bind(...args: unknown[]): {
      first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      run(): Promise<{ success: boolean; meta?: unknown }>;
    };
  };
}

/**
 * Checks if a username is already taken in the D1 database (case-insensitive).
 * Optionally excludes a specific user ID (useful when a user updates their own profile).
 */
export async function isUsernameTaken(
  db: D1DatabaseLike,
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  const normalized = username.trim();
  if (!normalized) return false;

  if (excludeUserId) {
    const res = await db
      .prepare(
        "SELECT id FROM user WHERE username = ? COLLATE NOCASE AND id != ? LIMIT 1"
      )
      .bind(normalized, excludeUserId)
      .first<{ id: string }>();
    return Boolean(res);
  }

  const res = await db
    .prepare("SELECT id FROM user WHERE username = ? COLLATE NOCASE LIMIT 1")
    .bind(normalized)
    .first<{ id: string }>();

  return Boolean(res);
}

/**
 * Generates a clean, valid username slug from an arbitrary base string
 * (e.g., OAuth profile name, GitHub login, or email prefix).
 *
 * Rules:
 * - Replaces dots, spaces, pluses with hyphens.
 * - Strips all non-[a-zA-Z0-9_-] characters.
 * - Truncates consecutive hyphens/underscores.
 * - Ensures minimum length of 3 (pads with 'user' or numeric suffix if too short).
 * - Truncates to max 24 chars.
 * - Prefixes reserved names (e.g. 'admin' -> 'user-admin').
 */
export function slugifyFallback(base: string): string {
  if (!base || typeof base !== "string") {
    return "user-" + Math.floor(1000 + Math.random() * 9000);
  }

  // 1. Replace email domain if present, replace common separators
  let cleaned = base.split("@")[0]
    .replace(/[.+ ]+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");

  // 2. Remove leading/trailing hyphens or underscores
  cleaned = cleaned.replace(/^[-_]+|[-_]+$/g, "");

  // 3. Fallback if empty after stripping
  if (!cleaned) {
    cleaned = "user";
  }

  // 4. If reserved, prefix with 'u-' or 'user-'
  if (RESERVED_USERNAMES.has(cleaned.toLowerCase())) {
    cleaned = `user-${cleaned}`;
  }

  // 5. Ensure minimum length of 3
  while (cleaned.length < USERNAME_MIN_LENGTH) {
    cleaned = `${cleaned}0`;
  }

  // 6. Ensure maximum length of 24
  if (cleaned.length > USERNAME_MAX_LENGTH) {
    cleaned = cleaned.slice(0, USERNAME_MAX_LENGTH);
  }

  return cleaned;
}

/**
 * Finds an available username using slugifyFallback and appending numeric suffixes if taken.
 */
export async function generateAvailableUsername(
  db: D1DatabaseLike,
  base: string
): Promise<string> {
  const baseSlug = slugifyFallback(base);
  const taken = await isUsernameTaken(db, baseSlug);
  if (!taken) {
    return baseSlug;
  }

  // Append numeric suffix (up to 100 attempts, then random)
  for (let i = 1; i <= 100; i++) {
    const suffix = `-${i}`;
    const truncatedBase = baseSlug.slice(0, USERNAME_MAX_LENGTH - suffix.length);
    const candidate = `${truncatedBase}${suffix}`;
    if (!(await isUsernameTaken(db, candidate))) {
      return candidate;
    }
  }

  const randomSuffix = `-${Math.floor(1000 + Math.random() * 9000)}`;
  return `${baseSlug.slice(0, USERNAME_MAX_LENGTH - randomSuffix.length)}${randomSuffix}`;
}

