import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { registrationOpen } from "@/server/accounts.service";

export default async function RegisterPage() {
  if (!(await registrationOpen())) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Registration is closed</h1>
        <p className="text-sm text-muted">
          This budget already has an account. If your partner invited you, open the invite link they sent. Otherwise
          sign in.
        </p>
        <Link href="/login" className="btn btn-primary w-full">
          Go to sign in
        </Link>
      </div>
    );
  }
  return <SignupForm mode="register" />;
}
