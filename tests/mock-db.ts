import type { D1DatabaseLike } from "../lib/username";

export interface MockUserRecord {
  id: string;
  name: string;
  email: string;
  password_hash?: string;
  username: string;
  created_at: number;
  username_changed_at: number | null;
}

export interface MockHistoryRecord {
  id: string;
  user_id: string;
  old_username: string;
  changed_at: number;
}

export function createMockD1Database(
  initialUsers: MockUserRecord[] = [],
  initialHistory: MockHistoryRecord[] = []
): D1DatabaseLike & { users: MockUserRecord[]; history: MockHistoryRecord[] } {
  const users: MockUserRecord[] = [...initialUsers];
  const history: MockHistoryRecord[] = [...initialHistory];

  return {
    users,
    history,
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T = Record<string, unknown>>(): Promise<T | null> {
              // 1. SELECT id FROM user WHERE username = ? COLLATE NOCASE AND id != ? LIMIT 1
              if (
                query.includes("FROM user WHERE username = ? COLLATE NOCASE AND id != ?")
              ) {
                const [targetUsername, excludeId] = args as [string, string];
                const found = users.find(
                  (u) =>
                    u.username.toLowerCase() === targetUsername.toLowerCase() &&
                    u.id !== excludeId
                );
                return (found ? ({ id: found.id } as unknown as T) : null);
              }

              // 2. SELECT id FROM user WHERE username = ? COLLATE NOCASE LIMIT 1
              if (query.includes("FROM user WHERE username = ? COLLATE NOCASE LIMIT 1")) {
                const [targetUsername] = args as [string];
                const found = users.find(
                  (u) => u.username.toLowerCase() === targetUsername.toLowerCase()
                );
                return (found ? ({ id: found.id } as unknown as T) : null);
              }

              // 3. SELECT id FROM user WHERE email = ? LIMIT 1
              if (query.includes("FROM user WHERE email = ?")) {
                const [targetEmail] = args as [string];
                const found = users.find(
                  (u) => u.email.toLowerCase() === targetEmail.toLowerCase()
                );
                return (found ? ({ id: found.id } as unknown as T) : null);
              }

              // 4. SELECT id, username, username_changed_at FROM user WHERE id = ?
              if (query.includes("FROM user WHERE id = ?")) {
                const [targetId] = args as [string];
                const found = users.find((u) => u.id === targetId);
                return (found
                  ? ({
                      id: found.id,
                      username: found.username,
                      username_changed_at: found.username_changed_at,
                    } as unknown as T)
                  : null);
              }

              // 5. Check username_history
              if (query.includes("FROM username_history")) {
                const [targetHandle] = args as [string];
                const hist = history.find(
                  (h) => h.old_username.toLowerCase() === targetHandle.toLowerCase()
                );
                if (hist) {
                  const user = users.find((u) => u.id === hist.user_id);
                  if (user) {
                    return ({
                      old_username: hist.old_username,
                      current_username: user.username,
                    } as unknown as T);
                  }
                }
                return null;
              }

              return null;
            },

            async all<T = Record<string, unknown>>(): Promise<{ results?: T[] }> {
              return { results: [] };
            },

            async run(): Promise<{ success: boolean }> {
              // 1. INSERT INTO username_history
              if (query.includes("INSERT INTO username_history")) {
                const [id, userId, oldUsername, changedAt] = args as [
                  string,
                  string,
                  string,
                  number
                ];
                history.push({
                  id,
                  user_id: userId,
                  old_username: oldUsername,
                  changed_at: changedAt,
                });
                return { success: true };
              }

              // 2. INSERT INTO user
              if (query.includes("INSERT INTO user (")) {
                const [id, name, email, passwordHash, username, createdAt] = args as [
                  string,
                  string,
                  string,
                  string,
                  string,
                  number
                ];

                // Simulate UNIQUE constraint on username (COLLATE NOCASE)
                const usernameExists = users.some(
                  (u) => Boolean(u.username) && u.username.toLowerCase() === username.toLowerCase()
                );
                if (usernameExists) {
                  throw new Error(
                    "D1_ERROR: UNIQUE constraint failed: idx_user_username_nocase"
                  );
                }

                // Simulate UNIQUE constraint on email
                const emailExists = users.some(
                  (u) => Boolean(u.email) && u.email.toLowerCase() === email.toLowerCase()
                );
                if (emailExists) {
                  throw new Error(
                    "D1_ERROR: UNIQUE constraint failed: idx_user_email"
                  );
                }

                users.push({
                  id,
                  name,
                  email,
                  password_hash: passwordHash,
                  username,
                  created_at: createdAt,
                  username_changed_at: null,
                });

                return { success: true };
              }

              // 3. UPDATE user SET username = ?, username_changed_at = ? WHERE id = ?
              if (query.trim().startsWith("UPDATE user SET username = ?")) {
                const [newUsername, changedAt, userId] = args as [
                  string,
                  number,
                  string
                ];

                // Check unique constraint excluding self
                const collision = users.some(
                  (u) =>
                    Boolean(u.username) &&
                    Boolean(newUsername) &&
                    u.username.toLowerCase() === newUsername.toLowerCase() &&
                    u.id !== userId
                );
                if (collision) {
                  throw new Error(
                    "D1_ERROR: UNIQUE constraint failed: idx_user_username_nocase"
                  );
                }

                const user = users.find((u) => u.id === userId);
                if (user) {
                  user.username = newUsername;
                  user.username_changed_at = changedAt;
                }
                return { success: true };
              }

              return { success: true };
            },
          };
        },
      };
    },
  };
}
