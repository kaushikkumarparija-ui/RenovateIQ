import { redirect, notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { ChatThread } from "@/components/ChatThread";
import type { Lead, Message, ProjectRow, RenovationPlan } from "@/lib/types";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/chat/${leadId}`);

  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (leadErr || !leadRow) notFound();
  const lead = leadRow as Lead;

  const amHomeowner = user.id === lead.homeowner_id;
  const amContractor = user.id === lead.contractor_id;
  if (!amHomeowner && !amContractor) notFound();

  // Contractor opening the thread accepts the connection.
  if (amContractor && lead.status === "pending") {
    await supabase.from("leads").update({ status: "accepted" }).eq("id", lead.id);
  }

  const { data: projectRow } = await supabase
    .from("projects")
    .select("*")
    .eq("id", lead.project_id)
    .single();
  if (!projectRow) notFound();
  const project = projectRow as ProjectRow;

  // Resolve the other party's name.
  const otherId = amHomeowner ? lead.contractor_id : lead.homeowner_id;
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", otherId)
    .single();

  const { data: msgRows } = await supabase
    .from("messages")
    .select("*")
    .eq("project_id", lead.project_id)
    .order("created_at", { ascending: true });

  const plan = project.ai_plan as RenovationPlan | null;
  const ceiling = plan?.budget?.ceiling ?? null;
  const role = amHomeowner ? "homeowner" : "contractor";

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav role={role} name={profile?.full_name || "You"} />
      <ChatThread
        projectId={project.id}
        myId={user.id}
        role={role}
        otherName={otherProfile?.full_name || (amHomeowner ? "Contractor" : "Homeowner")}
        projectLabel={`${project.type} · ${project.city}`}
        pdfUrl={project.pdf_url}
        ceiling={ceiling}
        initialMessages={(msgRows ?? []) as Message[]}
      />
    </div>
  );
}
