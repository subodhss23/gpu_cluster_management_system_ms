import type { Cluster, SimJob } from "./types";
import catalog from "@/data/gpu-catalog.json";

const PRICE: Record<string, number> = Object.fromEntries(
  (catalog as { model: string; pricePerHr: number }[]).map((c) => [c.model, c.pricePerHr])
);

export function pricePerHr(model: string): number {
  return PRICE[model] ?? 1.5;
}

/** Weighted-average $/GPU-hr for a cluster from its gpuMix. */
export function clusterGpuPrice(cluster: Cluster): number {
  const entries = Object.entries(cluster.gpuMix);
  const total = entries.reduce((a, [, n]) => a + (n as number), 0) || 1;
  return entries.reduce((a, [m, n]) => a + pricePerHr(m) * ((n as number) / total), 0);
}

/** Burned spend so far: seeded accrual + live running projection. */
export function jobSpend(j: SimJob, price: number): number {
  if (j.status === "queued" || j.status === "cancelled") return j.costAccrued;
  const slice = j.fractional && j.fractional < 1 ? j.fractional : 1;
  return j.costAccrued + j.elapsedHrs * j.gpusRequested * slice * price;
}

/** Projected total if the job runs to walltime. */
export function jobProjected(j: SimJob, price: number): number {
  const slice = j.fractional && j.fractional < 1 ? j.fractional : 1;
  const remaining = Math.max(0, j.walltimeHrs - j.elapsedHrs);
  return jobSpend(j, price) + (j.status === "running" ? remaining * j.gpusRequested * slice * price : 0);
}

export function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const head = Object.keys(rows[0]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [head.join(","), ...rows.map((r) => head.map((h) => esc(r[h])).join(","))].join("\n");
}

export const TEAM_BUDGETS: Record<string, number> = {
  "frontier-train": 120000,
  "serve-llm": 60000,
  vision: 40000,
  platform: 25000,
  interns: 2000
};
