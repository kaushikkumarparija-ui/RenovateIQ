// Supported Indian cities, grouped by tier (drives labour/material logic in the AI prompt).

export const TIER1_CITIES = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Surat",
  "Jaipur",
  "Lucknow",
  "Kanpur",
  "Nagpur",
  "Indore",
  "Thane",
] as const;

export const TIER2_CITIES = [
  "Bhopal",
  "Visakhapatnam",
  "Patna",
  "Vadodara",
  "Ghaziabad",
  "Ludhiana",
  "Agra",
  "Nashik",
  "Faridabad",
  "Meerut",
  "Rajkot",
  "Kalyan",
  "Vasai-Virar",
  "Coimbatore",
  "Madurai",
] as const;

export const TIER3_CITIES = [
  "Mysuru",
  "Bhubaneswar",
  "Ranchi",
  "Dehradun",
  "Jodhpur",
  "Raipur",
  "Kota",
  "Guwahati",
  "Chandigarh",
  "Amritsar",
  "Jammu",
  "Udaipur",
  "Aurangabad",
  "Jabalpur",
  "Trichy",
] as const;

export const ALL_CITIES: string[] = [
  ...TIER1_CITIES,
  ...TIER2_CITIES,
  ...TIER3_CITIES,
];

export const CITY_GROUPS = [
  { label: "Tier 1 (Metro)", cities: TIER1_CITIES as readonly string[] },
  { label: "Tier 2", cities: TIER2_CITIES as readonly string[] },
  { label: "Tier 3", cities: TIER3_CITIES as readonly string[] },
];

export function cityTier(city: string): 1 | 2 | 3 {
  if ((TIER1_CITIES as readonly string[]).includes(city)) return 1;
  if ((TIER2_CITIES as readonly string[]).includes(city)) return 2;
  return 3;
}
