"use client";
import { SlidersHorizontal, RotateCcw, Users, ListOrdered } from "lucide-react";
import { useFleet } from "@/lib/store";
import { DEFAULT_SCHED_POLICY, clusterFreeGpus } from "@/lib/sim";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";

export default function PoliciesPage() {
  const { schedPolicy, updateSchedPolicy, users, jobs, clusters } = useFleet();
  const p = schedPolicy;

  const queued = jobs
    .filter((j) => j.status === "queued")
    .map((j) => {
      const u = users.find((x) => x.name === j.user);
      const w = p.teamWeight[j.team] ?? 1;
      return { ...j, eff: Math.round((u?.priority ?? 50) * w) };
    })
    .sort((a, b) => b.eff - a.eff);

  const Toggle = ({ label, hint, on, onFlip }: { label: string; hint: string; on: boolean; onFlip: () => void }) => (
    <button onClick={onFlip} className="flex w-full items-center gap-3 rounded-xl border border-line bg-black/30 p-3 text-left hover:border-nv/50">
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-nv" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span><span className="block text-xs font-semibold text-white">{label}</span><span className="block text-[11px] text-zinc-500">{hint}</span></span>
      <span className="ml-auto font-mono text-[11px] text-zinc-400">{on ? "ON" : "OFF"}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Scheduling policy console"
        hint="Fleet-wide Slurm/K8s placement rules. Changes apply immediately to the launch wizard's limits, defaults and queue estimates."
        right={<button onClick={() => updateSchedPolicy({ ...DEFAULT_SCHED_POLICY })} className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-xs hover:border-nv/60"><RotateCcw className="h-3.5 w-3.5 text-nv" /> Factory defaults</button>}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <SectionTitle title="Global limits" hint="Hard clamps enforced by the launch wizard" />
            <div className="space-y-3">
              {([
                ["defaultWalltimeHrs", "Default walltime (hrs)", 1, 168],
                ["maxWalltimeHrs", "Max walltime (hrs)", 1, 720],
                ["maxGpusPerJob", "Max GPUs per job", 1, 128]
              ] as const).map(([k, label, min, max]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-zinc-400">{label}</span><b className="font-mono text-white">{p[k]}</b></div>
                  <input type="range" min={min} max={max} value={p[k]} onChange={(e) => updateSchedPolicy({ [k]: Number(e.target.value) })} className="w-full accent-[#76B900]" />
                </div>
              ))}
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-zinc-400">CPU overcommit ratio</span><b className="font-mono text-white">{p.overcommitCpu.toFixed(1)}×</b></div>
                <input type="range" min={1} max={4} step={0.5} value={p.overcommitCpu} onChange={(e) => updateSchedPolicy({ overcommitCpu: Number(e.target.value) })} className="w-full accent-[#22D3EE]" />
              </div>
              <label className="block text-xs text-zinc-400">Policy note (shown to submitters)<input value={p.note} onChange={(e) => updateSchedPolicy({ note: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white" /></label>
            </div>
          </Card>

          <Card>
            <SectionTitle title="Placement engines" />
            <div className="space-y-2">
              <Toggle label="Fairshare scheduling" hint="Priority decays with recent usage — heavy teams sink" on={p.fairshare} onFlip={() => updateSchedPolicy({ fairshare: !p.fairshare })} />
              <Toggle label="Backfill" hint="Small jobs jump ahead into idle gaps without delaying the head" on={p.backfill} onFlip={() => updateSchedPolicy({ backfill: !p.backfill })} />
              <Toggle label="Preemption" hint="High-priority jobs may suspend low-priority ones (intern QOS first)" on={p.preemption} onFlip={() => updateSchedPolicy({ preemption: !p.preemption })} />
            </div>
            <div className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600"># slurm.conf → SchedulerType=sched/{p.fairshare ? "fairshare" : "fifo"} Backfill={p.backfill ? "on" : "off"} Preempt={p.preemption ? "on" : "off"}</div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Team priority weights" hint="Effective priority = user priority × team weight" />
            <div className="space-y-2.5">
              {Object.entries(p.teamWeight).map(([t, w]) => (
                <div key={t}>
                  <div className="mb-1 flex justify-between font-mono text-[11px]"><span className="flex items-center gap-1 text-zinc-300"><Users className="h-3 w-3 text-zinc-500" />{t}</span><span className="text-nv">{(w as number).toFixed(2)}×</span></div>
                  <input type="range" min={0.1} max={2} step={0.05} value={w as number} onChange={(e) => updateSchedPolicy({ teamWeight: { ...p.teamWeight, [t]: Number(e.target.value) } })} className="w-full accent-[#76B900]" />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle title="Live queue order preview" hint="Queued jobs re-sorted by effective priority right now" right={<Badge status="running">{queued.length} queued</Badge>} />
            {queued.length === 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-zinc-500">Queue empty — free capacity per cluster right now:</div>
                {clusters.map((c) => {
                  const free = clusterFreeGpus(clusters, jobs, c.id);
                  return (
                    <div key={c.id}>
                      <div className="mb-0.5 flex justify-between font-mono text-[11px]"><span className="text-zinc-400">{c.id}</span><span className="text-nv">{free} / {c.totalGPUs} free</span></div>
                      <Bar value={(free / Math.max(1, c.totalGPUs)) * 100} />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-2">
              {queued.map((j, i) => (
                <div key={j.id} className="flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-panel3 font-mono text-[11px] text-zinc-400 ring-1 ring-line"><ListOrdered className="hidden" />{i + 1}</span>
                  <span className="flex-1 truncate font-mono text-xs text-zinc-200">{j.name}</span>
                  <span className="font-mono text-[11px] text-zinc-500">{j.team}</span>
                  <span className="font-mono text-xs font-bold text-nv">{j.eff}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[10px] text-zinc-600">$ squeue --sort=P --format="%i %u %T %Q" · ordered by effective priority{(p.backfill ? " + backfill windows" : "")}{p.preemption ? " (preemptible tail)" : ""}</div>
          </Card>

          <Card>
            <SectionTitle title="Effective user priorities" />
            <div className="space-y-1.5">
              {users.map((u) => {
                const eff = Math.round(u.priority * (p.teamWeight[u.team] ?? 1));
                return (
                  <div key={u.id}>
                    <div className="mb-0.5 flex justify-between font-mono text-[11px]"><span className="text-zinc-400">{u.name} <span className="text-zinc-600">({u.team})</span></span><span className="text-white">{u.priority} × {(p.teamWeight[u.team] ?? 1).toFixed(2)} = <b className="text-nv">{eff}</b></span></div>
                    <Bar value={Math.min(100, eff)} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500"><SlidersHorizontal className="h-4 w-4 text-nv" /> Policy snapshot — {p.note} · fairshare {p.fairshare ? "on" : "off"} · backfill {p.backfill ? "on" : "off"} · preemption {p.preemption ? "on" : "off"} · max {p.maxGpusPerJob} GPU / {p.maxWalltimeHrs}h per job</div>
      </Card>
    </div>
  );
}
