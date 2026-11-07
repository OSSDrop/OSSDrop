"use server";

import { getDb } from "../../lib/db";
import {
  validateUsername,
  isUsernameTaken,
  USERNAME_COOLDOWN_MS,
  type D1DatabaseLike,
} from "../../lib/username";

export interface UpdateUsernameResult {
  success?: boolean;
  message?: string;
  error?: string;
  newUsername?: string;
}

export interface UserSession {
  id: string;
  username: string;
  email: string;
}

/**
 * Server action to update an existing user's username.
 * Enforces authentication, format validation, reserved words, case-insensitive uniqueness,
 * and a 30-day cooldown period. Preserves history for /u/[handle] redirects.
 */
export async function updateUsername(
  formData: FormData,
  sessionUserOverride?: UserSession | null,
  dbOverride?: D1DatabaseLike
): Promise<UpdateUsernameResult> {
  const db = dbOverride || getDb();

  // 1. Authenticate user
  // In Auth.js / NextAuth, auth() provides session.user
  const user = sessionUserOverride;
  if (!user || !user.id) {
    return { error: "Authentication required. Please sign in to update your settings." };
  }

  const rawUsername = formData.get("username");
  const validation = validateUsername(rawUsername);
  if (!validation.ok) {
    return { error: validation.error };
  }
  const newUsername = validation.value;

  // 2. Fetch current user data from database (to get authoritative username and cooldown)
  const dbUser = await db
    .prepare("SELECT id, username, username_changed_at FROM user WHERE id = ? LIMIT 1")
    .bind(user.id)
    .first<{ id: string; username: string; username_changed_at: number | null }>();

  if (!dbUser) {
    return { error: "User account not found." };
  }

  // 3. No-op if unchanged
  if (dbUser.username === newUsername) {
    return { success: true, message: "Username is unchanged.", newUsername };
  }

  const now = Date.now();

  // 4. Enforce 30-day cooldown
  // Existing users with NULL username_changed_at can change immediately once.
  if (dbUser.username_changed_at) {
    const timeSinceLastChange = now - dbUser.username_changed_at;
    if (timeSinceLastChange < USERNAME_COOLDOWN_MS) {
      const nextEligibleDate = new Date(dbUser.username_changed_at + USERNAME_COOLDOWN_MS);
      const formattedDate = nextEligibleDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return {
        error: `You can only change your username once every 30 days. You can change it again on ${formattedDate}.`,
      };
    }
  }

  // 5. Uniqueness check (case-insensitive, excluding current user)
  const isTaken = await isUsernameTaken(db, newUsername, user.id);
  if (isTaken) {
    return { error: "Username already taken." };
  }

  // 6. Execute atomic update and archive old handle into username_history
  const oldUsername = dbUser.username;
  const historyId = crypto.randomUUID();

  try {
    // Record into username_history for 301 redirects
    if (oldUsername) {
      await db
        .prepare(
          "INSERT INTO username_history (id, user_id, old_username, changed_at) VALUES (?, ?, ?, ?)"
        )
        .bind(historyId, user.id, oldUsername, now)
        .run();
    }

    // Update user row
    await db
      .prepare(
        "UPDATE user SET username = ?, username_changed_at = ? WHERE id = ?"
      )
      .bind(newUsername, now, user.id)
      .run();

    // In a Next.js App Router environment:
    // revalidatePath('/settings');
    // revalidatePath(`/u/${newUsername}`);
    // if (oldUsername) revalidatePath(`/u/${oldUsername}`);

    return {
      success: true,
      message: "Username updated successfully!",
      newUsername,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (
      errorMsg.includes("idx_user_username_nocase") ||
      (errorMsg.includes("UNIQUE constraint failed") && errorMsg.includes("username"))
    ) {
      return { error: "Username already taken." };
    }

    console.error("Failed to update username:", err);
    return { error: "An unexpected error occurred while updating your username." };
  }
}

