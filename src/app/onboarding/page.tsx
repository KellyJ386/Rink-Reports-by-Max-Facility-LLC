import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { OnboardingForm } from "@/app/onboarding/_components/OnboardingForm";

/**
 * Self-serve facility onboarding (Phase 6 multi-facility).
 *
 * Routing rules:
 *   - Not signed in            → redirect to /login
 *   - Signed in, no facility   → render the create-facility form
 *   - Signed in, has facility  → redirect to /dashboard
 *
 * Lives outside the (dashboard) and (auth) route groups so it
 * doesn't inherit either layout's chrome — onboarding is its own
 * standalone page.
 */
export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("facility_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.facility_id) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-navy">
          Welcome to RinkReports
        </h1>
        <p className="text-sm text-grey">
          Tell us a bit about your facility and we&apos;ll set you up
          with a 14-day trial. You&apos;ll be the first admin and can
          invite the rest of your team from the Admin Control Center.
        </p>
      </header>

      <OnboardingForm userEmail={user.email ?? ""} />
    </main>
  );
}
