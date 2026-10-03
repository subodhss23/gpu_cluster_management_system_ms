"use client";
import { useMemo } from "react";
import { DollarSign, Download, TrendingUp, PieChart as PieIcon } from "lucide-react";
import { useFleet } from "@/lib/store";
import { clusterGpuPrice, jobProjected, jobSpend, money, toCsv, TEAM_BUDGETS } from "@/lib/finops";
import { downloadJson, pct } from "@/lib/utils";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";
import { ModelDonut, FleetArea } from "@/components/charts";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BillingPage() {
  const { clusters, jobs, users } = useFleet();
  const priceOf = useMemo(() => Object.fromEntries(clusters.map((c) => [c.id, clusterGpuPrice(c)])), [clusters]);

  const rows = useMemo(
    () => jobs.map((j) => ({ job: j, price: priceOf[j.clusterId] ?? 2, spend: 0, projected: 0 })).map((r) => ({ ...r, spend: jobSpend(r.job, r.price), projected: jobProjected(r.job, r.price) })),
    [jobs, priceOf]
  );
  const burned = rows.reduce((a, r) => a + r.spend, 0);
  const projected = rows.reduce((a, r) => a + r.projected, 0);

  const byTeam = useMemo(() => {
    const m: Record<string, { spend: number; projected: number; jobs: number }> = {};
    rows.forEach((r) => {
      const t = r.job.team;
      m[t] = m[t] ?? { spend: 0, projected: 0, jobs: 0 };
      m[t].spend += r.spend;
      m[t].projected += r.projected;
      m[t].jobs++;
    });
    return Object.entries(m).sort((a, b) => b[1].spend - a[1].spend);
  }, [rows]);

  const donut = byTeam.map(([t, v]) => ({ name: t, value: Math.round(v.spend) }));
  const burnSeries = useMemo(() => {
    const now = Date.now();
    let acc = 0;
    return Array.from({ length: 30 }, (_, i) => {
      acc += burned / 30 + Math.sin(i / 3) * (burned / 300);
      return { t: new Date(now - (29 - i) * 864e5).toLocaleDateString([], { month: "numeric", day: "numeric" }), util: Math.round(Math.max(0, acc)) };
    });
  }, [burned]);

  const topJobs = [...rows].sort((a, b) => b.spend - a.spend).slice(0, 8);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="FinOps — cost & chargeback"
        hint="Simulated $/GPU-hr from the GPU catalog × metered GPU-hours. Budgets are demo policies per team."
        right={
          <div className="flex gap-2">
            <button onClick={() => downloadCsv("helios-chargeback.csv", toCsv(rows.map((r) => ({ job: r.job.id, name: r.job.name, team: r.job.team, user: r.job.user, cluster: r.job.clusterId, status: r.job.status, gpus: r.job.gpusRequested, gpu_hrs: (r.job.elapsedHrs * r.job.gpusRequested).toFixed(1), price_per_gpu_hr: r.price.toFixed(2), burned_usd: r.spend.toFixed(0), projected_usd: r.projected.toFixed(0) }))))} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs hover:border-nv/60"><Download className="h-3.5 w-3.5 text-nv" /> Chargeback CSV</button>
            <button onClick={() => downloadJson("helios-billing.json", { exportedAt: new Date().toISOString(), burned, projected, byTeam })} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs hover:border-nv/60"><Download className="h-3.5 w-3.5 text-nv" /> JSON</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Burned (MTD sim)", money(burned), `${rows.length} jobs metered`],
          ["Projected total", money(projected), "to walltime at current pace"],
          ["Burn multiple", `${(projected / Math.max(1, burned)).toFixed(2)}×`, "projected ÷ burned"],
          ["Top team", byTeam[0]?.[0] ?? "—", byTeam[0] ? `${money(byTeam[0][1].spend)} burned` : ""]
        ].map(([l, v, s]) => (
          <Card key={l as string} className="p-4">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500"><DollarSign className="h-3 w-3 text-nv" />{l}</div>
            <div className="mt-1 font-mono text-xl font-bold text-white">{v}</div>
            <div className="mt-0.5 text-xs text-zinc-500">{s}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Cumulative burn — last 30 days" hint="Synthetic daily metering" />
          <FleetArea data={burnSeries} dataKey="util" color="#F5A623" unit="$" />
        </Card>
        <Card>
          <SectionTitle title="Spend by team" hint="Burned $ share" />
          <ModelDonut data={donut} />
          <div className="mt-1 space-y-2">
            {byTeam.map(([t, v]) => {
              const budget = TEAM_BUDGETS[t] ?? 10000;
              return (
                <div key={t}>
                  <div className="mb-1 flex justify-between font-mono text-[11px]"><span className="text-zinc-300">{t} · {v.jobs} jobs</span><span className={v.projected > budget ? "text-rose" : "text-zinc-400"}>{money(v.spend)} / {money(budget)}</span></div>
                  <Bar value={(v.projected / budget) * 100} color={v.projected > budget ? "bg-rose" : "bg-nv"} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Top jobs by spend" hint="Burned + projected to walltime" />
          <div className="space-y-2">
            {topJobs.map((r) => (
              <div key={r.job.id} className="rounded-xl border border-line bg-black/30 p-3">
                <div className="flex items-center gap-2"><span className="flex-1 truncate font-mono text-xs font-semibold text-white">{r.job.name}</span><Badge status={r.job.status}>{r.job.status}</Badge></div>
                <div className="mt-2"><Bar value={(r.spend / Math.max(1, topJobs[0].spend)) * 100} /></div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500"><span>{r.job.team} · {r.job.gpusRequested}×GPU @ ${r.price.toFixed(2)}/hr · {(r.job.elapsedHrs * r.job.gpusRequested).toFixed(0)} GPU-hrs</span><span className="text-white">{money(r.spend)} → {money(r.projected)}</span></div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Price book" hint="$/GPU-hr from gpu-catalog.json × cluster mix" />
          <div className="space-y-2">
            {clusters.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2.5">
                <TrendingUp className="h-4 w-4 text-nv" />
                <span className="flex-1 font-mono text-xs text-zinc-200">{c.id}</span>
                <span className="font-mono text-[11px] text-zinc-500">{Object.entries(c.gpuMix).map(([m, n]) => `${m}×${n}`).join(" + ")}</span>
                <span className="font-mono text-sm font-bold text-white">${(priceOf[c.id] ?? 0).toFixed(2)}<span className="text-[10px] font-normal text-zinc-500">/hr</span></span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-black/30 p-3 text-xs leading-relaxed text-zinc-400">
            <PieIcon className="mt-0.5 h-4 w-4 shrink-0 text-nv" />
            Fractional slices are billed pro-rata (0.25 GPU = 0.25× rate). Idle quota does not burn — only metered GPU-hours do. Export the CSV for chargeback to team cost centers.
          </div>
          <div className="mt-3">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">Quota vs burn (per user)</div>
            <div className="space-y-1.5">
              {users.slice(0, 5).map((u) => {
                const uspend = rows.filter((r) => r.job.user === u.name).reduce((a, r) => a + r.spend, 0);
                return <div key={u.id} className="flex justify-between font-mono text-[11px]"><span className="text-zinc-400">{u.name} <span className="text-zinc-600">({u.team})</span></span><span className="text-white">{money(uspend)}</span></div>;
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
