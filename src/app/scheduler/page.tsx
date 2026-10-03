"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket, Split, User } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { AppType, SimJob } from "@/lib/types";
import { pct } from "@/lib/utils";
import { clusterFreeGpus } from "@/lib/sim";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";

const APPS: { id: AppType; label: string; sched: "slurm" | "kubernetes" }[] = [
  { id: "pretraining", label: "LLM pretraining (Slurm, multi-node)", sched: "slurm" },
  { id: "fine-tune", label: "Fine-tune / RLHF (Slurm)", sched: "slurm" },
  { id: "inference", label: "Batch inference (K8s)", sched: "kubernetes" },
  { id: "vllm-serve", label: "vLLM online serving (K8s + GPUStack)", sched: "kubernetes" },
  { id: "sglang-serve", label: "SGLang serving (K8s + GPUStack)", sched: "kubernetes" },
  { id: "render", label: "Render / diffusion (fractional)", sched: "kubernetes" },
  { id: "analytics", label: "Embeddings / analytics (fractional)", sched: "kubernetes" }
];

export default function SchedulerPage() {
  const { clusters, users, jobs, partitions, schedPolicy, launchJob } = useFleet();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "llama3-8b-sft-demo", user: "Ava Chen", appType: "fine-tune" as AppType,
    clusterId: "helios-prod", partition: "", gpus: 8, fractional: 1, cpu: 64, mem: 512, storage: 300, network: 800, walltime: 48
  });
  const app = APPS.find((a) => a.id === form.appType)!;
  const user = users.find((u) => u.name === form.user);
  const cluster = clusters.find((c) => c.id === form.clusterId);
  const cparts = partitions.filter((p) => p.clusterId === form.clusterId && p.state === "up");
  const part = cparts.find((p) => p.name === form.partition);
  const effPriority = Math.round((user?.priority ?? 50) * (schedPolicy.teamWeight[user?.team ?? ""] ?? 1));
  const maxG = Math.min(schedPolicy.maxGpusPerJob, part?.maxGpusPerJob ?? schedPolicy.maxGpusPerJob);
  const maxT = Math.min(schedPolicy.maxWalltimeHrs, part?.maxTimeHrs ?? schedPolicy.maxWalltimeHrs);

  const estPosition = jobs.filter((j) => j.clusterId === form.clusterId && j.status === "queued").length + 1;
  const freeGpus = clusterFreeGpus(clusters, jobs, form.clusterId);
  const allocated = (clusters.find((c) => c.id === form.clusterId)?.totalGPUs ?? 0) - freeGpus;
  const willQueue = form.gpus > freeGpus;
  const quotaPct = user ? pct(user.usedGPUs + form.gpus, user.quotaGPUs) : 0;

  const submit = () => {
    const id = `job-${7100 + jobs.length}`;
    const gpusClamped = Math.min(form.gpus, maxG);
    const wallClamped = Math.min(form.walltime, maxT);
    const job: SimJob = {
      id, name: form.name, user: form.user, team: user?.team ?? "frontier-train",
      appType: form.appType, clusterId: form.clusterId, scheduler: app.sched,
      status: "queued",
      gpusRequested: gpusClamped, fractional: form.fractional < 1 ? form.fractional : undefined,
      cpuCores: form.cpu, memGB: form.mem, storageGB: form.storage, networkMbps: form.network,
      progress: 0, walltimeHrs: wallClamped, elapsedHrs: 0, costAccrued: 0,
      submittedAt: new Date().toISOString(), startedAt: null,
      gpuIds: [], framework: form.appType.includes("vllm") ? "vLLM 0.6" : form.appType.includes("sglang") ? "SGLang 0.3" : "PyTorch 2.4",
      partition: form.partition || undefined,
      logs: `PENDING eff-pri=${effPriority} · ${freeGpus} GPUs free on ${form.clusterId} · est-start +${estPosition * 21}m (Q pos ${estPosition})${schedPolicy.backfill ? " · backfill eligible" : ""}`
    };
    launchJob(job);
    router.push("/workloads");
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Launch workload — resource assignment" hint="Pick user/app, cluster, and GPU/CPU/memory/network/storage. The simulator emulates Slurm priority + Run:AI fractional placement." />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-3 font-mono text-xs tracking-widest text-nv">1 · IDENTITY & APPLICATION</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400"><span className="flex items-center gap-1"><User className="h-3 w-3" /> User (quota enforced)</span>
              <select value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">{users.map((u) => <option key={u.id}>{u.name}</option>)}</select></label>
            <label className="text-xs text-zinc-400">App type
              <select value={form.appType} onChange={(e) => { const a = APPS.find((x) => x.id === e.target.value)!; setForm({ ...form, appType: a.id }); }} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">{APPS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            <label className="text-xs text-zinc-400 sm:col-span-2">Job name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          </div>

          <div className="mb-3 mt-6 font-mono text-xs tracking-widest text-nv">2 · PLACEMENT</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-400">Cluster
              <select value={form.clusterId} onChange={(e) => setForm({ ...form, clusterId: e.target.value, partition: "" })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">{clusters.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.scheduler} ({c.totalGPUs} GPUs)</option>)}</select></label>
            <label className="text-xs text-zinc-400">Partition / node pool
              <select value={form.partition} onChange={(e) => setForm({ ...form, partition: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">
                <option value="">(any — scheduler picks)</option>
                {cparts.map((p) => <option key={p.id} value={p.name}>{p.name} · max {p.maxGpusPerJob} GPU / {p.maxTimeHrs}h · pri {p.priority}</option>)}
              </select></label>
          </div>
          <div className="mt-2 rounded-lg border border-line bg-black/30 p-2.5 text-xs text-zinc-400">Scheduler: <span className="font-mono text-white">{app.sched}</span> · <span className="font-mono text-nv">{freeGpus} GPUs free</span> ({allocated} allocated) · queue depth {estPosition - 1} · eff. priority <span className="font-mono text-nv">{effPriority}</span> · {schedPolicy.fairshare ? "fairshare" : "fifo"}{schedPolicy.backfill ? " + backfill" : ""}{schedPolicy.preemption ? " + preempt" : ""}</div>

          <div className="mb-3 mt-6 font-mono text-xs tracking-widest text-nv">3 · RESOURCES — GPU / CPU / MEM / NET / STORAGE</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-1 flex justify-between text-xs text-zinc-400"><span>GPUs: <b className="font-mono text-white">{Math.min(form.gpus, maxG)}</b></span><span className="font-mono text-zinc-600">policy max {maxG}{part ? ` (${part.name})` : ""}</span></div><input type="range" min={1} max={Math.max(1, schedPolicy.maxGpusPerJob)} value={Math.min(form.gpus, schedPolicy.maxGpusPerJob)} onChange={(e) => setForm({ ...form, gpus: Number(e.target.value) })} className="w-full accent-[#76B900]" /></div>
            <div><div className="mb-1 flex items-center justify-between text-xs text-zinc-400"><span className="flex items-center gap-1"><Split className="h-3 w-3" /> Fractional share: <b className="font-mono text-white">{form.fractional} GPU</b></span></div>
              <select value={form.fractional} onChange={(e) => setForm({ ...form, fractional: Number(e.target.value) })} className="w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white"><option value={1}>1.0 — whole GPU</option><option value={0.5}>0.5 — half (Run:AI)</option><option value={0.25}>0.25 — quarter slice</option></select></div>
            <div><div className="mb-1 flex justify-between text-xs text-zinc-400"><span>CPU cores: <b className="font-mono text-white">{form.cpu}</b></span></div><input type="range" min={2} max={512} value={form.cpu} onChange={(e) => setForm({ ...form, cpu: Number(e.target.value) })} className="w-full accent-[#22D3EE]" /></div>
            <div><div className="mb-1 flex justify-between text-xs text-zinc-400"><span>Memory: <b className="font-mono text-white">{form.mem} GB</b></span></div><input type="range" min={8} max={4096} step={8} value={form.mem} onChange={(e) => setForm({ ...form, mem: Number(e.target.value) })} className="w-full accent-[#A78BFA]" /></div>
            <div><div className="mb-1 flex justify-between text-xs text-zinc-400"><span>Storage: <b className="font-mono text-white">{form.storage} GB</b></span></div><input type="range" min={10} max={2000} step={10} value={form.storage} onChange={(e) => setForm({ ...form, storage: Number(e.target.value) })} className="w-full accent-[#F5A623]" /></div>
            <div><div className="mb-1 flex justify-between text-xs text-zinc-400"><span>Network: <b className="font-mono text-white">{form.network} Mb/s</b></span></div><input type="range" min={50} max={8000} step={50} value={form.network} onChange={(e) => setForm({ ...form, network: Number(e.target.value) })} className="w-full accent-[#FB7185]" /></div>
            <label className="text-xs text-zinc-400">Walltime (hrs, max {maxT})<input type="number" min={1} max={maxT} value={Math.min(form.walltime, maxT)} onChange={(e) => setForm({ ...form, walltime: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          </div>

          <button onClick={submit} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-nv py-3 font-semibold text-black shadow-glow hover:brightness-110"><Rocket className="h-4 w-4" /> Submit job{willQueue ? ` — queues at position ${estPosition} (${freeGpus} free)` : " — capacity free, starts next tick"}</button>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Placement preview" />
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-zinc-400">Scheduler verdict</span><Badge status={willQueue ? "queued" : "running"}>{willQueue ? "queued" : "running"}</Badge></div>
              <div className="flex justify-between font-mono"><span className="text-zinc-500">est. queue pos</span><span className="text-white">{willQueue ? estPosition : "— (immediate)"}</span></div>
              <div className="flex justify-between font-mono"><span className="text-zinc-500">est. cost/hr</span><span className="text-white">${(form.gpus * (form.fractional < 1 ? form.fractional : 1) * 2.4).toFixed(2)}</span></div>
              <div className="flex justify-between font-mono"><span className="text-zinc-500">target</span><span className="text-white">{cluster?.id}{form.partition ? `:${form.partition}` : ""} · {app.sched}</span></div>
              <div className="flex justify-between font-mono"><span className="text-zinc-500">eff. priority</span><span className="text-nv">{effPriority}</span></div>
              <div className="flex justify-between font-mono"><span className="text-zinc-500">policy</span><span className="text-zinc-400">{schedPolicy.note}</span></div>
            </div>
          </Card>
          <Card>
            <SectionTitle title="User quota check" hint={user ? `${user.team} · priority ${user.priority}` : undefined} />            {user && (
              <div className="space-y-2.5 text-xs">
                {[["GPUs", user.usedGPUs + form.gpus, user.quotaGPUs], ["CPU cores", user.usedCpuCores + form.cpu, user.quotaCpuCores], ["Memory GB", user.usedMemGB + form.mem, user.quotaMemGB]].map(([l, u, q]) => (
                  <div key={l as string}><div className="mb-1 flex justify-between font-mono"><span className="text-zinc-400">{l}</span><span className={(u as number) > (q as number) ? "text-rose" : "text-white"}>{u}/{q}</span></div><Bar value={((u as number) / (q as number)) * 100} color={(u as number) > (q as number) ? "bg-rose" : quotaPct > 85 ? "bg-amberx" : "bg-nv"} /></div>
                ))}
                {(user.usedGPUs + form.gpus) > user.quotaGPUs && <div className="rounded-lg border border-rose/40 bg-rose/10 p-2 text-rose">Over quota — submission will pend on quota (simulated policy).</div>}
              </div>
            )}
          </Card>
          <Card>
            <SectionTitle title="Cluster capacity" hint="live free GPUs per cluster — pick a roomy target" />
            <div className="space-y-2">
              {clusters.map((c) => {
                const free = clusterFreeGpus(clusters, jobs, c.id);
                const used = c.totalGPUs - free;
                const selected = c.id === form.clusterId;
                return (
                  <button key={c.id} onClick={() => setForm({ ...form, clusterId: c.id, partition: "" })} className={`w-full rounded-xl border p-2.5 text-left ${selected ? "border-nv/60 bg-nv/5" : "border-line bg-black/30 hover:border-nv/40"}`}>
                    <div className="mb-1 flex justify-between font-mono text-[11px]"><span className={selected ? "text-nv" : "text-zinc-300"}>{c.id}</span><span className="text-zinc-400">{free} free / {c.totalGPUs}</span></div>
                    <Bar value={(used / Math.max(1, c.totalGPUs)) * 100} color={free === 0 ? "bg-rose" : free < c.totalGPUs * 0.2 ? "bg-amberx" : "bg-nv"} />
                  </button>
                );
              })}
            </div>
          </Card>
          <Card>
            <div className="font-mono text-[11px] leading-relaxed text-zinc-500">$ sbatch --gpus={form.gpus} --cpus={form.cpu} --mem={form.mem}G job.sbatch<br />$ kubectl create -f mig-slice-{form.fractional}.yaml<br /># Run:AI fractional + MIG {form.fractional} GPU · NCCL over {cluster?.fabric}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
