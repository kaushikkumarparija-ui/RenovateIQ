import { SignupForm } from "@/components/SignupForm";
import type { Role } from "@/lib/types";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  const initialRole: Role = role === "contractor" ? "contractor" : "homeowner";
  return (
    <main className="flex min-h-full items-center justify-center py-6">
      <SignupForm initialRole={initialRole} />
    </main>
  );
}
