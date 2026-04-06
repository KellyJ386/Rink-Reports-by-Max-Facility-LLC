"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

    if (authError) {
      setError(authError.message);
      setPending(false);
      return;
    }

    setSent(true);
    setPending(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold text-white">Check your email</h1>
        <p className="text-sm text-grey">
          If <span className="text-white">{email}</span> matches an account, a
          password reset link is on its way.
        </p>
        <Link href="/login" className="text-sm text-grey hover:text-white">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Reset password</h1>
        <p className="mt-1 text-sm text-grey">
          Enter your email and we&rsquo;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <Link href="/login" className="text-sm text-grey hover:text-white">
        Back to sign in
      </Link>
    </div>
  );
}
