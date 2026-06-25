import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { IntakeForm } from "@/components/IntakeForm";

export default async function NewProjectPage() {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/project/new");
  if (profile?.role === "contractor") redirect("/dashboard/contractor");

  return (
    <>
      <AppNav role="homeowner" name={profile?.full_name || "You"} />
      <IntakeForm defaultCity={profile?.city || ""} />
    </>
  );
}
