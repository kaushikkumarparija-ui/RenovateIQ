"use client";

import { useRef, useState } from "react";
import type { PlanTask } from "@/lib/types";
import type { Schedule } from "@/lib/plan-compute";
import { projectDate } from "@/lib/format";

const DAY_W = 22; // px per day
const ROW_H = 40;
const LABEL_W = 200;

export function Gantt({
  tasks,
  schedule,
  startDate,
  onDurationChange,
}: {
  tasks: PlanTask[];
  schedule: Schedule;
  startDate: string;
  onDurationChange: (id: string, duration: number) => void;
}) {
  const [flash, setFlash] = useState<{ ids: Set<string>; nonce: number }>({
    ids: new Set(),
    nonce: 0,
  });
  const dragRef = useRef<{
    id: string;
    startX: number;
    startDuration: number;
    prevStarts: Record<string, number>;
  } | null>(null);

  const totalDays = Math.max(schedule.totalDuration, 1);
  const chartW = Math.ceil(totalDays) * DAY_W + 40;
  const weeks = Math.ceil(totalDays / 7);

  function startDrag(e: React.PointerEvent, t: PlanTask) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const prevStarts: Record<string, number> = {};
    for (const s of schedule.tasks) prevStarts[s.id] = s.earliestStart;
    dragRef.current = {
      id: t.id,
      startX: e.clientX,
      startDuration: t.duration_days,
      prevStarts,
    };
  }

  function onMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / DAY_W);
    const next = Math.max(1, d.startDuration + deltaDays);
    onDurationChange(d.id, next);
  }

  function endDrag() {
    const d = dragRef.current;
    if (!d) return;
    // Flash every task whose start moved as a result (excluding the dragged one).
    const affected = new Set<string>();
    for (const s of schedule.tasks) {
      if (s.id !== d.id && d.prevStarts[s.id] !== s.earliestStart) {
        affected.add(s.id);
      }
    }
    if (affected.size) setFlash((f) => ({ ids: affected, nonce: f.nonce + 1 }));
    dragRef.current = null;
  }

  // Build dependency connector segments.
  const rowIndex: Record<string, number> = {};
  tasks.forEach((t, i) => (rowIndex[t.id] = i));

  return (
    <div className="overflow-x-auto">
      <div className="flex" style={{ minWidth: LABEL_W + chartW }}>
        {/* Labels */}
        <div className="shrink-0" style={{ width: LABEL_W }}>
          <div style={{ height: 28 }} className="text-xs font-semibold text-muted">
            Task
          </div>
          {tasks.map((t) => {
            const s = schedule.byId[t.id];
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 truncate pr-3 text-sm"
                style={{ height: ROW_H }}
                title={t.name}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    s?.critical ? "bg-amber" : "bg-teal"
                  }`}
                />
                <span className="truncate text-ink">{t.name}</span>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div
          className="relative"
          style={{ width: chartW }}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Week gridlines + axis */}
          <div style={{ height: 28 }} className="relative">
            {Array.from({ length: weeks + 1 }).map((_, w) => (
              <div
                key={w}
                className="absolute top-0 text-[10px] text-muted"
                style={{ left: w * 7 * DAY_W }}
              >
                {projectDate(startDate, w * 7)}
              </div>
            ))}
          </div>
          <div
            className="absolute bottom-0 top-7"
            style={{ width: chartW, pointerEvents: "none" }}
          >
            {Array.from({ length: weeks + 1 }).map((_, w) => (
              <div
                key={w}
                className="absolute top-0 h-full border-l border-line"
                style={{ left: w * 7 * DAY_W }}
              />
            ))}
          </div>

          {/* Dependency connectors */}
          <svg
            className="absolute left-0 top-7"
            width={chartW}
            height={tasks.length * ROW_H}
            style={{ pointerEvents: "none" }}
          >
            {tasks.flatMap((t) => {
              const s = schedule.byId[t.id];
              if (!s) return [];
              const tx = s.earliestStart * DAY_W;
              const ty = rowIndex[t.id] * ROW_H + ROW_H / 2;
              return t.predecessors
                .map((pid) => {
                  const ps = schedule.byId[pid];
                  if (!ps) return null;
                  const px = ps.earliestFinish * DAY_W;
                  const py = rowIndex[pid] * ROW_H + ROW_H / 2;
                  return (
                    <path
                      key={`${pid}-${t.id}`}
                      d={`M ${px} ${py} L ${px + 8} ${py} L ${px + 8} ${ty} L ${tx} ${ty}`}
                      fill="none"
                      stroke="#c9c9da"
                      strokeWidth={1.5}
                    />
                  );
                })
                .filter(Boolean);
            })}
          </svg>

          {/* Bars */}
          <div className="relative" style={{ marginTop: 0 }}>
            {tasks.map((t) => {
              const s = schedule.byId[t.id];
              if (!s) return null;
              const left = s.earliestStart * DAY_W;
              const width = Math.max(s.duration_days * DAY_W, 10);
              const flashing = flash.ids.has(t.id);
              return (
                <div
                  key={flashing ? `${t.id}-f${flash.nonce}` : t.id}
                  className="relative"
                  style={{ height: ROW_H }}
                >
                  <div
                    className={`absolute top-1/2 flex -translate-y-1/2 items-center rounded-md text-[11px] font-medium text-white shadow-sm ${
                      s.critical ? "bg-amber text-navy" : "bg-teal"
                    } ${flashing ? "flash" : ""}`}
                    style={{ left, width, height: 24 }}
                    title={`${t.name} · ${s.duration_days}d${s.critical ? " · critical path" : ""}`}
                  >
                    <span className="truncate px-2">{s.duration_days}d</span>
                    {/* drag handle */}
                    <span
                      onPointerDown={(e) => startDrag(e, t)}
                      className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize rounded-r-md bg-black/15 hover:bg-black/30"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted">
        Drag the right edge of any bar to change its duration — dependent tasks
        cascade and the <span className="font-semibold text-amber">critical path</span>{" "}
        recomputes automatically.
      </p>
    </div>
  );
}
