"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Cpu, Zap, Thermometer, Gauge, Settings2, Plus, Trash2, ZapOff } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { PartitionCfg, SimJob } from "@/lib/types";
import { effPriorityOf } from "@/lib/sim";
import { fmtNum, timeAgo } from "@/lib/utils";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";
import { FleetArea, GpuHeatmap } from "@/components/charts";
import ClusterEditor from "@/components/ClusterEditor";

export default function ClusterDetail() {
  const params = useParams<{ id: string }>();
  const { clusters, nodes, gpus, jobs, partitions, addPartition, updatePartition, removePartition, clusterHistory, tick, activity, preemptJobs } = useFleet();
  const [editing, setEditing] = useState(false);
  const [reclaimN, setReclaimN] = useState(2);
  const [showPartForm, setShowPartForm] = useState(false);
  const [partDraft, setPartDraft] = useState({ name: "ml-batch", kind: "slurm" as PartitionCfg["kind"], nodeCount: 4, maxGpusPerJob: 16, maxTimeHrs: 72, priority: 50, qos: "normal", allowAccounts: "*" });
  const cluster = clusters.find((c) => c.id === params.id);
  const telem = cluster ? clusterHistory[cluster.id] ?? [] : [];

  if (!cluster) {
    return (
      <div className="space-y-4">
        <Link href="/clusters" className="text-sm text-nv hover:underline">← Back to clusters</Link>
        <Card>Unknown cluster “{params.id}”. It may have been decommissioned.</Card>
      </div>
    );
  }

  const cn = nodes.filter((n) => n.clusterId === cluster.id);
  const cg = gpus.filter((g) => g.clusterId === cluster.id);
  const cjobs = jobs.filter((j) => j.clusterId === cluster.id);
  const avg = cg.length ? cg.reduce((a, g) => a + g.utilPct, 0) / cg.length : 0;
  const powerKW = cg.reduce((a, g) => a + g.powerW, 0) / 1000;
  const hot = [...cg].sort((a, b) => b.tempC - a.tempC).slice(0, 6);

  return (
    <div className="space-y-6">
      <Link href="/clusters" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-nv"><ArrowLeft className="h-4 w-4" /> All clusters</Link>
      <div className="grid-bg rounded-2xl border border-line bg-panel p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-white">{cluster.name}</h1>
          <Badge status={cluster.status}>{cluster.status}</Badge>
          <span className="font-mono text-xs text-zinc-500">{cluster.region} · {cluster.scheduler} · {cluster.fabric}</span>
          <button onClick={() => setEditing(true)} className="ml-auto flex items-center gap-1.5 rounded-lg border border-line bg-panel3 px-3 py-1.5 text-xs text-white hover:border-nv/60"><Settings2 className="h-3.5 w-3.5 text-nv" /> Configure</button>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">{cluster.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[11px] text-zinc-500">{cluster.orchestration.map((o) => <span key={o} className="rounded-full border border-line px-2 py-0.5">{o}</span>)}</div>
      </div>
      {editing && <ClusterEditor cluster={cluster} onClose={() => setEditing(false)} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["GPUs (provisioned)", fmtNum(cluster.totalGPUs)], ["Avg util (sampled)", `${avg.toFixed(1)}%`], ["Power (sampled)", `${powerKW.toFixed(1)} kW`], ["Jobs (all time slice)", String(cjobs.length)]].map(([l, v]) => (
          <Card key={l} className="p-4"><div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{l}</div><div className="mt-1 font-mono text-xl font-bold text-white">{v}</div></Card>
        ))}
      </div>

      <PartitionsSection
        clusterId={cluster.id}
        scheduler={cluster.scheduler}
        gpuTypes={Object.keys(cluster.gpuMix).join("+")}
        partitions={partitions.filter((p) => p.clusterId === cluster.id)}
        addPartition={addPartition}
        updatePartition={updatePartition}
        removePartition={removePartition}
        showForm={showPartForm}
        setShowForm={setShowPartForm}
        draft={partDraft}
        setDraft={setPartDraft}
      />

      <SpotPoolCard
        clusterId={cluster.id}
        totalGPUs={cluster.totalGPUs}
        running={cjobs.filter((j) => j.status === "running")}
        reclaimN={reclaimN}
        setReclaimN={setReclaimN}
        onReclaim={(n) => preemptJobs(cluster.id, n)}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Utilization stream" hint={`Live per-cluster aggregate · sample #${tick} · ${cg.length} sampled GPUs`} />
          <FleetArea data={telem} dataKey="util" />
        </Card>
        <Card>
          <SectionTitle title="GPU heatmap" hint="Click-through to Nodes & GPUs for per-GPU power caps" right={<Link href="/nodes" className="text-xs text-nv hover:underline">Inventory →</Link>} />
          <GpuHeatmap gpus={cg} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle title={`Nodes (${cn.length} sampled)`} hint="Head + GPU compute slice — full 100k-node scale emulated via aggregates" />
          <div className="space-y-2">
            {cn.map((n) => (
              <div key={n.id} className="flex items-center gap-3 rounded-xl border border-line bg-black/30 p-3">
                <Cpu className="h-4 w-4 shrink-0 text-nv" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-mono text-xs font-semibold text-white">{n.hostname}</span><Badge status={n.status}>{n.status}</Badge></div>
                  <div className="mt-1.5"><Bar value={n.cpuUtil} /></div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">CPU {n.cpuUtil.toFixed(0)}% · MEM {fmtNum(Math.round(n.memUsedGB))}/{fmtNum(n.memTotalGB)}GB · {n.gpuIds.length} GPUs · {n.powerW}W</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <SectionTitle title="Hottest GPUs" hint="Thermal policy 83°C — DCGM caps clocks above threshold" />
            <div className="space-y-2">
              {hot.map((g) => (
                <div key={g.id} className="flex items-center gap-3 rounded-xl border border-line bg-black/30 px-3 py-2">
                  <Thermometer className={`h-4 w-4 ${g.tempC > 83 ? "text-amberx" : "text-zinc-500"}`} />
                  <span className="flex-1 truncate font-mono text-xs text-zinc-200">{g.id} · {g.model}</span>
                  <Badge status={g.status}>{g.status}</Badge>
                  <span className="font-mono text-xs text-zinc-400">{g.tempC.toFixed(0)}°C · {g.powerW}W</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle title={`Jobs on ${cluster.id}`} hint="Slurm + Kubernetes unified queue" right={<Link href="/workloads" className="text-xs text-nv hover:underline">Queue →</Link>} />
            <div className="space-y-2">
              {cjobs.length === 0 && <div className="text-xs text-zinc-500">No jobs yet — <Link href="/scheduler" className="text-nv hover:underline">launch one</Link>.</div>}
              {cjobs.map((j) => (
                <div key={j.id} className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2">
                  <Gauge className="h-4 w-4 text-nv" />
                  <span className="flex-1 truncate font-mono text-xs text-zinc-200">{j.name}</span>
                  <Badge status={j.status}>{j.status}</Badge>
                  <span className="font-mono text-[11px] text-zinc-500">{j.gpusRequested}×GPU</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <SectionTitle title="Power policy" hint="BCM-style power capping" />
            <div className="flex items-center gap-2 font-mono text-sm"><Zap className="h-4 w-4 text-nv" /><span className="text-white">{powerKW.toFixed(1)} kW sampled</span><span className="text-zinc-500">/ {cluster.powerCapKW} kW cap</span></div>
            <div className="mt-2"><Bar value={(powerKW / cluster.powerCapKW) * 100} /></div>
            <div className="mt-1 font-mono text-[10px] text-zinc-600">{((powerKW / Math.max(1, cluster.powerCapKW)) * 100).toFixed(0)}% of cap · headroom {(Math.max(0, cluster.powerCapKW - powerKW)).toFixed(1)} kW</div>
          </Card>
          <Card>
            <SectionTitle title={`Events · ${cluster.id}`} hint="Cluster-scoped timeline" right={<Link href="/monitoring" className="text-xs text-nv hover:underline">All →</Link>} />
            <div className="space-y-1.5">
              {activity.filter((a) => a.clusterId === cluster.id).slice(0, 4).map((a) => (
                <div key={a.id} className="rounded-lg border border-line bg-black/30 px-2.5 py-1.5">
                  <div className="line-clamp-2 text-[11px] leading-relaxed text-zinc-300">{a.message}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-zinc-600"><Badge status={a.severity}>{a.severity}</Badge>{timeAgo(a.ts)} · {a.actor}</div>
                </div>
              ))}
              {activity.filter((a) => a.clusterId === cluster.id).length === 0 && <div className="text-xs text-zinc-500">No events recorded for this cluster yet.</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface PartProps {
  clusterId: string;
  scheduler: string;
  gpuTypes: string;
  partitions: PartitionCfg[];
  addPartition: (p: PartitionCfg) => void;
  updatePartition: (id: string, patch: Partial<PartitionCfg>) => void;
  removePartition: (id: string) => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  draft: { name: string; kind: PartitionCfg["kind"]; nodeCount: number; maxGpusPerJob: number; maxTimeHrs: number; priority: number; qos: string; allowAccounts: string };
  setDraft: (d: PartProps["draft"]) => void;
}

function SpotPoolCard({ clusterId, totalGPUs, running, reclaimN, setReclaimN, onReclaim }: {
  clusterId: string; totalGPUs: number; running: SimJob[];
  reclaimN: number; setReclaimN: (n: number) => void; onReclaim: (n: number) => void;
}) {
  const { users, schedPolicy } = useFleet();
  const spotCap = Math.max(4, Math.round(totalGPUs * 0.2));
  const spotRunning = running.filter((j) => j.preemptible);
  const ordered = [...running].sort((a, b) => effPriorityOf(a, users, schedPolicy.teamWeight) - effPriorityOf(b, users, schedPolicy.teamWeight));
  const victims = ordered.slice(0, Math.max(0, reclaimN));
  return (
    <Card className="border-amberx/30">
      <SectionTitle
        title="Spot pool — preemptible capacity"
        hint={`${spotCap} GPUs (~20%) at 70% off on-demand · reclaim evicts lowest effective priority first`}
        right={<span className="rounded-full border border-amberx/50 bg-amberx/10 px-2.5 py-0.5 font-mono text-[11px] text-amberx">{spotRunning.length} spot jobs running</span>}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-line bg-black/30 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Spot capacity</div>
          <div className="mt-1 font-mono text-lg font-bold text-white">{spotCap} <span className="text-xs font-normal text-zinc-500">GPUs · $0.30 on $1</span></div>
          <div className="mt-2"><Bar value={(spotCap / Math.max(1, totalGPUs)) * 100} color="bg-amberx" /></div>
        </div>
        <div className="rounded-xl border border-line bg-black/30 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Reclaim order (lowest pri first)</div>
          <div className="mt-1 space-y-1">
            {ordered.slice(0, 3).map((j) => (
              <div key={j.id} className="flex justify-between font-mono text-[11px]"><span className="truncate text-zinc-300">{j.name}</span><span className="text-amberx">{effPriorityOf(j, users, schedPolicy.teamWeight)}</span></div>
            ))}
            {ordered.length === 0 && <div className="text-[11px] text-zinc-500">nothing running — nothing to reclaim</div>}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-black/30 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Simulate spot reclaim</div>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={1} max={Math.max(1, running.length)} value={reclaimN} onChange={(e) => setReclaimN(Number(e.target.value))} className="w-16 rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-sm text-white" />
            <button onClick={() => onReclaim(reclaimN)} disabled={!running.length} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amberx/50 bg-amberx/10 px-3 py-1.5 text-xs font-semibold text-amberx hover:bg-amberx hover:text-black disabled:opacity-40"><ZapOff className="h-3.5 w-3.5" /> Reclaim {reclaimN}</button>
          </div>
          {victims.length > 0 && <div className="mt-1.5 font-mono text-[10px] text-zinc-500">would evict: {victims.map((v) => v.name).join(", ")}</div>}
        </div>
      </div>
    </Card>
  );
}

function PartitionsSection(props: PartProps) {
  const { clusterId, partitions, addPartition, updatePartition, removePartition, showForm, setShowForm, draft, setDraft } = props;
  const create = () => {
    if (!draft.name.trim()) { alert("Partition needs a name."); return; }
    addPartition({
      id: `${clusterId}-${draft.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`,
      clusterId, name: draft.name, kind: draft.kind, state: "up",
      nodeCount: draft.nodeCount, gpuTypes: props.gpuTypes,
      maxGpusPerJob: draft.maxGpusPerJob, maxTimeHrs: draft.maxTimeHrs,
      priority: draft.priority, qos: draft.qos, allowAccounts: draft.allowAccounts
    });
    setShowForm(false);
  };
  return (
    <Card>
      <SectionTitle
        title="Partitions & QOS"
        hint="Slurm partitions / K8s node pools: priority, limits and access control per queue"
        right={<button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-lg bg-nv px-3 py-1.5 text-xs font-bold text-black"><Plus className="h-3.5 w-3.5" /> New partition</button>}
      />
      {showForm && (
        <div className="mb-3 grid gap-2 rounded-xl border border-nv/30 bg-nv/5 p-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="text-[11px] text-zinc-400">Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400">Kind<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PartitionCfg["kind"] })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 text-xs text-white"><option value="slurm">slurm partition</option><option value="nodepool">k8s nodepool</option></select></label>
          <label className="text-[11px] text-zinc-400">Nodes<input type="number" min={1} value={draft.nodeCount} onChange={(e) => setDraft({ ...draft, nodeCount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400">Max GPUs/job<input type="number" min={1} value={draft.maxGpusPerJob} onChange={(e) => setDraft({ ...draft, maxGpusPerJob: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400">Max time (hrs)<input type="number" min={1} value={draft.maxTimeHrs} onChange={(e) => setDraft({ ...draft, maxTimeHrs: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400">Priority (0–100)<input type="number" min={0} max={100} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400">QOS<input value={draft.qos} onChange={(e) => setDraft({ ...draft, qos: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400">Accounts (* = all)<input value={draft.allowAccounts} onChange={(e) => setDraft({ ...draft, allowAccounts: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 font-mono text-xs text-white" /></label>
          <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-4">
            <button onClick={create} className="rounded-lg bg-nv px-4 py-1.5 text-xs font-bold text-black">Create</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-line px-4 py-1.5 text-xs text-zinc-300">Cancel</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead><tr className="font-mono text-[10px] uppercase tracking-widest text-zinc-500"><th className="py-2 pr-3">Partition</th><th className="pr-3">State</th><th className="pr-3">Nodes</th><th className="pr-3">Max GPU/job</th><th className="pr-3">Max time</th><th className="pr-3">Priority</th><th className="pr-3">QOS / accounts</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {partitions.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-2 pr-3"><span className="font-mono font-semibold text-white">{p.name}</span> <span className="font-mono text-[10px] text-zinc-500">{p.kind}</span><div className="font-mono text-[10px] text-zinc-600">{p.gpuTypes}</div></td>
                <td className="pr-3"><button onClick={() => updatePartition(p.id, { state: p.state === "up" ? "down" : "up" })} title="Toggle up/down"><Badge status={p.state === "up" ? "running" : "down"}>{p.state}</Badge></button></td>
                <td className="pr-3"><input type="number" min={0} value={p.nodeCount} onChange={(e) => updatePartition(p.id, { nodeCount: Number(e.target.value) })} className="w-16 rounded border border-line bg-black/40 px-1.5 py-1 font-mono text-white" /></td>
                <td className="pr-3"><input type="number" min={1} value={p.maxGpusPerJob} onChange={(e) => updatePartition(p.id, { maxGpusPerJob: Number(e.target.value) })} className="w-16 rounded border border-line bg-black/40 px-1.5 py-1 font-mono text-white" /></td>
                <td className="pr-3"><input type="number" min={1} value={p.maxTimeHrs} onChange={(e) => updatePartition(p.id, { maxTimeHrs: Number(e.target.value) })} className="w-16 rounded border border-line bg-black/40 px-1.5 py-1 font-mono text-white" /></td>
                <td className="pr-3"><input type="range" min={0} max={100} value={p.priority} onChange={(e) => updatePartition(p.id, { priority: Number(e.target.value) })} className="w-24 accent-[#76B900]" /><span className="ml-1 font-mono text-white">{p.priority}</span></td>
                <td className="pr-3"><span className="font-mono text-zinc-300">{p.qos}</span> <span className="font-mono text-[10px] text-zinc-500">{p.allowAccounts}</span></td>
                <td className="text-right"><button onClick={() => { if (confirm(`Delete partition ${p.name}?`)) removePartition(p.id); }} className="rounded-lg p-1.5 text-zinc-600 hover:text-rose"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {partitions.length === 0 && <div className="py-4 text-center text-xs text-zinc-500">No partitions — create one to open this cluster for scheduling.</div>}
      <div className="mt-2 font-mono text-[10px] text-zinc-600"># slurm: sinfo -p {partitions[0]?.name ?? "compute"} · smanage equivalent: scontrol update PartitionName=… State=DOWN</div>
    </Card>
  );
}
