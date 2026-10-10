import { SignupForm } from "@/components/signup-form";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignupForm mode="reset" token={token} />;
}
