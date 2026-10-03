"use client";
import { useState } from "react";
import { Send, Stethoscope, Sparkles, Wrench } from "lucide-react";
import { useFleet } from "@/lib/store";
import { Card, SectionTitle, Badge } from "@/components/cards";

interface Msg { role: "user" | "agent"; text: string }

function agentReply(q: string, ctx: { throttled: number; down: number; queued: number; hotId: string }): string {
  const s = q.toLowerCase();
  if (s.includes("hot") || s.includes("temp") || s.includes("throttl")) return `Hottest sampled GPU is ${ctx.hotId} — DCGM reports SW_THERMAL, SM clocks capped 1980→1440MHz. Recommendation: 1) lower power cap to 300W on vulcan-g06, 2) migrate job-7003 replica to helios-prod overflow, 3) re-run dcgmi diag -r 2. ${ctx.throttled} GPU(s) currently throttled fleet-wide.`;
  if (s.includes("fail") || s.includes("xid") || s.includes("nccl")) return `job-7010 failed with NCCL timeout on helios-prod-g14 (XID 79, GPU fell off bus). Checkpoint ckpt-step-9100 is intact. Actions taken in sim: node set to drain, requeue suggested with --exclude=helios-prod-g14. Run: sbatch --exclude=helios-prod-g14 job.sbatch. ${ctx.down} GPU(s) down.`;
  if (s.includes("queue") || s.includes("pend") || s.includes("slurm")) return `Slurm queue: ${ctx.queued} pending. Top blocker is 8×A100-80GB on atlas-train (est. +42m). Options: preempt priority-20 intern job, burst to edge-dev fractional slices, or raise QOS. I can draft the scontrol update if you want.`;
  if (s.includes("power") || s.includes("cap") || s.includes("energy")) return `Fleet is drawing within caps. To save ~12% energy: cap idle RTX4090 nodes at 200W, enable MIG sleep on 6 unused A100 slices, and shift diffusion-xl-render to 0.25 fractional share. No perf impact expected under 65% util.`;
  if (s.includes("serv") || s.includes("vllm") || s.includes("latency") || s.includes("p99")) return `vLLM endpoint ep-01 (llama-3-70b) is at 48 RPS, p99 890ms across 6 replicas. If p99 > 1s for 5m, GPUStack will autoscale to 8 replicas on vulcan-infer, overflowing to helios-prod. SGLang cache-hit is 82% — healthy.`;
  if (s.includes("hello") || s.includes("what") || s.includes("help")) return `I am the AI Factory Operations Agent (simulated). Ask me about: hot GPUs, failed jobs / XID errors, Slurm queue waits, power capping, vLLM latency, or provisioning. Try the quick prompts below.`;
  return `Correlated across DCGM + Slurm + K8s: nothing critical beyond the known ${ctx.throttled} throttled / ${ctx.down} down GPUs and ${ctx.queued} queued jobs. Give me a symptom (e.g. "why is p99 high?" or "which node failed?") and I will trace nodes, jobs and suggested scontrol/kubectl fixes.`;
}

const QUICK = ["Why is a GPU throttled?", "Why did job-7010 fail?", "How long is the Slurm queue?", "How do I cut power 12%?", "Is vLLM latency healthy?"];

export default function DiagnosticsPage() {
  const { gpus, jobs, pushActivity } = useFleet();
  const throttled = gpus.filter((g) => g.status === "throttled").length;
  const down = gpus.filter((g) => g.status === "down").length;
  const queued = jobs.filter((j) => j.status === "queued").length;
  const hotId = [...gpus].sort((a, b) => b.tempC - a.tempC)[0]?.id ?? "n/a";
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "agent", text: "Helios Operations Agent online. I watch DCGM health, Slurm queues and GPUStack serving. Ask me anything — e.g. “Why is a GPU throttled?”" }]);
  const [input, setInput] = useState("");
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [diagRunning, setDiagRunning] = useState(false);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "agent", text: agentReply(q, { throttled, down, queued, hotId }) }]);
    setInput("");
  };

  const runDiag = () => {
    setDiagRunning(true);
    setDiagLog([]);
    const lines = ["$ dcgmi discovery -l", "→ 8 GPUs found (L40S) on vulcan-g06", "$ dcgmi diag -r 2", "→ [PASS] sm_stress · [PASS] mem_bandwidth · [WARN] thermals: GPU-3 87°C", "$ dcgmi health -s", "→ XID 0 clean except known helios-prod-g14 XID 79", "$ nvvs --target helios-prod-g14", "→ PCIe link degraded x8 (expect x16) — reseat riser at next maintenance", "verdict: 1 node needs hands-on, rest healthy"];
    lines.forEach((l, i) => setTimeout(() => { setDiagLog((d) => [...d, l]); if (i === lines.length - 1) { setDiagRunning(false); pushActivity({ type: "gpu", severity: "info", actor: "operator", message: "DCGM level-2 diagnostics completed via console", clusterId: "vulcan-infer" }); } }, 450 * (i + 1)));
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="Diagnostics — AI Factory Operations Agent" hint="Conversational triage over synthetic DCGM + Slurm + K8s state, plus one-click DCGM diagnostics." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-nv" /><span className="font-mono text-xs tracking-widest text-nv">CONVERSATIONAL DIAGNOSTICS (SIMULATED)</span><span className="ml-auto"><Badge status="running">online</Badge></span></div>
          <div className="h-80 space-y-2.5 overflow-auto rounded-xl bg-black/40 p-3">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === "user" ? "ml-auto bg-nv/20 text-white ring-1 ring-nv/40" : "bg-panel3 text-zinc-200 ring-1 ring-line"}`}>{m.text}</div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">{QUICK.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-zinc-400 hover:border-nv/60 hover:text-nv">{q}</button>)}</div>
          <div className="mt-2 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask: which node failed? why p99 high?…" className="flex-1 rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600" />
            <button onClick={() => send(input)} className="rounded-lg bg-nv px-4 py-2 text-sm font-bold text-black"><Send className="h-4 w-4" /></button>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <SectionTitle title="Fleet signals" hint="What the agent is watching right now" />
            <div className="grid grid-cols-3 gap-2 text-center">
              {([
                ["throttled", gpus.filter((g) => g.status === "throttled").length, "text-amberx"],
                ["down", gpus.filter((g) => g.status === "down").length, "text-rose"],
                ["queued", jobs.filter((j) => j.status === "queued").length, "text-nv"]
              ] as const).map(([l, v, c]) => (
                <div key={l} className="rounded-lg bg-black/30 py-2 ring-1 ring-line"><div className={`font-mono text-base font-bold ${c}`}>{v}</div><div className="font-mono text-[10px] uppercase text-zinc-500">{l}</div></div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">hottest: {(hotId ?? "n/a")} · ask the agent about any of these</div>
          </Card>
          <Card>
            <div className="mb-2 flex items-center gap-2"><Stethoscope className="h-4 w-4 text-nv" /><span className="text-sm font-semibold text-white">DCGM diagnostics runner</span></div>
            <p className="text-xs text-zinc-500">Emulates <span className="font-mono">dcgmi diag -r 2</span> + NVVS across the sampled fleet. Takes ~3s.</p>
            <button onClick={runDiag} disabled={diagRunning} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-panel3 py-2.5 text-sm font-semibold text-white ring-1 ring-line hover:ring-nv/60 disabled:opacity-50"><Wrench className="h-4 w-4 text-nv" />{diagRunning ? "Running level-2 diagnostics…" : "Run DCGM level-2 diagnostics"}</button>
            {diagLog.length > 0 && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-nv">{diagLog.join("\n")}</pre>}
          </Card>
          <Card>
            <SectionTitle title="Known issues" />
            <div className="space-y-2 text-xs">
              <div className="rounded-xl border border-rose/30 bg-rose/5 p-3 text-zinc-300"><b className="text-rose">XID 79</b> — helios-prod-g14 H100-5 fell off bus · job-7010 requeue pending · node draining</div>
              <div className="rounded-xl border border-amberx/30 bg-amberx/5 p-3 text-zinc-300"><b className="text-amberx">SW_THERMAL</b> — vulcan-g06 L40S-3 at 87°C · clocks capped · suggest 300W power cap</div>
              <div className="rounded-xl border border-line bg-black/30 p-3 text-zinc-400"><b className="text-cyanx">Provisioning</b> — edge-dev 2× RTX4090 nodes at 68% PXE · ETA ~25m</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
