"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, AlertTriangle, Cpu, Zap, Boxes, Layers } from "lucide-react";
import { useFleet } from "@/lib/store";
import { fleetTotals } from "@/lib/sim";
import { fmtNum, pct, timeAgo } from "@/lib/utils";
import { Card, StatCard, SectionTitle, Badge, Bar } from "@/components/cards";
import { FleetArea, ModelDonut, MiniBars, GpuHeatmap } from "@/components/charts";

export default function Dashboard() {
  const { clusters, gpus, jobs, activity, endpoints, history } = useFleet();
  const telemetry = history;
  const totals = fleetTotals(clusters);

  const busy = gpus.filter((g) => g.status === "busy" || g.status === "throttled").length;
  const down = gpus.filter((g) => g.status === "down").length;
  const throttled = gpus.filter((g) => g.status === "throttled").length;
  const avgUtil = gpus.length ? gpus.reduce((a, g) => a + g.utilPct, 0) / gpus.length : 0;
  const powerKW = gpus.reduce((a, g) => a + g.powerW, 0) / 1000;
  const running = jobs.filter((j) => j.status === "running").length;
  const queued = jobs.filter((j) => j.status === "queued").length;

  const modelMix = useMemo(() => {
    const m: Record<string, number> = {};
    clusters.forEach((c) => Object.entries(c.gpuMix).forEach(([k, v]) => { m[k] = (m[k] ?? 0) + (v as number); }));
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [clusters]);

  const perCluster = clusters.map((c) => ({ name: c.id, gpus: c.totalGPUs }));
  const alerts = activity.filter((a) => a.severity === "warn" || a.severity === "error").slice(0, 5);

  return (
    <div className="space-y-6">
      {/* hero */}
      <div className="grid-bg relative overflow-hidden rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-nv/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-nv">NVIDIA BCM · CLUSTERWARE · SLURM · RUN:AI · GPUSTACK</div>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Fleet Operations Console <span className="nv-text-glow text-nv">— Helios</span></h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Multi-region GPU factory simulator. Provision clusters, slice GPUs with MIG/fractional shares, schedule Slurm + Kubernetes workloads, serve LLMs with vLLM/SGLang, and watch DCGM telemetry stream in.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/scheduler" className="rounded-lg bg-nv px-4 py-2 text-sm font-semibold text-black shadow-glow hover:brightness-110">+ Launch workload</Link>
              <Link href="/clusters" className="rounded-lg border border-line bg-panel3 px-4 py-2 text-sm text-white hover:border-nv/60">Manage clusters <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
              <Link href="/diagnostics" className="rounded-lg border border-line bg-panel3 px-4 py-2 text-sm text-white hover:border-nv/60">AI diagnostics</Link>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-nv live-dot" /> {fmtNum(gpus.length)} GPUs sampled live · {clusters.length} clusters
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total GPUs" value={fmtNum(totals.gpus)} sub={`${totals.clusters} clusters · ${totals.nodes} nodes`} />
        <StatCard label="Avg GPU util" value={`${avgUtil.toFixed(1)}%`} sub={`${fmtNum(busy)} active · ${queued} jobs queued`} />
        <StatCard label="Power draw" value={`${powerKW.toFixed(1)} kW`} sub={`cap ${totals.powerCapKW} kW · ${pct(powerKW, totals.powerCapKW)}%`} />
        <StatCard label="Running jobs" value={String(running)} sub={`${fmtNum(endpoints.reduce((a, e) => a + e.rps, 0))} infer rps fleet-wide`} />
        <StatCard label="Storage" value={`${totals.storagePB} PB`} sub="NVMe + parallel FS" accent="text-cyanx" />
        <StatCard label="Attention" value={String(down + throttled)} sub={`${down} down · ${throttled} throttled`} accent="text-amberx" />
      </div>

      {/* charts row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle title="Fleet GPU utilization" hint={`Live DCGM aggregate · new point every 2.5s · ${telemetry.length} samples`} right={<Badge status="running">live</Badge>} />
          <FleetArea data={telemetry} dataKey="util" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[["Power", "powerKW", "kW", "#F5A623"], ["Temp", "temp", "°C", "#FB7185"], ["Mem", "memPct", "%", "#22D3EE"]].map(([label, key, unit, color]) => (
              <div key={key as string} className="rounded-xl border border-line bg-black/30 p-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
                <div className="font-mono text-sm font-bold" style={{ color: color as string }}>
                  {(telemetry[telemetry.length - 1] as any)[key]} {unit}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="GPU model mix" hint="480 GPUs across 3 regions" />
          <ModelDonut data={modelMix} />
          <div className="mt-1 space-y-1.5">
            {modelMix.map((m) => (
              <div key={m.name} className="flex items-center justify-between text-xs">
                <span className="font-mono text-zinc-300">{m.name}</span>
                <span className="font-mono text-zinc-500">{fmtNum(m.value)} GPUs · {pct(m.value, totals.gpus)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <Card className="flex flex-col">
          <SectionTitle title="Capacity per cluster" hint="Provisioned GPUs" />
          <MiniBars data={perCluster} height="h-44" />
        </Card>
        <Card className="flex flex-col">
          <SectionTitle title="Live GPU heatmap" hint={`Showing ${Math.min(72, gpus.length)} of ${fmtNum(gpus.length)} sampled GPUs`} right={<Link href="/nodes" className="text-xs text-nv hover:underline">Open inventory →</Link>} />
          <div className="h-44 overflow-hidden">
            <GpuHeatmap gpus={gpus.slice(0, 72)} compact />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-nv" />&gt;90%</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-nv/40" />25–60%</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-zinc-800" />idle</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-amberx" />throttled</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-rose" />down</span>
          </div>
        </Card>
        <Card className="flex flex-col">
          <SectionTitle title="Needs attention" hint="DCGM + scheduler alerts" right={<Link href="/monitoring" className="text-xs text-nv hover:underline">All events →</Link>} />
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.id} className="flex gap-2.5 rounded-xl border border-line bg-black/30 p-3">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === "error" ? "text-rose" : "text-amberx"}`} />
                <div className="min-w-0">
                  <div className="line-clamp-2 text-xs leading-relaxed text-zinc-200">{a.message}</div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">{timeAgo(a.ts)} · {a.actor} · {a.clusterId}</div>
                </div>
              </div>
            ))}
            {alerts.length > 3 && <Link href="/monitoring" className="block text-center font-mono text-[11px] text-nv hover:underline">+{alerts.length - 3} more →</Link>}
          </div>
        </Card>
      </div>

      {/* clusters + jobs preview */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Clusters" hint="Multi-region fleet · Slurm + Kubernetes" right={<Link href="/clusters" className="text-xs text-nv hover:underline">View all →</Link>} />
          <div className="space-y-2.5">
            {clusters.map((c) => (
              <Link key={c.id} href={`/clusters/${c.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-black/30 p-3 hover:border-nv/50">
                <Boxes className="h-5 w-5 shrink-0 text-nv" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-semibold text-white">{c.name}</span>
                    <Badge status={c.status}>{c.status}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">{c.region} · {c.scheduler} · {fmtNum(c.totalGPUs)} GPUs · {c.fabric}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-600" />
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Top workloads" hint="Slurm + K8s queues" right={<Link href="/workloads" className="text-xs text-nv hover:underline">Queue →</Link>} />
          <div className="space-y-2.5">
            {jobs.slice(0, 5).map((j) => (
              <div key={j.id} className="rounded-xl border border-line bg-black/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-semibold text-white">{j.name}</span>
                  <Badge status={j.status}>{j.status}</Badge>
                </div>
                <div className="mt-2"><Bar value={j.progress} color={j.status === "failed" ? "bg-rose" : j.status === "queued" ? "bg-amberx" : "bg-nv"} /></div>
                <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500">
                  <span>{j.user} · {j.clusterId} · {j.gpusRequested} GPU{j.gpusRequested > 1 ? "s" : ""}</span>
                  <span>{j.progress.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* platform strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Boxes, t: "Base Command Mgmt", d: "Bare-metal provisioning, multi-cloud, 100k-node lifecycle." },
          { icon: Layers, t: "Slurm + Run:AI slicing", d: "Queues, priorities, 0.25–7 fractional & MIG shares." },
          { icon: Cpu, t: "DCGM health + power", d: "XID watch, thermal caps, clock & power policies." },
          { icon: Zap, t: "GPUStack serving", d: "vLLM · SGLang · TensorRT-LLM autoscaled endpoints." }
        ].map((f) => (
          <Card key={f.t} className="p-4">
            <f.icon className="h-5 w-5 text-nv" />
            <div className="mt-2 text-sm font-semibold text-white">{f.t}</div>
            <div className="mt-1 text-xs leading-relaxed text-zinc-500">{f.d}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
