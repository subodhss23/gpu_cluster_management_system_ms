"use client";
import { useState } from "react";
import { useFleet } from "@/lib/store";
import { timeAgo } from "@/lib/utils";
import { Card, SectionTitle, Badge } from "@/components/cards";
import { FleetArea } from "@/components/charts";

export default function MonitoringPage() {
  const { activity, gpus, history, tick } = useFleet();
  const telem = history;
  const [sev, setSev] = useState("all");
  const rows = activity.filter((a) => sev === "all" || a.severity === sev);
  const hot = [...gpus].sort((a, b) => b.powerW - a.powerW).slice(0, 8);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Monitoring — DCGM + Prometheus/Grafana view"
        hint="Live aggregates recomputed every 2.5s across all clusters."
        right={<span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500"><span className="h-2 w-2 rounded-full bg-nv live-dot" />sample #{tick} · {telem.length} pts</span>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[["GPU utilization (%)", "util", "%", "#76B900"], ["Power (kW)", "powerKW", "", "#F5A623"], ["Avg temp (°C)", "temp", "", "#FB7185"], ["Memory pressure (%)", "memPct", "%", "#22D3EE"]].map(([t, k, u, c]) => (
          <Card key={k as string}>
            <div className="mb-2 text-xs font-semibold text-white">{t}</div>
            <FleetArea data={telem} dataKey={k as string} color={c as string} unit={u as string} />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle title="Activity timeline" hint={`${rows.length} events · synthetic slurmctld / kubelet / DCGM / GPUStack feed`}
            right={<select value={sev} onChange={(e) => setSev(e.target.value)} className="rounded-lg border border-line bg-black/40 px-2 py-1 font-mono text-xs text-white"><option value="all">all severities</option><option value="info">info</option><option value="success">success</option><option value="warn">warn</option><option value="error">error</option></select>} />
          <div className="max-h-[560px] space-y-0 overflow-auto">
            {rows.map((a, i) => (
              <div key={a.id} className="relative flex gap-3 pb-5 pl-5">
                {i < rows.length - 1 && <span className="absolute bottom-0 left-[5px] top-5 w-px bg-line" />}
                <span className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full ${a.severity === "error" ? "bg-rose" : a.severity === "warn" ? "bg-amberx" : a.severity === "success" ? "bg-nv" : "bg-cyanx"}`} />
                <div className="flex-1 rounded-xl border border-line bg-black/30 p-3">
                  <div className="text-xs leading-relaxed text-zinc-200">{a.message}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
                    <Badge status={a.severity}>{a.severity}</Badge>
                    <span>{a.type}</span><span>·</span><span>{a.actor}</span><span>·</span><span>{a.clusterId ?? "fleet"}</span><span>·</span><span>{timeAgo(a.ts)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Top power consumers" hint="Per-GPU watts — candidates for power capping" />
          <div className="space-y-2">
            {hot.map((g) => (
              <div key={g.id} className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2">
                <span className="flex-1 truncate font-mono text-xs text-zinc-200">{g.id}</span>
                <span className="font-mono text-xs text-amberx">{g.powerW}W</span>
                <span className="font-mono text-[10px] text-zinc-500">{g.model}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-500">
            PROMQL (emulated)<br />
            <span className="text-nv">dcgm_gpu_utilization &gt; 90</span><br />
            <span className="text-nv">dcgm_temp &gt; 83</span> → clock-cap alert<br />
            <span className="text-nv">xid{`{code="79"}`} &gt; 0</span> → drain node
          </div>
          <div className="mt-4">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">Latest job transitions</div>
            <div className="space-y-1.5">
              {activity.filter((a) => a.type === "job").slice(0, 5).map((a) => (
                <div key={a.id} className="rounded-lg border border-line bg-black/30 px-2.5 py-1.5">
                  <div className="line-clamp-1 text-[11px] text-zinc-300">{a.message}</div>
                  <div className="font-mono text-[10px] text-zinc-600">{timeAgo(a.ts)} · {a.actor}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
