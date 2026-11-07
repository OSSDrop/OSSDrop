"use client";

import React, { useState, useEffect, useTransition } from "react";
import { signupWithPassword, checkUsernameAvailable, type AuthActionResult } from "../../actions/auth";

export function SignupForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formState, setFormState] = useState<AuthActionResult | null>(null);
  const [availability, setAvailability] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
  }>({ checking: false });
  const [isPending, startTransition] = useTransition();

  // Debounced availability check
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 3) {
      setAvailability({ checking: false });
      return;
    }

    setAvailability({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(trimmed);
        if (res.available) {
          setAvailability({ checking: false, available: true, message: "Username is available!" });
        } else {
          setAvailability({ checking: false, available: false, message: res.error || "Taken" });
        }
      } catch {
        setAvailability({ checking: false });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormState(null);

    const formData = new FormData();
    formData.append("username", username);
    formData.append("email", email);
    formData.append("password", password);

    startTransition(async () => {
      const res = await signupWithPassword(formData);
      setFormState(res);
      if (res.success) {
        window.location.href = `/u/${username}`;
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md w-full mx-auto p-6 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Create an Account</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Join the OSSDrop community to discover, share, and launch open source tools.</p>

      {formState?.error && !formState.fieldErrors?.username && (
        <div className="p-3 text-sm rounded bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900">
          {formState.error}
        </div>
      )}

      {/* Email Field */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
        {formState?.fieldErrors?.email && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formState.fieldErrors.email}</p>
        )}
      </div>

      {/* Username Field */}
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_-]+"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="jane-doe"
          className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
        <div className="flex items-center justify-between mt-1 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">
            3-24 chars, letters, numbers, - and _
          </span>
          {availability.checking ? (
            <span className="text-zinc-400 animate-pulse">Checking...</span>
          ) : availability.available ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Available</span>
          ) : availability.available === false ? (
            <span className="text-red-600 dark:text-red-400 font-medium">✗ {availability.message}</span>
          ) : null}
        </div>

        {/* Live Profile URL Preview */}
        <div className="mt-1.5 px-2.5 py-1.5 text-xs rounded bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 flex items-center space-x-1">
          <span>Public profile:</span>
          <span className="font-mono text-blue-600 dark:text-blue-400">
            /u/{username.trim() || "your-handle"}
          </span>
        </div>

        {formState?.fieldErrors?.username && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
            {formState.fieldErrors.username}
          </p>
        )}
      </div>

      {/* Password Field */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-50 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
        {formState?.fieldErrors?.password && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{formState.fieldErrors.password}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? "Creating account..." : "Sign Up"}
      </button>
    </form>
  );
}

