"use server";

import { getDb } from "../../lib/db";
import { validateUsername, isUsernameTaken, type D1DatabaseLike } from "../../lib/username";

export interface AuthActionResult {
  success?: boolean;
  error?: string;
  fieldErrors?: {
    username?: string;
    email?: string;
    password?: string;
  };
}

/**
 * Lightweight server action for debounced username availability checks.
 * Server-side validation remains strictly authoritative.
 */
export async function checkUsernameAvailable(
  rawUsername: string,
  dbOverride?: D1DatabaseLike
): Promise<{ available: boolean; error?: string }> {
  const validation = validateUsername(rawUsername);
  if (!validation.ok) {
    return { available: false, error: validation.error };
  }

  try {
    const db = dbOverride || getDb();
    const taken = await isUsernameTaken(db, validation.value);
    if (taken) {
      return { available: false, error: "Username already taken." };
    }
    return { available: true };
  } catch (err) {
    console.error("Failed to check username availability:", err);
    return { available: false, error: "Failed to verify username availability." };
  }
}

/**
 * Signs up a new user with email, chosen username, and password.
 * Includes server-side validation, case-insensitive uniqueness check,
 * and race condition protection on unique index insert.
 */
export async function signupWithPassword(
  formData: FormData,
  dbOverride?: D1DatabaseLike
): Promise<AuthActionResult> {
  const usernameRaw = formData.get("username");
  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");

  // 1. Username validation
  const usernameValidation = validateUsername(usernameRaw);
  if (!usernameValidation.ok) {
    return {
      error: usernameValidation.error,
      fieldErrors: { username: usernameValidation.error },
    };
  }
  const username = usernameValidation.value;

  // 2. Email validation
  if (typeof emailRaw !== "string" || !emailRaw.includes("@")) {
    return {
      error: "Please enter a valid email address.",
      fieldErrors: { email: "Invalid email address." },
    };
  }
  const email = emailRaw.trim().toLowerCase();

  // 3. Password validation
  if (typeof passwordRaw !== "string" || passwordRaw.length < 8) {
    return {
      error: "Password must be at least 8 characters long.",
      fieldErrors: { password: "Password must be at least 8 characters long." },
    };
  }
  const password = passwordRaw;

  const db = dbOverride || getDb();

  // 4. Pre-check username uniqueness (case-insensitive)
  const usernameTaken = await isUsernameTaken(db, username);
  if (usernameTaken) {
    return {
      error: "Username already taken",
      fieldErrors: { username: "Username already taken" },
    };
  }

  // 5. Pre-check email uniqueness
  const existingEmailUser = await db
    .prepare("SELECT id FROM user WHERE email = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();

  if (existingEmailUser) {
    return {
      error: "An account with this email already exists.",
      fieldErrors: { email: "An account with this email already exists." },
    };
  }

  // 6. Generate ID and hash password
  const userId = crypto.randomUUID();
  const createdAt = Date.now();
  // Simple hash for SQLite/Workers using Web Crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "ossdrop-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const passwordHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // 7. Insert user row; handle race conditions on concurrent signups
  try {
    await db
      .prepare(
        `INSERT INTO user (id, name, email, password_hash, username, created_at, username_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(userId, username, email, passwordHash, username, createdAt)
      .run();

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // SQLite / D1 unique constraint violation on username index (idx_user_username_nocase)
    if (
      errorMsg.includes("idx_user_username_nocase") ||
      (errorMsg.includes("UNIQUE constraint failed") && errorMsg.includes("username"))
    ) {
      return {
        error: "Username already taken",
        fieldErrors: { username: "Username already taken" },
      };
    }

    if (
      errorMsg.includes("idx_user_email") ||
      (errorMsg.includes("UNIQUE constraint failed") && errorMsg.includes("email"))
    ) {
      return {
        error: "An account with this email already exists.",
        fieldErrors: { email: "An account with this email already exists." },
      };
    }

    console.error("Failed to insert user on credentials signup:", err);
    return { error: "An unexpected error occurred during signup. Please try again." };
  }
}

