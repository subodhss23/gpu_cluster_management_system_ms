"use client";
import { useState } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { Cluster } from "@/lib/types";

const GPU_CHOICES = ["H100", "H200", "A100-80GB", "A100-40GB", "L40S", "A6000", "RTX4090", "V100"];
const ORCH_OPTIONS = ["Slurm 23.11", "Slurm 23.02", "Kubernetes 1.30", "Kubernetes 1.29", "K3s", "NVIDIA GPU Operator 24.6", "NVIDIA Device Plugin", "DCGM 3.3", "DCGM-exporter", "Run:AI", "GPUStack 0.5", "vLLM", "SGLang", "TensorRT-LLM", "Prometheus/Grafana", "Terraform+Ansible"];
const STATUSES: Cluster["status"][] = ["healthy", "degraded", "provisioning", "maintenance", "down"];

export default function ClusterEditor({ cluster, onClose }: { cluster: Cluster; onClose: () => void }) {
  const { updateCluster } = useFleet();
  const [form, setForm] = useState({
    name: cluster.name,
    regionCode: cluster.regionCode,
    region: cluster.region,
    scheduler: cluster.scheduler,
    status: cluster.status,
    fabric: cluster.fabric,
    storagePB: cluster.storagePB,
    powerCapKW: cluster.powerCapKW,
    description: cluster.description,
    tags: cluster.tags.join(", "),
    totalNodes: cluster.totalNodes
  });
  const [mix, setMix] = useState<[string, number][]>(Object.entries(cluster.gpuMix));
  const [orch, setOrch] = useState<string[]>([...cluster.orchestration]);

  const totalGPUs = mix.reduce((a, [, n]) => a + (Number(n) || 0), 0);

  const save = () => {
    const gpuMix: Record<string, number> = {};
    mix.forEach(([m, n]) => { if (m && Number(n) > 0) gpuMix[m] = Number(n); });
    if (!Object.keys(gpuMix).length) { alert("GPU mix cannot be empty."); return; }
    updateCluster(cluster.id, {
      name: form.name || cluster.id,
      regionCode: form.regionCode,
      region: form.region,
      scheduler: form.scheduler,
      status: form.status,
      fabric: form.fabric,
      storagePB: Number(form.storagePB) || 0,
      powerCapKW: Number(form.powerCapKW) || 0,
      description: form.description,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      orchestration: orch,
      gpuMix,
      totalGPUs,
      totalNodes: Math.max(2, Number(form.totalNodes) || Math.ceil(totalGPUs / 8) + 1)
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="glass max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] tracking-[0.25em] text-nv">DEEP CONFIG — {cluster.id}</div>
            <h2 className="text-lg font-bold text-white">Configure cluster</h2>
          </div>
          <button onClick={onClose} className="rounded-lg border border-line p-2 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs text-zinc-500">ID <span className="font-mono text-zinc-300">{cluster.id}</span> is immutable (jobs, nodes and endpoints key off it). Everything else is live — GPU mix changes reshape the sampled fleet.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">Display name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Region<select value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value, region: e.target.selectedOptions[0].text })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white"><option value="us-west">US West</option><option value="us-east">US East</option><option value="eu-central">EU Central</option><option value="ap-south">AP South</option></select></label>
          <label className="text-xs text-zinc-400">Scheduler<select value={form.scheduler} onChange={(e) => setForm({ ...form, scheduler: e.target.value as Cluster["scheduler"] })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white"><option value="slurm">slurm</option><option value="kubernetes">kubernetes</option><option value="hybrid">hybrid</option></select></label>
          <label className="text-xs text-zinc-400">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Cluster["status"] })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="text-xs text-zinc-400">Fabric<input value={form.fabric} onChange={(e) => setForm({ ...form, fabric: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Tags (comma-separated)<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Storage (PB)<input type="number" step={0.1} value={form.storagePB} onChange={(e) => setForm({ ...form, storagePB: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Power cap (kW)<input type="number" value={form.powerCapKW} onChange={(e) => setForm({ ...form, powerCapKW: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Total nodes<input type="number" min={2} value={form.totalNodes} onChange={(e) => setForm({ ...form, totalNodes: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          <div className="rounded-lg border border-line bg-black/30 p-2.5 font-mono text-xs text-zinc-400">Computed GPUs: <span className="font-bold text-nv">{totalGPUs}</span> · ~{Math.ceil(totalGPUs / 8)} GPU nodes + head</div>
          <label className="text-xs text-zinc-400 sm:col-span-2">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
        </div>

        <div className="mt-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400">GPU mix (fleet reshapes on save)</div>
          <div className="space-y-2">
            {mix.map(([m, n], i) => (
              <div key={i} className="flex gap-2">
                <select value={m} onChange={(e) => setMix(mix.map((row, j) => (j === i ? [e.target.value, row[1]] : row)))} className="flex-1 rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">{GPU_CHOICES.map((g) => <option key={g}>{g}</option>)}</select>
                <input type="number" min={0} step={8} value={n} onChange={(e) => setMix(mix.map((row, j) => (j === i ? [row[0], Number(e.target.value)] : row)))} className="w-28 rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" />
                <button onClick={() => setMix(mix.filter((_, j) => j !== i))} className="rounded-lg border border-line px-3 text-zinc-500 hover:text-rose"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setMix([...mix, ["H100", 8]])} className="flex items-center gap-1 text-xs text-nv hover:underline"><Plus className="h-3.5 w-3.5" /> Add GPU type</button>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400">Orchestration stack</div>
          <div className="flex flex-wrap gap-1.5">
            {ORCH_OPTIONS.map((o) => {
              const on = orch.includes(o);
              return <button key={o} onClick={() => setOrch(on ? orch.filter((x) => x !== o) : [...orch, o])} className={`rounded-full border px-2.5 py-1 font-mono text-[11px] ${on ? "border-nv/60 bg-nv/15 text-nv" : "border-line text-zinc-500 hover:text-white"}`}>{o}</button>;
            })}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={save} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-nv py-2.5 text-sm font-bold text-black"><Save className="h-4 w-4" /> Save configuration</button>
          <button onClick={onClose} className="rounded-xl border border-line px-5 py-2.5 text-sm text-zinc-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}
