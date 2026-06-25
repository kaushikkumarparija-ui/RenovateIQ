// Seeds the 5 demo contractors as real, loginable auth users + portfolios.
// Run:  npm run seed
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
// after the schema.sql has been applied.

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // env may already be present in the shell
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "renovateiq123";

const CONTRACTORS = [
  {
    email: "rajesh@renovateiq.demo",
    full_name: "Rajesh Sharma",
    city: "Bengaluru",
    business_name: "Sharma Interiors",
    experience_years: 12,
    project_types: ["Kitchen", "Bathroom"],
    rating: 4.7,
    bio: "12 years building premium modular kitchens and Italian-marble bathrooms across Bengaluru.",
    portfolio: [
      { type: "Kitchen", location: "Koramangala", year: 2024, cost_display: "₹3.2L", description: "Full modular kitchen" },
      { type: "Bathroom", location: "Whitefield", year: 2023, cost_display: "₹1.8L", description: "Master bath, Italian marble" },
      { type: "Kitchen", location: "Indiranagar", year: 2023, cost_display: "₹2.7L", description: "L-shaped kitchen" },
    ],
  },
  {
    email: "priya@renovateiq.demo",
    full_name: "Priya Nair",
    city: "Mumbai",
    business_name: "Nair Construction Works",
    experience_years: 8,
    project_types: ["Kitchen", "Living Room"],
    rating: 4.5,
    bio: "Compact-space specialists for Mumbai homes — kitchens, living rooms and full 2BHK renovations.",
    portfolio: [
      { type: "Kitchen", location: "Bandra", year: 2024, cost_display: "₹2.9L", description: "Compact modular kitchen" },
      { type: "Living Room", location: "Andheri", year: 2024, cost_display: "₹1.5L", description: "Living room false ceiling" },
      { type: "Full Home", location: "Powai", year: 2023, cost_display: "₹8.4L", description: "2BHK full renovation" },
    ],
  },
  {
    email: "suresh@renovateiq.demo",
    full_name: "Suresh Reddy",
    city: "Hyderabad",
    business_name: "Reddy Buildtech",
    experience_years: 15,
    project_types: ["Bathroom", "Kitchen"],
    rating: 4.8,
    bio: "15 years of luxury bathrooms and granite-finish modular kitchens across Hyderabad.",
    portfolio: [
      { type: "Bathroom", location: "Gachibowli", year: 2024, cost_display: "₹2.1L", description: "Luxury bathroom, rain shower" },
      { type: "Kitchen", location: "Jubilee Hills", year: 2024, cost_display: "₹3.8L", description: "Premium modular kitchen, granite" },
      { type: "Bathroom", location: "Kondapur", year: 2023, cost_display: "₹1.2L", description: "Standard bathroom, anti-skid tiles" },
    ],
  },
  {
    email: "amit@renovateiq.demo",
    full_name: "Amit Patel",
    city: "Pune",
    business_name: "Patel Renovation Co.",
    experience_years: 10,
    project_types: ["Full Home", "Kitchen"],
    rating: 4.6,
    bio: "Full-home renovation experts in Pune — end-to-end project management and carpentry.",
    portfolio: [
      { type: "Full Home", location: "Kothrud", year: 2024, cost_display: "₹12L", description: "3BHK full renovation" },
      { type: "Kitchen", location: "Aundh", year: 2024, cost_display: "₹2.4L", description: "U-shaped modular kitchen" },
      { type: "Living Room", location: "Baner", year: 2023, cost_display: "₹1.8L", description: "Living room TV unit + false ceiling" },
    ],
  },
  {
    email: "meena@renovateiq.demo",
    full_name: "Meena Krishnan",
    city: "Delhi",
    business_name: "Krishnan Interiors",
    experience_years: 9,
    project_types: ["Kitchen", "Bedroom"],
    rating: 4.4,
    bio: "Minimalist kitchens and bedroom storage solutions for Delhi homes.",
    portfolio: [
      { type: "Kitchen", location: "Dwarka", year: 2024, cost_display: "₹3.1L", description: "Minimalist kitchen, quartz countertop" },
      { type: "Bedroom", location: "Rohini", year: 2024, cost_display: "₹1.1L", description: "Master bedroom wardrobe + false ceiling" },
      { type: "Bathroom", location: "Vasant Kunj", year: 2023, cost_display: "₹1.6L", description: "Premium bathroom sanitaryware" },
    ],
  },
];

async function findUserByEmail(email) {
  // listUsers is paginated; demo set is tiny so page 1 is enough.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function upsertContractor(c) {
  const user_metadata = {
    role: "contractor",
    full_name: c.full_name,
    city: c.city,
    business_name: c.business_name,
    experience_years: c.experience_years,
    project_types: c.project_types,
    rating: c.rating,
    bio: c.bio,
  };

  let user = await findUserByEmail(c.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: c.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata,
    });
    if (error) throw error;
    user = data.user;
    console.log(`  created ${c.email}`);
  } else {
    // Refresh metadata; trigger only fires on insert, so sync rows directly.
    await admin.auth.admin.updateUserById(user.id, { user_metadata });
    console.log(`  exists  ${c.email} (refreshed)`);
  }

  // Make sure profile + contractor_profile rows exist (in case trigger was
  // added after the user, or on a re-run).
  await admin.from("profiles").upsert({
    id: user.id,
    role: "contractor",
    full_name: c.full_name,
    city: c.city,
  });
  await admin.from("contractor_profiles").upsert({
    id: user.id,
    business_name: c.business_name,
    experience_years: c.experience_years,
    project_types: c.project_types,
    rating: c.rating,
    bio: c.bio,
  });

  // Reset portfolio to avoid duplicates on re-run.
  await admin.from("portfolio_items").delete().eq("contractor_id", user.id);
  const rows = c.portfolio.map((p) => ({ ...p, contractor_id: user.id }));
  const { error: pErr } = await admin.from("portfolio_items").insert(rows);
  if (pErr) throw pErr;

  return user.id;
}

async function main() {
  console.log("Seeding contractors…");
  for (const c of CONTRACTORS) {
    await upsertContractor(c);
  }
  console.log("\nDone. Demo contractor logins (password for all):");
  console.log(`  password: ${PASSWORD}`);
  for (const c of CONTRACTORS) {
    console.log(`  ${c.email}  —  ${c.business_name} (${c.city})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
