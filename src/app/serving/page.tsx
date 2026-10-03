"use client";
import { useState } from "react";
import { ServerCog, Gauge, Plus, Trash2, Minus, SlidersHorizontal } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { AutoscalePolicy, ServeEndpoint } from "@/lib/types";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";

const ENGINES = ["vLLM", "SGLang", "TensorRT-LLM"] as const;

export default function ServingPage() {
  const { endpoints, clusters, addEndpoint } = useFleet();
  const [wizard, setWizard] = useState(false);
  const [policyFor, setPolicyFor] = useState<string | null>(null);
  const [form, setForm] = useState({ model: "phi-4-instruct", engine: "vLLM" as ServeEndpoint["engine"], clusterId: "vulcan-infer", gpus: 4, replicas: 2 });

  const deploy = () => {
    const id = `ep-${String(endpoints.length + 1).padStart(2, "0")}-${Date.now().toString(36)}`;
    addEndpoint({
      id, model: form.model, engine: form.engine, clusterId: form.clusterId, gpus: form.gpus,
      replicas: form.replicas, rps: 8 + Math.floor(Math.random() * 20), latencyP99Ms: 400 + Math.floor(Math.random() * 500),
      tokensPerSec: 900, status: "scaling", version: "latest",
      policy: { enabled: true, minReplicas: 1, maxReplicas: 8, targetRps: 30, targetP99Ms: 900 }
    });
    setWizard(false);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="AI Serving — GPUStack model endpoints"
        hint="vLLM · SGLang · TensorRT-LLM with live traffic, autoscale policies, and one-click deploy. Watch replicas move as RPS drifts."
        right={<button onClick={() => setWizard(!wizard)} className="flex items-center gap-1.5 rounded-lg bg-nv px-4 py-2 text-sm font-semibold text-black shadow-glow"><Plus className="h-4 w-4" /> Deploy endpoint</button>}
      />

      {wizard && (
        <Card className="border-nv/40">
          <div className="mb-3 font-mono text-xs tracking-widest text-nv">GASTACK DEPLOY WIZARD</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-zinc-400">Model<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
            <label className="text-xs text-zinc-400">Engine<select value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value as ServeEndpoint["engine"] })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">{ENGINES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Cluster<select value={form.clusterId} onChange={(e) => setForm({ ...form, clusterId: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white">{clusters.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label>
            <label className="text-xs text-zinc-400">GPUs<input type="number" min={1} max={16} value={form.gpus} onChange={(e) => setForm({ ...form, gpus: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
            <label className="text-xs text-zinc-400">Replicas<input type="number" min={1} max={12} value={form.replicas} onChange={(e) => setForm({ ...form, replicas: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={deploy} className="rounded-lg bg-nv px-4 py-2 text-sm font-semibold text-black">Deploy</button>
            <button onClick={() => setWizard(false)} className="rounded-lg border border-line px-4 py-2 text-sm text-zinc-300">Cancel</button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {endpoints.map((e) => (
          <EndpointCard key={e.id} e={e} policyFor={policyFor} setPolicyFor={setPolicyFor} />
        ))}
        <button onClick={() => { setWizard(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line p-6 text-zinc-500 transition hover:border-nv/60 hover:text-nv">
          <Plus className="h-8 w-8" />
          <span className="text-sm font-semibold">Deploy new endpoint</span>
          <span className="max-w-[220px] text-center font-mono text-[11px]">vLLM · SGLang · TensorRT-LLM on any cluster — totals: {endpoints.reduce((a, e) => a + e.replicas, 0)} replicas · {endpoints.reduce((a, e) => a + e.rps, 0)} rps fleet-wide</span>
        </button>
      </div>

      <Card>
        <SectionTitle title="Serving topology" hint="GPUStack routes across clusters — overflow from vulcan-infer spills to helios-prod TP slices" />
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {["edge-cache", "vulcan-infer (primary)", "helios-prod (overflow TP)", "atlas-train (batch)"].map((n, i, a) => (
            <span key={n} className="flex items-center gap-2">
              <span className={`rounded-lg border px-3 py-1.5 ${i === 1 ? "border-nv/60 bg-nv/10 text-nv" : "border-line text-zinc-400"}`}>{n}</span>
              {i < a.length - 1 && <span className="text-nv">→</span>}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EndpointCard({ e, policyFor, setPolicyFor }: { e: ServeEndpoint; policyFor: string | null; setPolicyFor: (id: string | null) => void }) {
  const { scaleEndpoint, removeEndpoint, updatePolicy } = useFleet();
  const p = e.policy;
    const perReplica = p ? Math.round((e.rps / Math.max(1, e.replicas))) : 0;
    const editing = policyFor === e.id;
    const [draft, setDraft] = useState<AutoscalePolicy>(p ?? { enabled: true, minReplicas: 1, maxReplicas: 8, targetRps: 30, targetP99Ms: 900 });
    return (
      <Card>
        <div className="flex items-center gap-2">
          <ServerCog className="h-5 w-5 text-nv" />
          <span className="flex-1 truncate font-mono text-sm font-bold text-white">{e.model}</span>
          <button onClick={() => { if (confirm(`Undeploy ${e.model}?`)) removeEndpoint(e.id); }} className="rounded-lg border border-line p-1.5 text-zinc-500 hover:border-rose/60 hover:text-rose" title="Undeploy"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge status={e.status}>{e.status}</Badge>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-cyanx">{e.engine} {e.version}</span>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-zinc-400">{e.clusterId}</span>
          {p?.enabled && <span className="rounded-full border border-nv/40 bg-nv/10 px-2 py-0.5 font-mono text-[10px] text-nv">autoscale {p.minReplicas}–{p.maxReplicas}</span>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["RPS", String(e.rps)], ["p99", `${e.latencyP99Ms}ms`], ["tok/s", String(e.tokensPerSec)]].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-black/30 py-2 ring-1 ring-line"><div className="font-mono text-sm font-bold text-white">{v}</div><div className="font-mono text-[10px] uppercase text-zinc-500">{l}</div></div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <div className="flex justify-between font-mono text-[11px] text-zinc-500"><span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{perReplica} rps/replica</span><span>{p ? Math.min(100, Math.round((e.rps / (p.targetRps * e.replicas)) * 100)) : Math.min(100, Math.round((e.rps / 60) * 100))}% of target</span></div>
          <Bar value={p ? Math.min(100, (e.rps / (p.targetRps * e.replicas)) * 100) : Math.min(100, (e.rps / 60) * 100)} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => scaleEndpoint(e.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-white hover:border-nv/60" title="Scale down"><Minus className="h-4 w-4" /></button>
          <span className="flex-1 text-center font-mono text-sm font-bold text-white">{e.replicas} <span className="text-[10px] font-normal text-zinc-500">replicas · {e.gpus} GPUs</span></span>
          <button onClick={() => scaleEndpoint(e.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-white hover:border-nv/60" title="Scale up"><Plus className="h-4 w-4" /></button>
          <button onClick={() => { setDraft(e.policy ?? { enabled: true, minReplicas: 1, maxReplicas: 8, targetRps: 30, targetP99Ms: 900 }); setPolicyFor(editing ? null : e.id); }} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-zinc-300 hover:border-nv/60" title="Autoscale policy"><SlidersHorizontal className="h-3.5 w-3.5" /> Policy</button>
        </div>
        {editing && (
          <div className="mt-3 space-y-2 rounded-xl border border-nv/30 bg-nv/5 p-3">
            <label className="flex items-center justify-between text-xs text-zinc-300">Autoscaler enabled<input type="checkbox" checked={draft.enabled} onChange={(ev) => setDraft({ ...draft, enabled: ev.target.checked })} className="h-4 w-4 accent-[#76B900]" /></label>
            {[["minReplicas", "Min replicas", 1, 12], ["maxReplicas", "Max replicas", 1, 16], ["targetRps", "Target total RPS", 5, 200], ["targetP99Ms", "Target p99 (ms)", 100, 3000]].map(([k, label, min, max]) => (
              <label key={k as string} className="block text-xs text-zinc-400">{label}: <b className="font-mono text-white">{draft[k as keyof AutoscalePolicy] as number}</b>
                <input type="range" min={min as number} max={max as number} value={draft[k as keyof AutoscalePolicy] as number} onChange={(ev) => setDraft({ ...draft, [k]: Number(ev.target.value) })} className="w-full accent-[#76B900]" />
              </label>
            ))}
            <button onClick={() => { updatePolicy(e.id, { ...draft, minReplicas: Math.min(draft.minReplicas, draft.maxReplicas) }); setPolicyFor(null); }} className="w-full rounded-lg bg-nv py-1.5 text-xs font-bold text-black">Save policy</button>
          </div>
        )}
        <div className="mt-2 font-mono text-[10px] text-zinc-600">$ gastack deploy --engine {e.engine.toLowerCase()} --model {e.model} --replicas {e.replicas}</div>
      </Card>
    );
  }
