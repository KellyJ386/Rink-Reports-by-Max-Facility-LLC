import { Suspense } from "react";

import { LoginForm } from "@/app/(auth)/login/LoginForm";

// useSearchParams() inside LoginForm requires a Suspense boundary or
// Next will refuse to prerender this route. The fallback is null
// because the form itself is the only meaningful content here.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
