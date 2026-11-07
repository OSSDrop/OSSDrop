"use client";

import React, { useState, useTransition } from "react";
import { updateUsername, type UpdateUsernameResult, type UserSession } from "../actions/settings";

interface SettingsFormProps {
  initialUser: {
    id: string;
    name: string;
    username: string;
    email: string;
    usernameChangedAt: number | null;
  };
}

export function SettingsForm({ initialUser }: SettingsFormProps) {
  const [displayName, setDisplayName] = useState(initialUser.name || "");
  const [username, setUsername] = useState(initialUser.username || "");
  const [status, setStatus] = useState<UpdateUsernameResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUsernameSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus(null);

    const formData = new FormData();
    formData.append("username", username);

    const sessionUser: UserSession = {
      id: initialUser.id,
      username: initialUser.username,
      email: initialUser.email,
    };

    startTransition(async () => {
      const res = await updateUsername(formData, sessionUser);
      setStatus(res);
      if (res.success && res.newUsername) {
        setUsername(res.newUsername);
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Account Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Manage your public profile identity and account preferences.
        </p>
      </div>

      {status?.message && (
        <div className="p-3 text-sm rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900">
          {status.message}
        </div>
      )}

      {status?.error && (
        <div className="p-3 text-sm rounded bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900">
          {status.error}
        </div>
      )}

      <form onSubmit={handleUsernameSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Display Name Field */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your full name or moniker"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-zinc-500">Your casual name shown on comments and badges.</p>
          </div>

          {/* Username Field */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Username (Public Handle)
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z0-9_-]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jane-doe"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-zinc-500">3-24 chars: letters, numbers, - and _</p>
          </div>
        </div>

        {/* Profile URL Preview & Warning */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3.5 text-xs text-amber-800 dark:text-amber-200 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <span>⚠ Public URL Notice</span>
          </div>
          <p>
            Your profile is located at{" "}
            <span className="font-mono font-medium underline">
              /u/{username.trim() || initialUser.username}
            </span>
            .
          </p>
          <p className="text-amber-700 dark:text-amber-300">
            Changing your username changes your profile URL. Old links will stop working (or redirect if unassigned). You can only change your username once every 30 days.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending || username === initialUser.username}
            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving..." : "Save Username"}
          </button>
        </div>
      </form>
    </div>
  );
}

