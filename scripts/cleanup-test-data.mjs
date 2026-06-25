// Removes the test homeowner account and everything created under it during
// manual verification (projects, leads, messages, uploaded scope PDFs).
// Leaves the seeded demo contractors untouched.
// Run:  node scripts/cleanup-test-data.mjs

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = process.argv[2] || "anjali.e2e3@example.com";

async function main() {
  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  const user = usersPage.users.find((u) => u.email === TEST_EMAIL);
  if (!user) {
    console.log(`No user found for ${TEST_EMAIL} — nothing to clean up.`);
    return;
  }
  const userId = user.id;

  const { data: projects, error: projErr } = await admin
    .from("projects")
    .select("id")
    .eq("homeowner_id", userId);
  if (projErr) throw projErr;
  const projectIds = (projects ?? []).map((p) => p.id);
  console.log(`Found ${projectIds.length} project(s) for ${TEST_EMAIL}.`);

  for (const projectId of projectIds) {
    const { data: files } = await admin.storage.from("project-files").list(projectId);
    if (files?.length) {
      const paths = files.map((f) => `${projectId}/${f.name}`);
      const { error: rmErr } = await admin.storage.from("project-files").remove(paths);
      if (rmErr) console.warn(`  storage cleanup warning for ${projectId}:`, rmErr.message);
      else console.log(`  removed ${paths.length} file(s) for project ${projectId}`);
    }
  }

  const { data: leads } = await admin.from("leads").select("id").eq("homeowner_id", userId);
  console.log(`Found ${leads?.length ?? 0} lead(s).`);

  for (const projectId of projectIds) {
    const { error: msgErr } = await admin.from("messages").delete().eq("project_id", projectId);
    if (msgErr) console.warn(`  messages cleanup warning for ${projectId}:`, msgErr.message);
  }

  const { error: leadDelErr } = await admin.from("leads").delete().eq("homeowner_id", userId);
  if (leadDelErr) console.warn("lead delete warning:", leadDelErr.message);

  const { error: projDelErr } = await admin.from("projects").delete().eq("homeowner_id", userId);
  if (projDelErr) console.warn("project delete warning:", projDelErr.message);

  const { error: profileDelErr } = await admin.from("profiles").delete().eq("id", userId);
  if (profileDelErr) console.warn("profile delete warning:", profileDelErr.message);

  const { error: userDelErr } = await admin.auth.admin.deleteUser(userId);
  if (userDelErr) throw userDelErr;

  console.log(`Deleted auth user, profile, ${projectIds.length} project(s), leads and messages for ${TEST_EMAIL}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
