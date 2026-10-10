import Link from "next/link";
import { SignupForm } from "@/components/signup-form";
import { inspectInvite } from "@/server/accounts.service";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inspectInvite(token);
  if (!invite.valid) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">This invite can&apos;t be used</h1>
        <p className="text-sm text-muted">
          The link has expired, was already used, or the account is full. Ask your partner to send a new invite.
        </p>
        <Link href="/login" className="btn w-full">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {invite.invitedBy && <p className="text-sm text-muted">{invite.invitedBy} invited you to share their budget.</p>}
      <SignupForm mode="join" token={token} />
    </div>
  );
}
