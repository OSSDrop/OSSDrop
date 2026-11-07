import { describe, it, expect } from "vitest";
import {
  validateUsername,
  slugifyFallback,
  generateAvailableUsername,
  USERNAME_COOLDOWN_MS,
} from "../lib/username";
import { signupWithPassword } from "../app/actions/auth";
import { updateUsername } from "../app/actions/settings";
import { createMockD1Database } from "./mock-db";

describe("lib/username.ts: validateUsername", () => {
  it("accepts valid usernames", () => {
    expect(validateUsername("jane-doe")).toEqual({ ok: true, value: "jane-doe" });
    expect(validateUsername("cool_user1")).toEqual({ ok: true, value: "cool_user1" });
    expect(validateUsername("RedoSan")).toEqual({ ok: true, value: "RedoSan" });
    expect(validateUsername("dev-123_abc")).toEqual({ ok: true, value: "dev-123_abc" });
  });

  it("trims leading and trailing whitespace", () => {
    expect(validateUsername("   RedoSan   ")).toEqual({ ok: true, value: "RedoSan" });
  });

  it("rejects usernames that are too short (< 3 chars)", () => {
    const res = validateUsername("ab");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/at least 3 characters/i);
  });

  it("rejects usernames that are too long (> 24 chars)", () => {
    const res = validateUsername("a".repeat(25));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cannot exceed 24 characters/i);
  });

  it("rejects internal spaces and illegal characters", () => {
    expect(validateUsername("user name").ok).toBe(false);
    expect(validateUsername("user@name").ok).toBe(false);
    expect(validateUsername("user.name").ok).toBe(false);
    expect(validateUsername("user$name").ok).toBe(false);
  });

  it("rejects unicode, emojis, and non-ASCII characters", () => {
    expect(validateUsername("user🎉").ok).toBe(false);
    expect(validateUsername("üser").ok).toBe(false);
    expect(validateUsername("محمد").ok).toBe(false);
  });

  it("rejects reserved system words (case-insensitive)", () => {
    expect(validateUsername("admin").ok).toBe(false);
    expect(validateUsername("Admin").ok).toBe(false);
    expect(validateUsername("SETTINGS").ok).toBe(false);
    expect(validateUsername("api").ok).toBe(false);
    expect(validateUsername("signup").ok).toBe(false);
    expect(validateUsername("signin").ok).toBe(false);
    expect(validateUsername("u").ok).toBe(false);
    expect(validateUsername("_next").ok).toBe(false);
  });
});

describe("lib/username.ts: slugifyFallback", () => {
  it("strips invalid characters and retains alphanumeric, dash, and underscore", () => {
    expect(slugifyFallback("john.doe@example.com")).toBe("john-doe");
    expect(slugifyFallback("alice+marketing@test.com")).toBe("alice-marketing");
  });

  it("pads strings that are shorter than 3 characters", () => {
    const padded = slugifyFallback("a");
    expect(padded.length).toBeGreaterThanOrEqual(3);
    expect(validateUsername(padded).ok).toBe(true);
  });

  it("truncates strings longer than 24 characters", () => {
    const long = "very-long-oauth-username-from-provider-123456";
    const slug = slugifyFallback(long);
    expect(slug.length).toBeLessThanOrEqual(24);
  });

  it("prefixes reserved words so they do not collide", () => {
    const slug = slugifyFallback("admin");
    expect(slug).toBe("user-admin");
    expect(validateUsername(slug).ok).toBe(true);
  });

  it("appends numeric suffixes when candidate username is already taken", async () => {
    const db = createMockD1Database([
      {
        id: "u1",
        name: "Jane",
        email: "jane@example.com",
        username: "jane-doe",
        created_at: 1000,
        username_changed_at: null,
      },
    ]);

    const generated = await generateAvailableUsername(db, "jane.doe@example.com");
    expect(generated).toBe("jane-doe-1");
  });
});

describe("app/actions/auth.ts: signupWithPassword", () => {
  it("successfully registers a user with valid chosen username", async () => {
    const db = createMockD1Database();
    const formData = new FormData();
    formData.append("username", "RedoSan");
    formData.append("email", "redosan@example.com");
    formData.append("password", "strongpassword123");

    const result = await signupWithPassword(formData, db);
    expect(result.success).toBe(true);
    expect(db.users).toHaveLength(1);
    expect(db.users[0].username).toBe("RedoSan");
    expect(db.users[0].username_changed_at).toBeNull();
  });

  it("rejects invalid username format on signup", async () => {
    const db = createMockD1Database();
    const formData = new FormData();
    formData.append("username", "bad username!");
    formData.append("email", "test@example.com");
    formData.append("password", "strongpassword123");

    const result = await signupWithPassword(formData, db);
    expect(result.error).toBeDefined();
    expect(result.fieldErrors?.username).toBeDefined();
  });

  it("rejects reserved username on signup", async () => {
    const db = createMockD1Database();
    const formData = new FormData();
    formData.append("username", "admin");
    formData.append("email", "admin@example.com");
    formData.append("password", "strongpassword123");

    const result = await signupWithPassword(formData, db);
    expect(result.error).toMatch(/reserved/i);
    expect(result.fieldErrors?.username).toBeDefined();
  });

  it("rejects duplicate username (case-insensitive RedoSan vs redosan)", async () => {
    const db = createMockD1Database([
      {
        id: "u1",
        name: "Existing",
        email: "existing@example.com",
        username: "RedoSan",
        created_at: 1000,
        username_changed_at: null,
      },
    ]);

    const formData = new FormData();
    formData.append("username", "redosan"); // lowercase collision
    formData.append("email", "newuser@example.com");
    formData.append("password", "strongpassword123");

    const result = await signupWithPassword(formData, db);
    expect(result.error).toBe("Username already taken");
  });
});

describe("app/actions/settings.ts: updateUsername", () => {
  it("allows user to change username successfully if never changed before (NULL changed_at)", async () => {
    const db = createMockD1Database([
      {
        id: "u_initial",
        name: "Old User",
        email: "old@example.com",
        username: "raaedpc2009",
        created_at: 1000,
        username_changed_at: null, // Existing legacy user
      },
    ]);

    const formData = new FormData();
    formData.append("username", "RedoSan");

    const sessionUser = {
      id: "u_initial",
      username: "raaedpc2009",
      email: "old@example.com",
    };

    const result = await updateUsername(formData, sessionUser, db);
    expect(result.success).toBe(true);
    expect(result.newUsername).toBe("RedoSan");

    // Verified in DB
    const updated = db.users.find((u) => u.id === "u_initial");
    expect(updated?.username).toBe("RedoSan");
    expect(updated?.username_changed_at).toBeGreaterThan(0);

    // Old username logged to history for 301 redirects
    expect(db.history).toHaveLength(1);
    expect(db.history[0].old_username).toBe("raaedpc2009");
  });

  it("returns no-op success when username is unchanged", async () => {
    const db = createMockD1Database([
      {
        id: "u1",
        name: "Jane",
        email: "jane@example.com",
        username: "jane-doe",
        created_at: 1000,
        username_changed_at: Date.now(),
      },
    ]);

    const formData = new FormData();
    formData.append("username", "jane-doe");

    const sessionUser = {
      id: "u1",
      username: "jane-doe",
      email: "jane@example.com",
    };

    const result = await updateUsername(formData, sessionUser, db);
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/unchanged/i);
  });

  it("enforces 30-day cooldown period", async () => {
    const changed10DaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    const db = createMockD1Database([
      {
        id: "u1",
        name: "Jane",
        email: "jane@example.com",
        username: "jane-temp",
        created_at: 1000,
        username_changed_at: changed10DaysAgo,
      },
    ]);

    const formData = new FormData();
    formData.append("username", "jane-new");

    const sessionUser = {
      id: "u1",
      username: "jane-temp",
      email: "jane@example.com",
    };

    const result = await updateUsername(formData, sessionUser, db);
    expect(result.error).toMatch(/once every 30 days/i);

    const user = db.users.find((u) => u.id === "u1");
    expect(user?.username).toBe("jane-temp"); // Not changed
  });

  it("permits change after 30-day cooldown expires", async () => {
    const changed35DaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;
    const db = createMockD1Database([
      {
        id: "u1",
        name: "Jane",
        email: "jane@example.com",
        username: "jane-temp",
        created_at: 1000,
        username_changed_at: changed35DaysAgo,
      },
    ]);

    const formData = new FormData();
    formData.append("username", "jane-final");

    const sessionUser = {
      id: "u1",
      username: "jane-temp",
      email: "jane@example.com",
    };

    const result = await updateUsername(formData, sessionUser, db);
    expect(result.success).toBe(true);
    expect(result.newUsername).toBe("jane-final");
  });

  it("rejects handle taken by another user (case-insensitive)", async () => {
    const db = createMockD1Database([
      {
        id: "u1",
        name: "User One",
        email: "u1@example.com",
        username: "AliceBob",
        created_at: 1000,
        username_changed_at: null,
      },
      {
        id: "u2",
        name: "User Two",
        email: "u2@example.com",
        username: "Charlie",
        created_at: 1000,
        username_changed_at: null,
      },
    ]);

    const formData = new FormData();
    formData.append("username", "alicebob"); // colliding with AliceBob

    const sessionUser = {
      id: "u2",
      username: "Charlie",
      email: "u2@example.com",
    };

    const result = await updateUsername(formData, sessionUser, db);
    expect(result.error).toBe("Username already taken.");
  });
});

