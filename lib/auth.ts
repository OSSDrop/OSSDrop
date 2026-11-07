import { getDb } from "./db";
import { generateAvailableUsername, type D1DatabaseLike } from "./username";

export interface OAuthUserProfile {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  // GitHub returns login, Google returns email
  login?: string;
}

/**
 * Derives a valid, unique, non-reserved username for incoming OAuth users (GitHub / Google).
 * Never mutates or renames an existing user who already has a handle.
 */
export async function deriveOAuthUsername(
  profile: OAuthUserProfile,
  dbOverride?: D1DatabaseLike
): Promise<string> {
  const db = dbOverride || getDb();

  // Prefer GitHub login handle, fallback to email prefix, or user name
  const candidateBase =
    profile.login ||
    (profile.email ? profile.email.split("@")[0] : null) ||
    profile.name ||
    "user";

  // Slugify, pad/truncate, ensure non-reserved, and resolve collision with numeric suffix
  return await generateAvailableUsername(db, candidateBase);
}

/**
 * Example Auth.js (NextAuth v5) configuration callbacks for GitHub & Google providers.
 */
export const authCallbacks = {
  async signIn({ user, profile, account }: { user: { id?: string; email?: string | null; name?: string | null }; profile?: OAuthUserProfile; account?: { provider: string } }) {
    if (!user.email) return false;

    // TODO: Optional first-login interstitial flow:
    // If we want users to manually pick their handle on first OAuth signup,
    // we could set a session flag (e.g. requiresUsernameSetup: true) and redirect to /onboarding/username.
    // For now, derive seamlessly so OAuth sign-in is not blocked; users can edit in /settings.

    const db = getDb();

    // Check if user already exists
    const existing = await db
      .prepare("SELECT id, username FROM user WHERE email = ? LIMIT 1")
      .bind(user.email.toLowerCase())
      .first<{ id: string; username: string }>();

    if (existing) {
      // Existing user: NEVER rename existing users' handles!
      return true;
    }

    // New OAuth user: derive unique sanitized username
    const chosenUsername = await deriveOAuthUsername(profile || { email: user.email, name: user.name });

    const userId = user.id || crypto.randomUUID();
    const createdAt = Date.now();

    await db
      .prepare(
        `INSERT INTO user (id, name, email, username, image, created_at, username_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        userId,
        user.name || chosenUsername,
        user.email.toLowerCase(),
        chosenUsername,
        profile?.image || null,
        createdAt
      )
      .run();

    return true;
  },
};

