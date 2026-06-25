import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center py-6">
      <LoginForm next={next ?? "/dashboard"} />
    </main>
  );
}
