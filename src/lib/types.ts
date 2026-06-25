// Shared domain types for RenovateIQ

export type Role = "homeowner" | "contractor";

export type ProjectType =
  | "Kitchen"
  | "Bathroom"
  | "Living Room"
  | "Bedroom"
  | "Full Home";

export const PROJECT_TYPES: ProjectType[] = [
  "Kitchen",
  "Bathroom",
  "Living Room",
  "Bedroom",
  "Full Home",
];

export type HomeAge = "under 5yr" | "5–15yr" | "15–30yr" | "30+yr";

export const HOME_AGES: HomeAge[] = [
  "under 5yr",
  "5–15yr",
  "15–30yr",
  "30+yr",
];

export type ProjectStatus = "draft" | "planned" | "locked";

export type LeadStatus = "pending" | "accepted" | "declined";

export type Likelihood = "High" | "Medium" | "Low";

// ----- AI plan shape (what /api/plan returns, validated) -----

export interface PlanTask {
  id: string;
  name: string;
  duration_days: number;
  predecessors: string[];
  trade: string;
  cost_min: number;
  cost_max: number;
  is_critical: boolean; // AI hint only — real critical path computed in JS
  reasoning: string;
}

export interface ProcurementItem {
  item: string;
  order_by_day: number;
  lead_days: number;
  cost_min: number;
  cost_max: number;
  reason: string;
}

export interface PlanBudget {
  labour_min: number;
  labour_max: number;
  materials_min: number;
  materials_max: number;
  total_min: number;
  total_max: number;
  contingency_pct: number;
  buffer_recommended: number;
  buffer_reasoning: string;
  ceiling: number;
  budget_realistic: boolean; // AI's direct judgment — not inferred from prose
  honest_assessment: string;
}

export interface PlanRisk {
  risk: string;
  likelihood: Likelihood;
  impact: Likelihood;
  mitigation: string;
}

export interface PlanDecision {
  decision: string;
  deadline_day: number;
  consequence: string;
}

export interface RenovationPlan {
  project_summary: string;
  hidden_conditions: string[];
  tasks: PlanTask[];
  procurement: ProcurementItem[];
  budget: PlanBudget;
  risks: PlanRisk[];
  decision_queue: PlanDecision[];
  contractor_brief: string;
  budget_tight: boolean; // derived server-side from budget_realistic + totals
}

// ----- Intake -----

export interface Intake {
  type: ProjectType;
  city: string;
  home_age: HomeAge;
  area_sqft: number;
  budget_input: number;
  specific_asks: string;
  start_date: string; // ISO yyyy-mm-dd
}

// ----- DB rows -----

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  city: string | null;
  phone: string | null;
}

export interface ProjectRow {
  id: string;
  homeowner_id: string;
  type: ProjectType;
  city: string;
  home_age: HomeAge;
  area_sqft: number;
  budget_input: number;
  specific_asks: string | null;
  start_date: string;
  status: ProjectStatus;
  ai_plan: RenovationPlan | null;
  locked_at: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface ContractorProfile {
  id: string;
  business_name: string;
  experience_years: number;
  project_types: string[];
  rating: number;
  bio: string | null;
}

export interface PortfolioItem {
  id: string;
  contractor_id: string;
  type: string;
  location: string;
  year: number;
  cost_display: string;
  description: string;
}

export interface Lead {
  id: string;
  project_id: string;
  homeowner_id: string;
  contractor_id: string;
  status: LeadStatus;
  sent_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  sender_id: string;
  sender_role: Role;
  content: string | null;
  file_url: string | null;
  created_at: string;
}
