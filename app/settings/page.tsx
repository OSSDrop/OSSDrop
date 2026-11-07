import React from "react";
import { SettingsForm } from "./SettingsForm";

export default function SettingsPage() {
  // In real execution, fetch current session from Auth.js auth()
  // and load user record from D1.
  const mockUser = {
    id: "usr_mock_123",
    name: "Jane Doe",
    username: "jane-doe",
    email: "jane@example.com",
    usernameChangedAt: null,
  };

  return (
    <main className="min-h-screen py-12 px-4 bg-zinc-50 dark:bg-zinc-950">
      <SettingsForm initialUser={mockUser} />
    </main>
  );
}

