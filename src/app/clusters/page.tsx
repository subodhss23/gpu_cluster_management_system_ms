"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Boxes, MapPin, Cpu, Settings2 } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { Cluster } from "@/lib/types";
import { fmtNum } from "@/lib/utils";
import { Card, SectionTitle, Badge } from "@/components/cards";
import ClusterEditor from "@/components/ClusterEditor";

const SCHEDULERS = ["slurm", "kubernetes", "hybrid"] as const;
const GPU_CHOICES = ["H100", "H200", "A100-80GB", "A100-40GB", "L40S", "A6000", "RTX4090", "V100"];

export default function ClustersPage() {
  const { clusters, addCluster, removeCluster, nodes, gpus } = useFleet();
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<Cluster | null>(null);
  const [form, setForm] = useState({ name: "nebula-rnd", region: "US West", regionCode: "us-west", scheduler: "hybrid" as Cluster["scheduler"], gpuModel: "H100", gpuCount: 32, fabric: "InfiniBand NDR 400Gb/s", storagePB: 1.2 });

  const create = () => {
    const id = form.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const gpuCount = Math.max(8, form.gpuCount);
    const nodeCount = Math.ceil(gpuCount / 8) + 1;
    addCluster({
      id, name: form.name, region: form.region, regionCode: form.regionCode, provider: "helios-cloud",
      status: "provisioning", scheduler: form.scheduler,
      orchestration: form.scheduler === "slurm" ? ["Slurm 23.11", "DCGM"] : form.scheduler === "kubernetes" ? ["Kubernetes 1.30", "GPU Operator"] : ["Slurm 23.11", "Kubernetes 1.30", "GPU Operator"],
      gpuMix: { [form.gpuModel]: gpuCount }, totalGPUs: gpuCount, totalNodes: nodeCount,
      fabric: form.fabric, storagePB: form.storagePB, powerCapKW: Math.round(gpuCount * 0.7),
      version: "helios 0.1", createdAt: new Date().toISOString(), tags: ["custom"],
      description: `User-provisioned ${form.scheduler} cluster with ${gpuCount}x ${form.gpuModel}.`
    });
    setShowWizard(false);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Clusters — multi-region fleet"
        hint="BCM-style lifecycle: provision, monitor via DCGM, decommission. Click a card for node-level detail."
        right={<button onClick={() => setShowWizard(!showWizard)} className="flex items-center gap-1.5 rounded-lg bg-nv px-4 py-2 text-sm font-semibold text-black shadow-glow"><Plus className="h-4 w-4" /> New cluster</button>}
      />

      {showWizard && (
        <Card className="border-nv/40">
          <div className="mb-3 font-mono text-xs tracking-widest text-nv">ZERO-TOUCH PROVISIONING WIZARD</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-zinc-400">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
            <label className="text-xs text-zinc-400">Region<select value={form.regionCode} onChange={(e) => setForm({ ...form, regionCode: e.target.value, region: e.target.selectedOptions[0].text })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white"><option value="us-west">US West</option><option value="us-east">US East</option><option value="eu-central">EU Central</option><option value="ap-south">AP South</option></select></label>
            <label className="text-xs text-zinc-400">Scheduler<select value={form.scheduler} onChange={(e) => setForm({ ...form, scheduler: e.target.value as Cluster["scheduler"] })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">{SCHEDULERS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="text-xs text-zinc-400">GPU model<select value={form.gpuModel} onChange={(e) => setForm({ ...form, gpuModel: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">{GPU_CHOICES.map((g) => <option key={g}>{g}</option>)}</select></label>
            <label className="text-xs text-zinc-400">GPU count<input type="number" min={8} step={8} value={form.gpuCount} onChange={(e) => setForm({ ...form, gpuCount: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
            <label className="text-xs text-zinc-400">Fabric<input value={form.fabric} onChange={(e) => setForm({ ...form, fabric: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-zinc-400">Storage (PB)<input type="number" step={0.1} value={form.storagePB} onChange={(e) => setForm({ ...form, storagePB: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
            <div className="flex items-end gap-2">
              <button onClick={create} className="flex-1 rounded-lg bg-nv px-4 py-2 text-sm font-semibold text-black">Provision</button>
              <button onClick={() => setShowWizard(false)} className="rounded-lg border border-line px-4 py-2 text-sm text-zinc-300">Cancel</button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">Simulates Terraform + Ansible + PXE bare-metal flow. Nodes appear in draining → allocated as the synthetic provisioner completes.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {clusters.map((c) => {
          const cn = nodes.filter((n) => n.clusterId === c.id);
          const cg = gpus.filter((g) => g.clusterId === c.id);
          const avg = cg.length ? cg.reduce((a, g) => a + g.utilPct, 0) / cg.length : 0;
          return (
            <Card key={c.id} className="group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-panel3 ring-1 ring-line"><Boxes className="h-5 w-5 text-nv" /></div>
                  <div>
                    <div className="flex items-center gap-2"><span className="font-mono text-base font-bold text-white">{c.name}</span><Badge status={c.status}>{c.status}</Badge></div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500"><MapPin className="h-3 w-3" />{c.region} · {c.scheduler} · {c.version}</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setEditing(c)} className="rounded-lg border border-line p-2 text-zinc-500 hover:border-nv/60 hover:text-nv" title="Configure cluster"><Settings2 className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Decommission ${c.name}? Running jobs will be cancelled.`)) removeCluster(c.id); }} className="rounded-lg border border-line p-2 text-zinc-500 hover:border-rose/60 hover:text-rose" title="Decommission cluster"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-400">{c.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(c.gpuMix).map(([m, n]) => (<span key={m} className="rounded-full border border-line bg-black/40 px-2 py-0.5 font-mono text-[11px] text-zinc-300">{m} × {fmtNum(n as number)}</span>))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[["GPUs", fmtNum(c.totalGPUs)], ["Nodes", String(c.totalNodes)], ["Avg util", `${avg.toFixed(0)}%`], ["Storage", `${c.storagePB}PB`]].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-black/30 py-2 ring-1 ring-line"><div className="font-mono text-sm font-bold text-white">{v}</div><div className="font-mono text-[10px] uppercase text-zinc-500">{l}</div></div>
                ))}
              </div>
              <div className="mt-2 font-mono text-[10px] text-zinc-600">{c.fabric} · {c.orchestration.join(" · ")}</div>
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-500"><Cpu className="h-3 w-3" />{cn.length} nodes sampled · {cg.length} GPUs live</span>
                <Link href={`/clusters/${c.id}`} className="rounded-lg border border-nv/40 bg-nv/10 px-3 py-1.5 text-xs font-semibold text-nv hover:bg-nv hover:text-black">Open detail →</Link>
              </div>
            </Card>
          );
        })}
      </div>
      {editing && <ClusterEditor cluster={clusters.find((c) => c.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
