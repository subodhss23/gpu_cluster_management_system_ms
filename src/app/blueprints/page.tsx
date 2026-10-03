"use client";
import { useRef, useState } from "react";
import { LayoutTemplate, Plus, Trash2, Rocket, Download, Upload, Save } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { Blueprint } from "@/lib/types";
import { downloadJson, timeAgo, fmtNum } from "@/lib/utils";
import { Card, SectionTitle, Badge } from "@/components/cards";

export default function BlueprintsPage() {
  const { blueprints, clusters, saveBlueprint, addBlueprint, removeBlueprint, instantiateBlueprint } = useFleet();
  const [saveFor, setSaveFor] = useState<string>(clusters[0]?.id ?? "");
  const [bpName, setBpName] = useState("llm-train-blueprint");
  const [bpDesc, setBpDesc] = useState("H100 training factory template");
  const [launchFor, setLaunchFor] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(String(r.result));
        const list: Blueprint[] = Array.isArray(obj) ? obj : obj.blueprints ?? [obj];
        list.forEach((b) => {
          if (!b.cluster) throw new Error("not a blueprint");
          addBlueprint({ ...b, id: `bp-${Date.now().toString(36)}-${Math.floor(Math.random() * 999)}`, createdAt: new Date().toISOString(), partitions: b.partitions ?? [] });
        });
      } catch {
        alert("Could not parse blueprint JSON.");
      }
    };
    r.readAsText(f);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Configuration blueprints"
        hint="Snapshot any cluster (config + partitions) into a reusable template. Instantiate it, share it as JSON, or import a teammate's file."
        right={
          <div className="flex gap-2">
            <button onClick={() => downloadJson("helios-blueprints.json", { blueprints, exportedAt: new Date().toISOString() })} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs hover:border-nv/60"><Download className="h-3.5 w-3.5 text-nv" /> Export all</button>
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs hover:border-nv/60"><Upload className="h-3.5 w-3.5 text-nv" /> Import JSON</button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
          </div>
        }
      />

      <Card className="border-nv/40">
        <div className="mb-2 font-mono text-xs tracking-widest text-nv">SNAPSHOT A CLUSTER → TEMPLATE</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-zinc-400">Source cluster<select value={saveFor} onChange={(e) => setSaveFor(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">{clusters.map((c) => <option key={c.id} value={c.id}>{c.id} ({c.totalGPUs} GPUs)</option>)}</select></label>
          <label className="text-xs text-zinc-400">Blueprint name<input value={bpName} onChange={(e) => setBpName(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Description<input value={bpDesc} onChange={(e) => setBpDesc(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
          <div className="flex items-end"><button onClick={() => { if (saveFor && bpName.trim()) saveBlueprint(bpName.trim(), bpDesc, saveFor); }} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-nv py-2 text-sm font-bold text-black"><Save className="h-4 w-4" /> Save blueprint</button></div>
        </div>
      </Card>

      {blueprints.length === 0 && <Card>No blueprints yet — snapshot a cluster above, or import a JSON file. Try snapshotting helios-prod.</Card>}

      <div className="grid gap-4 md:grid-cols-2">
        {blueprints.map((b) => (
          <Card key={b.id}>
            <div className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-nv" />
              <span className="flex-1 truncate font-mono text-sm font-bold text-white">{b.name}</span>
              <button onClick={() => downloadJson(`${b.name}.blueprint.json`, b)} className="rounded-lg border border-line p-1.5 text-zinc-500 hover:text-nv" title="Download JSON"><Download className="h-3.5 w-3.5" /></button>
              <button onClick={() => { if (confirm(`Delete blueprint ${b.name}?`)) removeBlueprint(b.id); }} className="rounded-lg border border-line p-1.5 text-zinc-500 hover:text-rose" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-500">{b.description} · saved {timeAgo(b.createdAt)}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge status="info">{b.cluster.scheduler}</Badge>
              {Object.entries(b.cluster.gpuMix).map(([m, n]) => <span key={m} className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-zinc-300">{m} × {fmtNum(n as number)}</span>)}
              <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-zinc-400">{b.partitions.length} partitions</span>
            </div>
            <div className="mt-2 font-mono text-[10px] text-zinc-600">{b.cluster.fabric} · {b.cluster.storagePB}PB · cap {b.cluster.powerCapKW}kW</div>
            <div className="mt-3 flex gap-2">
              <input value={launchFor[b.id] ?? ""} onChange={(e) => setLaunchFor({ ...launchFor, [b.id]: e.target.value })} placeholder="new cluster name…" className="flex-1 rounded-lg border border-line bg-black/40 px-3 py-1.5 font-mono text-xs text-white outline-none placeholder:text-zinc-600" />
              <button onClick={() => { const n = (launchFor[b.id] ?? "").trim(); if (!n) { alert("Give the new cluster a name."); return; } instantiateBlueprint(b.id, n); setLaunchFor({ ...launchFor, [b.id]: "" }); }} className="flex items-center gap-1 rounded-lg bg-nv px-3 py-1.5 text-xs font-bold text-black"><Rocket className="h-3.5 w-3.5" /> Launch</button>
            </div>
            <div className="mt-2 flex items-center gap-1 font-mono text-[10px] text-zinc-600"><Plus className="h-3 w-3" />instantiates cluster + {b.partitions.length} partitions via the provisioner</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
