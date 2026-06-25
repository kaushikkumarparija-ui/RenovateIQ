import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { Marketplace, type ContractorCard, type LockedProject } from "@/components/Marketplace";

export default async function MarketplacePage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/marketplace");
  if (profile?.role === "contractor") redirect("/dashboard/contractor");

  const { data: rows } = await supabase
    .from("contractor_profiles")
    .select(
      "id, business_name, experience_years, project_types, rating, bio, profiles ( full_name, city ), portfolio_items ( type, location, year, cost_display, description )",
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractors: ContractorCard[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    business_name: r.business_name,
    experience_years: r.experience_years,
    project_types: r.project_types ?? [],
    rating: Number(r.rating) || 0,
    bio: r.bio,
    full_name: r.profiles?.full_name ?? "",
    city: r.profiles?.city ?? "",
    portfolio: r.portfolio_items ?? [],
  }));

  const { data: projRows } = await supabase
    .from("projects")
    .select("id, type, city")
    .eq("homeowner_id", user.id)
    .eq("status", "locked");
  const lockedProjects: LockedProject[] = (projRows ?? []) as LockedProject[];

  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, contractor_id")
    .eq("homeowner_id", user.id);
  const existingLeads: Record<string, string> = {};
  for (const l of leadRows ?? []) existingLeads[l.contractor_id] = l.id;

  return (
    <>
      <AppNav role="homeowner" name={profile?.full_name || "You"} />
      <Marketplace
        myId={user.id}
        myCity={profile?.city || ""}
        contractors={contractors}
        lockedProjects={lockedProjects}
        existingLeads={existingLeads}
      />
    </>
  );
}
