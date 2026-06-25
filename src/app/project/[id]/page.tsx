import { redirect, notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { PlanView } from "@/components/plan/PlanView";
import { GeneratePlanButton } from "@/components/plan/GeneratePlanButton";
import type { ProjectRow, RenovationPlan } from "@/lib/types";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/project/${id}`);
  if (profile?.role === "contractor") redirect("/dashboard/contractor");

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const project = data as ProjectRow;

  return (
    <>
      <AppNav role="homeowner" name={profile?.full_name || "You"} />
      {project.ai_plan ? (
        <PlanView project={project} plan={project.ai_plan as RenovationPlan} />
      ) : (
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="text-xl font-bold text-navy">Plan not generated yet</h1>
          <p className="mt-2 text-muted">
            We saved your project, but the AI plan didn&apos;t finish generating.
            Try again.
          </p>
          <div className="mt-6">
            <GeneratePlanButton projectId={project.id} />
          </div>
        </div>
      )}
    </>
  );
}
