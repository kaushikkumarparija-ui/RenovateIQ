// Builds the locked-scope PDF (client-side) with jsPDF + autotable.
// Note: the built-in PDF fonts don't include the ₹ glyph, so money is rendered
// as "Rs 1,20,000" here (Indian digit grouping preserved).

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ProjectRow, RenovationPlan } from "./types";
import type { Schedule } from "./plan-compute";
import type { BudgetView } from "./plan-compute";
import { projectDate, formatDate } from "./format";

const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const rs = (n: number) => `Rs ${grouped.format(Math.round(n || 0))}`;
const rsRange = (a: number, b: number) => `${rs(a)} - ${rs(b)}`;

const NAVY: [number, number, number] = [26, 26, 46];
const AMBER: [number, number, number] = [244, 162, 97];

// jsPDF's standard fonts only support single-byte WinAnsi encoding. A string
// containing ₹ makes jsPDF switch that line to 2-byte text, but the font
// stays single-byte — the viewer then reads the null bytes as garbage glyphs.
// The AI writes ₹ freely in its prose (project_summary, risks, etc.), so every
// string field is swept here rather than just the numbers we format ourselves.
function stripRupee<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/₹/g, "Rs ") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(stripRupee) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripRupee(v);
    }
    return out as T;
  }
  return value;
}

export function buildScopePdf({
  project,
  plan: rawPlan,
  schedule: rawSchedule,
  budget,
}: {
  project: ProjectRow;
  plan: RenovationPlan;
  schedule: Schedule;
  budget: BudgetView;
}): Blob {
  const plan = stripRupee(rawPlan);
  const schedule = stripRupee(rawSchedule);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 48;

  const heading = (text: string) => {
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(text, margin, y);
    y += 16;
  };

  const para = (text: string, size = 9) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(60, 60, 80);
    const lines = doc.splitTextToSize(text, pageW - margin * 2);
    if (y + lines.length * (size + 3) > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 48;
    }
    doc.text(lines, margin, y);
    y += lines.length * (size + 3) + 8;
  };

  const afterTable = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 20;
  };

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text("RenovateIQ — Locked Scope", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 110);
  doc.text(
    `${project.type} · ${project.city} · ${project.area_sqft} sqft · ${project.home_age} · starts ${formatDate(
      project.start_date,
    )}`,
    margin,
    y,
  );
  y += 14;
  doc.text(`Generated ${formatDate(new Date())}`, margin, y);
  y += 22;

  // Ceiling banner
  doc.setFillColor(...AMBER);
  doc.roundedRect(margin, y, pageW - margin * 2, 46, 6, 6, "F");
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("HARD BUDGET CEILING (scope + buffer)", margin + 14, y + 19);
  doc.setFontSize(18);
  doc.text(rs(budget.ceiling), margin + 14, y + 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Scope ${rsRange(budget.totalMin, budget.totalMax)}  +  buffer ${rs(
      budget.buffer,
    )} (${budget.contingencyPct}%)`,
    pageW - margin - 14,
    y + 28,
    { align: "right" },
  );
  y += 64;

  heading("Project summary");
  para(plan.project_summary);

  if (plan.hidden_conditions.length) {
    heading("Hidden conditions flagged");
    para("• " + plan.hidden_conditions.join("\n• "));
  }

  // Tasks
  heading("Locked task list");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["#", "Task", "Trade", "Start", "Finish", "Cost", "Why"]],
    body: schedule.tasks.map((t, i) => [
      String(i + 1),
      t.name + (t.critical ? "  (critical)" : ""),
      t.trade,
      projectDate(project.start_date, t.earliestStart),
      projectDate(project.start_date, t.earliestFinish),
      rsRange(t.cost_min, t.cost_max),
      t.reasoning,
    ]),
    styles: { fontSize: 7.5, cellPadding: 3, valign: "top" },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 16 },
      2: { cellWidth: 60 },
      3: { cellWidth: 52 },
      4: { cellWidth: 52 },
      5: { cellWidth: 80 },
    },
  });
  afterTable();

  // Budget
  heading("Budget breakdown");
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Item", "Amount"]],
    body: [
      ["Labour", rsRange(budget.labourMin, budget.labourMax)],
      ["Materials", rsRange(budget.materialsMin, budget.materialsMax)],
      ["Scope total", rsRange(budget.totalMin, budget.totalMax)],
      [`Buffer (${budget.contingencyPct}%)`, rs(budget.buffer)],
      ["HARD CEILING", rs(budget.ceiling)],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data) => {
      if (data.row.index === 4) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [253, 241, 229];
        data.cell.styles.textColor = [224, 138, 74];
      }
    },
  });
  afterTable();
  para(`Buffer rationale: ${plan.budget.buffer_reasoning}`, 8);
  para(`Honest assessment: ${plan.budget.honest_assessment}`, 8);

  // Procurement
  if (plan.procurement.length) {
    heading("Procurement schedule");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Item", "Order by", "Lead", "Cost", "Why early"]],
      body: plan.procurement.map((pr) => [
        pr.item,
        projectDate(project.start_date, pr.order_by_day),
        `${pr.lead_days}d`,
        rsRange(pr.cost_min, pr.cost_max),
        pr.reason,
      ]),
      styles: { fontSize: 8, cellPadding: 3, valign: "top" },
      headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 1: { cellWidth: 56 }, 2: { cellWidth: 34 }, 3: { cellWidth: 80 } },
    });
    afterTable();
  }

  // Risks
  if (plan.risks.length) {
    heading("Risk register");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Risk", "Likelihood", "Impact", "Mitigation"]],
      body: plan.risks.map((r) => [r.risk, r.likelihood, r.impact, r.mitigation]),
      styles: { fontSize: 8, cellPadding: 3, valign: "top" },
      headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 1: { cellWidth: 56 }, 2: { cellWidth: 46 } },
    });
    afterTable();
  }

  // Decisions
  if (plan.decision_queue.length) {
    heading("Decision deadlines");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Decision", "Decide by", "If missed"]],
      body: [...plan.decision_queue]
        .sort((a, b) => a.deadline_day - b.deadline_day)
        .map((d) => [
          d.decision,
          projectDate(project.start_date, d.deadline_day),
          d.consequence,
        ]),
      styles: { fontSize: 8, cellPadding: 3, valign: "top" },
      headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 1: { cellWidth: 64 } },
    });
    afterTable();
  }

  // Contractor brief
  heading("Contractor brief");
  para(plan.contractor_brief);

  // Footer disclaimer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 150);
    doc.text(
      "RenovateIQ — AI planning estimate, not a substitute for an on-site survey. Figures are ranges for negotiation.",
      margin,
      doc.internal.pageSize.getHeight() - 24,
    );
    doc.text(
      `Page ${i} of ${pages}`,
      pageW - margin,
      doc.internal.pageSize.getHeight() - 24,
      { align: "right" },
    );
  }

  return doc.output("blob");
}
