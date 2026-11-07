import { notFound, redirect } from "next/navigation";
import { getDb } from "../../../lib/db";
import type { D1DatabaseLike } from "../../../lib/username";

interface ProfilePageProps {
  params: {
    handle: string;
  };
}

/**
 * Public profile route: /u/[handle]
 * 
 * Lookups are performed case-insensitively using SQLite `COLLATE NOCASE`.
 * If a handle was previously changed, checks `username_history` and issues
 * a 301 redirect to the active username.
 */
export async function resolveUserOrRedirect(handle: string, dbOverride?: D1DatabaseLike) {
  const db = dbOverride || getDb();
  const normalizedHandle = handle.trim();

  // 1. Case-insensitive active user lookup
  const user = await db
    .prepare("SELECT id, name, username, image, created_at FROM user WHERE username = ? COLLATE NOCASE LIMIT 1")
    .bind(normalizedHandle)
    .first<{ id: string; name: string; username: string; image: string | null; created_at: number }>();

  if (user) {
    return { type: "found" as const, user };
  }

  // 2. Check username_history for previous handles (301 permanent redirect)
  const historyRecord = await db
    .prepare(
      `SELECT uh.old_username, u.username as current_username
       FROM username_history uh
       JOIN user u ON u.id = uh.user_id
       WHERE uh.old_username = ? COLLATE NOCASE
       ORDER BY uh.changed_at DESC
       LIMIT 1`
    )
    .bind(normalizedHandle)
    .first<{ old_username: string; current_username: string }>();

  if (historyRecord && historyRecord.current_username) {
    return { type: "redirect" as const, targetHandle: historyRecord.current_username };
  }

  return { type: "not_found" as const };
}

export default async function UserProfilePage({ params }: ProfilePageProps) {
  const result = await resolveUserOrRedirect(params.handle);

  if (result.type === "redirect") {
    redirect(`/u/${result.targetHandle}`);
  }

  if (result.type !== "found") {
    notFound();
    return null;
  }

  const { user } = result;

  return (
    <main className="min-h-screen py-12 px-4 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xl font-bold text-blue-600 dark:text-blue-400">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.name || user.username}</h1>
            <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400">@{user.username}</p>
          </div>
        </div>
        <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-500">
          Member since {new Date(user.created_at).toLocaleDateString()}
        </div>
      </div>
    </main>
  );
}
