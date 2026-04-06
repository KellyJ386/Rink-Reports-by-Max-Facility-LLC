"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setError(authError.message);
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-grey">
          Choose a password with at least 8 characters.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">New password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Confirm password</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded border border-grey/40 bg-darkbg px-3 py-2 text-white focus:border-navy focus:outline-none"
          />
        </label>

        {error && (
          <p className="text-sm text-red" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-navy px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
