"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-grey/40 px-3 py-1 text-sm text-grey hover:border-white hover:text-white disabled:opacity-50"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
