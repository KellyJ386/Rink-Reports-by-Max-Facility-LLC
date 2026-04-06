"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setPending(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-grey">
          RinkReports by Max Facility LLC
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-grey">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <Link
        href="/forgot-password"
        className="text-sm text-grey hover:text-white"
      >
        Forgot password?
      </Link>
    </div>
  );
}
