"use client";
import { useState } from "react";
import { BellRing, Plus, Trash2, CheckCheck, Power } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { AlertMetric, AlertRule } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { Card, SectionTitle, Badge } from "@/components/cards";

const METRICS: { id: AlertMetric; label: string; unit: string; hint: string }[] = [
  { id: "temp", label: "GPU temperature", unit: "°C", hint: "DCGM temp vs thermal policy" },
  { id: "util", label: "SM saturation", unit: "%", hint: "≥2 GPUs above threshold in scope" },
  { id: "power", label: "Power draw", unit: "W", hint: "per-GPU watts vs cap" },
  { id: "ecc", label: "ECC errors", unit: "count", hint: "any GPU at/above count" },
  { id: "queue", label: "Queued jobs", unit: "jobs", hint: "Slurm backlog depth in scope" }
];

const DEFAULT_THRESHOLD: Record<AlertMetric, number> = { temp: 83, util: 95, power: 650, ecc: 1, queue: 3 };

export default function AlertsPage() {
  const { rules, fired, clusters, addRule, removeRule, toggleRule, ackFired } = useFleet();
  const [form, setForm] = useState({ name: "Custom thermal watch", metric: "temp" as AlertMetric, threshold: 83, scope: "fleet", severity: "warn" as "warn" | "error" });
  const unacked = fired.filter((f) => !f.acked);

  const create = () => {
    const rule: AlertRule = {
      id: `rule-${Date.now().toString(36)}`,
      name: form.name || `${form.metric} > ${form.threshold}`,
      metric: form.metric, threshold: form.threshold, scope: form.scope,
      severity: form.severity, enabled: true, cooldownSec: 120
    };
    addRule(rule);
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Alerting — rules engine"
        hint="Prometheus-style thresholds evaluated against the live synthetic stream every 2.5s, with per-rule cooldowns. Firing alerts land here + in the activity timeline."
        right={<span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-xs text-zinc-300"><BellRing className="h-3.5 w-3.5 text-nv" />{unacked.length} unacked</span>}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Firing & history" hint="Newest first · acknowledge to clear the bell" />
          <div className="mb-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
            <span className="rounded-full border border-line px-2 py-0.5 text-zinc-400">{rules.filter((r) => r.enabled).length}/{rules.length} rules armed</span>
            {Array.from(new Set(rules.filter((r) => r.enabled).map((r) => r.metric))).map((m) => (
              <span key={m} className="rounded-full border border-nv/40 bg-nv/10 px-2 py-0.5 text-nv">{m}</span>
            ))}
            <span className="rounded-full border border-line px-2 py-0.5 text-zinc-500">cooldowns {Array.from(new Set(rules.map((r) => `${r.cooldownSec}s`))).join(" · ")}</span>
          </div>
          <div className="max-h-[480px] space-y-2 overflow-auto">
            {fired.length === 0 && <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-zinc-500">Quiet fleet — no rule has fired yet. Hot GPUs, power spikes and queue growth will appear here live.</div>}
            {fired.map((f) => (
              <div key={f.id} className={`rounded-xl border p-3 ${f.acked ? "border-line bg-black/20 opacity-60" : f.severity === "error" ? "border-rose/40 bg-rose/5" : "border-amberx/40 bg-amberx/5"}`}>
                <div className="flex items-center gap-2">
                  <Badge status={f.severity}>{f.severity}</Badge>
                  <span className="font-mono text-[11px] text-zinc-500">{f.ruleName} · {timeAgo(f.ts)}</span>
                  {!f.acked && <button onClick={() => ackFired(f.id)} className="ml-auto flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-300 hover:border-nv/60"><CheckCheck className="h-3 w-3" /> Ack</button>}
                  {f.acked && <span className="ml-auto font-mono text-[11px] text-zinc-600">acked</span>}
                </div>
                <div className="mt-1.5 text-xs leading-relaxed text-zinc-200">{f.message}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="New rule" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-400 sm:col-span-2">Rule name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-zinc-400">Metric<select value={form.metric} onChange={(e) => { const m = e.target.value as AlertMetric; setForm({ ...form, metric: m, threshold: DEFAULT_THRESHOLD[m] }); }} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">{METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <label className="text-xs text-zinc-400">Scope<select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white"><option value="fleet">fleet (all clusters)</option>{clusters.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label>
              <label className="text-xs text-zinc-400">Threshold ({METRICS.find((m) => m.id === form.metric)?.unit})<input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-sm text-white" /></label>
              <label className="text-xs text-zinc-400">Severity<select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as "warn" | "error" })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white"><option value="warn">warn</option><option value="error">error</option></select></label>
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-600">{METRICS.find((m) => m.id === form.metric)?.hint} · 120s cooldown after each fire</div>
            <button onClick={create} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-nv py-2 text-sm font-semibold text-black"><Plus className="h-4 w-4" /> Create rule</button>
          </Card>

          <Card>
            <SectionTitle title={`Rules (${rules.length})`} hint="Toggle to arm/disarm without deleting" />
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className={`flex items-center gap-2 rounded-xl border p-2.5 ${r.enabled ? "border-line bg-black/30" : "border-line bg-black/20 opacity-55"}`}>
                  <button onClick={() => toggleRule(r.id)} className={`rounded-lg p-1.5 ${r.enabled ? "bg-nv/15 text-nv" : "text-zinc-600"}`} title={r.enabled ? "Disarm" : "Arm"}><Power className="h-3.5 w-3.5" /></button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-white">{r.name}</div>
                    <div className="font-mono text-[10px] text-zinc-500">{r.metric} &gt; {r.threshold} · {r.scope} · {r.cooldownSec}s cooldown</div>
                  </div>
                  <Badge status={r.severity}>{r.severity}</Badge>
                  <button onClick={() => removeRule(r.id)} className="rounded-lg p-1.5 text-zinc-600 hover:text-rose" title="Delete rule"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
