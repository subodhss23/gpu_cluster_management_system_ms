"use client";
import { useMemo, useState } from "react";
import { Search, Zap, Thermometer, Ban, Play, Split, Settings2, Tag } from "lucide-react";
import { useFleet } from "@/lib/store";
import type { SimNode } from "@/lib/types";
import { fmtNum } from "@/lib/utils";
import { Card, SectionTitle, Badge, Bar } from "@/components/cards";
import { GpuHeatmap } from "@/components/charts";

const MIG_CAPABLE = ["H100", "H200", "A100-80GB", "A100-40GB", "L40S"];

export default function NodesPage() {
  const { nodes, gpus, clusters, setGpuPowerLimit, setMig, drainNode, undrainNode } = useFleet();
  const [q, setQ] = useState("");
  const [clusterF, setClusterF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = pickedId ? gpus.find((g) => g.id === pickedId) ?? null : null;
  const pickedNode = picked ? nodes.find((n) => n.id === picked.nodeId) ?? null : null;
  const [cap, setCap] = useState(400);
  const [inspTab, setInspTab] = useState<"inspect" | "config">("inspect");
  const pick = (id: string, powerLimit: number) => { setPickedId(id); setCap(powerLimit); };

  const filteredNodes = useMemo(() => nodes.filter((n) =>
    (clusterF === "all" || n.clusterId === clusterF) &&
    (statusF === "all" || n.status === statusF) &&
    (!q || n.hostname.toLowerCase().includes(q.toLowerCase()))
  ), [nodes, q, clusterF, statusF]);

  const filteredGpus = useMemo(() => gpus.filter((g) =>
    (clusterF === "all" || g.clusterId === clusterF) &&
    (statusF === "all" || g.status === statusF || (statusF === "allocated" && g.status === "busy")) &&
    (!q || g.id.toLowerCase().includes(q.toLowerCase()) || g.model.toLowerCase().includes(q.toLowerCase()))
  ), [gpus, q, clusterF, statusF]);

  return (
    <div className="space-y-6">
      <SectionTitle title="Nodes & GPUs — inventory" hint="Choose any GPU to inspect DCGM health, set power caps, or trace its job. Drain nodes like Slurm scontrol." />

      <Card>
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-black/40 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hostname, GPU id, model (e.g. H100)…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" />
          </div>
          <select value={clusterF} onChange={(e) => setClusterF(e.target.value)} className="rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">
            <option value="all">All clusters</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-lg border border-line bg-black/40 px-3 py-2 text-sm text-white">
            <option value="all">Any status</option>
            <option value="idle">idle</option>
            <option value="allocated">allocated</option>
            <option value="busy">busy (GPU)</option>
            <option value="drain">drain</option>
            <option value="throttled">throttled</option>
            <option value="down">down</option>
          </select>
          <span className="ml-auto font-mono text-xs text-zinc-500">{fmtNum(filteredNodes.length)} nodes · {fmtNum(filteredGpus.length)} GPUs</span>
        </div>
        <div className="mt-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">Fleet heatmap — click a cell to inspect</div>
          <GpuHeatmap gpus={filteredGpus.slice(0, 220)} onPick={(g) => pick(g.id, g.powerLimitW)} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {filteredNodes.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-white">{n.hostname}</span>
                <Badge status={n.status}>{n.status}</Badge>
                <span className="font-mono text-[11px] text-zinc-500">{n.clusterId} · {n.role} · {n.cpuModel}</span>
                <div className="ml-auto flex gap-1.5">
                  {n.status === "drain"
                    ? <button onClick={() => undrainNode(n.id)} className="flex items-center gap-1 rounded-lg border border-nv/40 px-2 py-1 text-[11px] text-nv"><Play className="h-3 w-3" />undrain</button>
                    : <button onClick={() => drainNode(n.id)} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-400 hover:border-amberx/60 hover:text-amberx"><Ban className="h-3 w-3" />drain</button>}
                </div>
              </div>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                <div><div className="mb-1 flex justify-between font-mono text-[10px] text-zinc-500"><span>CPU {n.cpuCores}c</span><span>{n.cpuUtil.toFixed(0)}%</span></div><Bar value={n.cpuUtil} color="bg-cyanx" /></div>
                <div><div className="mb-1 flex justify-between font-mono text-[10px] text-zinc-500"><span>MEM {fmtNum(Math.round(n.memUsedGB))}/{fmtNum(n.memTotalGB)}G</span><span>{Math.round((n.memUsedGB / n.memTotalGB) * 100)}%</span></div><Bar value={(n.memUsedGB / n.memTotalGB) * 100} color="bg-violetx" /></div>
                <div className="font-mono text-[11px] text-zinc-400">NET {n.networkGbps}Gb/s · SSD {n.storageTB}TB · {n.powerW}W · up {n.uptimeDays}d</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {n.gpuIds.map((gid) => {
                  const g = gpus.find((x) => x.id === gid);
                  if (!g) return null;
                  return (
                    <button key={gid} onClick={() => { if (g) pick(g.id, g.powerLimitW); }} className={`rounded-md border px-2 py-1 font-mono text-[10px] ${picked?.id === gid ? "border-nv text-nv" : "border-line text-zinc-400 hover:border-nv/50"}`}>
                      {g.model} · {g.utilPct.toFixed(0)}% · {g.tempC.toFixed(0)}°C
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <div>
          <Card className="sticky top-20">
            <SectionTitle title={inspTab === "inspect" ? "GPU inspector" : "Node configuration"} hint={picked ? `${picked.id}${pickedNode ? ` · on ${pickedNode.hostname}` : ""}` : "Select a GPU cell or chip above"} />
            <div className="mb-3 flex gap-1.5">
              {(["inspect", "config"] as const).map((t) => (
                <button key={t} onClick={() => setInspTab(t)} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase ${inspTab === t ? "bg-nv/15 text-nv ring-1 ring-nv/40" : "text-zinc-500 hover:text-white"}`}>
                  {t === "inspect" ? <Zap className="h-3 w-3" /> : <Settings2 className="h-3 w-3" />}{t === "inspect" ? "inspect" : "configure"}
                </button>
              ))}
            </div>
            {!picked && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([
                    ["idle", gpus.filter((g) => g.status === "idle").length, "text-zinc-300"],
                    ["busy", gpus.filter((g) => g.status === "busy" || g.status === "sliced").length, "text-nv"],
                    ["throttled", gpus.filter((g) => g.status === "throttled").length, "text-amberx"],
                    ["down", gpus.filter((g) => g.status === "down").length, "text-rose"]
                  ] as const).map(([l, v, c]) => (
                    <div key={l} className="rounded-lg bg-black/30 py-2 ring-1 ring-line"><div className={`font-mono text-base font-bold ${c}`}>{fmtNum(v)}</div><div className="font-mono text-[10px] uppercase text-zinc-500">{l}</div></div>
                  ))}
                </div>
                <div className="rounded-xl border border-line bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                  fleet sample · avg {(gpus.reduce((a, g) => a + g.tempC, 0) / Math.max(1, gpus.length)).toFixed(0)}°C · {(gpus.reduce((a, g) => a + g.powerW, 0) / 1000).toFixed(1)} kW drawn<br />
                  <span className="text-zinc-600">click any heatmap cell or GPU chip to inspect DCGM fields, MIG slices, power policy</span>
                </div>
              </div>
            )}
            {picked && inspTab === "config" && pickedNode && <NodeConfigForm key={pickedNode.id} node={pickedNode} />}
            {picked && inspTab === "inspect" && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><span className="font-mono font-bold text-white">{picked.model}</span><Badge status={picked.status}>{picked.status}</Badge></div>
                <div className="font-mono text-[11px] text-zinc-500">UUID {picked.uuid} · node {picked.nodeId} · job {picked.jobId ?? "—"}</div>
                {[
                  ["SM util", `${picked.utilPct.toFixed(1)}%`, picked.utilPct],
                  ["Memory", `${picked.memUsedGB.toFixed(0)} / ${picked.memTotalGB} GB`, (picked.memUsedGB / picked.memTotalGB) * 100],
                  ["Temperature", `${picked.tempC.toFixed(1)} °C`, (picked.tempC / 95) * 100],
                  ["Power", `${picked.powerW} / ${picked.powerLimitW} W`, (picked.powerW / picked.powerLimitW) * 100]
                ].map(([l, v, b]) => (
                  <div key={l as string}><div className="mb-1 flex justify-between text-xs"><span className="text-zinc-400">{l}</span><span className="font-mono text-white">{v}</span></div><Bar value={b as number} color={(b as number) > 90 ? "bg-amberx" : "bg-nv"} /></div>
                ))}
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="rounded-lg bg-black/30 p-2 ring-1 ring-line">SMCLK<br /><span className="text-sm text-white">{picked.smClockMHz} MHz</span></div>
                  <div className="rounded-lg bg-black/30 p-2 ring-1 ring-line">MEMCLK<br /><span className="text-sm text-white">{picked.memClockMHz} MHz</span></div>
                  <div className="rounded-lg bg-black/30 p-2 ring-1 ring-line">MIG<br /><span className="text-sm text-white">{picked.migEnabled ? `${picked.migSlicesUsed}/${picked.migSlicesTotal} slices` : "disabled"}</span></div>
                  <div className="rounded-lg bg-black/30 p-2 ring-1 ring-line">ECC<br /><span className="text-sm text-white">{picked.eccErrors} errors</span></div>
                </div>
                {picked.throttleReason && <div className="flex items-center gap-2 rounded-lg border border-amberx/40 bg-amberx/10 p-2 text-xs text-amberx"><Thermometer className="h-4 w-4" /> Throttled: {picked.throttleReason} — clocks capped at 1440 MHz</div>}
                <div>
                  <div className="mb-1 font-mono text-[11px] text-zinc-500">POWER LIMIT (DCGM POLICY) — {cap}W</div>
                  <input type="range" min={150} max={picked.powerLimitW + 100} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="w-full accent-[#76B900]" />
                  <button onClick={() => setGpuPowerLimit(picked.id, cap)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-nv py-2 text-xs font-bold text-black"><Zap className="h-3.5 w-3.5" /> Apply {cap}W cap</button>
                </div>
                <div className="rounded-xl border border-line bg-black/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-zinc-400"><Split className="h-3.5 w-3.5 text-violetx" /> MIG slice manager</span>
                    {MIG_CAPABLE.includes(picked.model) && (
                      <button onClick={() => setMig(picked.id, !picked.migEnabled, picked.migSlicesUsed)} className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${picked.migEnabled ? "border border-rose/50 text-rose" : "bg-nv text-black"}`}>
                        {picked.migEnabled ? "Disable MIG" : "Enable MIG"}
                      </button>
                    )}
                  </div>
                  {!MIG_CAPABLE.includes(picked.model) && (
                    <div className="text-xs leading-relaxed text-zinc-500">MIG not supported on {picked.model} — use Run:AI fractional time-slicing (0.25–1 GPU) for sharing instead.</div>
                  )}
                  {MIG_CAPABLE.includes(picked.model) && !picked.migEnabled && (
                    <div className="text-xs leading-relaxed text-zinc-500">Whole-GPU mode. Enable MIG to carve up to 7 isolated instances (1g/2g/3g/4g/7g profiles) for fractional tenants.</div>
                  )}
                  {picked.migEnabled && (
                    <div>
                      <div className="mb-2 grid grid-cols-7 gap-1">
                        {Array.from({ length: picked.migSlicesTotal }, (_, i) => (
                          <div key={i} title={`slice ${i + 1} ${i < picked.migSlicesUsed ? "allocated" : "free"}`} className={`flex h-9 items-center justify-center rounded-md font-mono text-[10px] ring-1 ${i < picked.migSlicesUsed ? "bg-violetx/80 text-white ring-violetx" : "bg-black/40 text-zinc-500 ring-line"}`}>
                            {i + 1}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setMig(picked.id, true, picked.migSlicesUsed - 1)} disabled={picked.migSlicesUsed <= 0} className="flex-1 rounded-lg border border-line py-1.5 font-mono text-sm text-white disabled:opacity-30">− release</button>
                        <span className="font-mono text-xs text-white">{picked.migSlicesUsed}/{picked.migSlicesTotal} carved</span>
                        <button onClick={() => setMig(picked.id, true, picked.migSlicesUsed + 1)} disabled={picked.migSlicesUsed >= picked.migSlicesTotal} className="flex-1 rounded-lg border border-nv/50 bg-nv/10 py-1.5 font-mono text-sm text-nv disabled:opacity-30">+ carve</button>
                      </div>
                      <div className="mt-2 text-[11px] leading-relaxed text-zinc-500">Each slice is hardware-isolated (SM + memory + errors). Fractional scheduler jobs land on free slices first.</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function NodeConfigForm({ node }: { node: SimNode }) {
  const { updateNode, drainNode, undrainNode } = useFleet();
  const [labels, setLabels] = useState(node.labels.join(", "));
  const [taints, setTaints] = useState(node.taints.join(", "));
  const [features, setFeatures] = useState(node.features);
  const apply = () => {
    updateNode(node.id, {
      labels: labels.split(",").map((s) => s.trim()).filter(Boolean),
      taints: taints.split(",").map((s) => s.trim()).filter(Boolean),
      features
    });
  };
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-white">{node.hostname}</span>
        <Badge status={node.status}>{node.status}</Badge>
      </div>
      <div className="font-mono text-[11px] text-zinc-500">{node.clusterId} · {node.role} · {node.gpuIds.length} GPUs attached</div>
      <label className="block text-xs text-zinc-400"><span className="flex items-center gap-1"><Tag className="h-3 w-3" /> K8s labels (comma-separated)</span>
        <input value={labels} onChange={(e) => setLabels(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-xs text-white" /></label>
      <label className="block text-xs text-zinc-400">Taints (comma-separated, <span className="font-mono">key=value:effect</span>)
        <input value={taints} onChange={(e) => setTaints(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-xs text-white" /></label>
      <label className="block text-xs text-zinc-400">Slurm Features / GRES string
        <input value={features} onChange={(e) => setFeatures(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-xs text-white" /></label>
      <div>
        <div className="mb-1 flex justify-between text-xs text-zinc-400"><span>Node power cap: <b className="font-mono text-white">{node.nodePowerCapW}W</b></span></div>
        <input type="range" min={400} max={9000} step={50} value={node.nodePowerCapW} onChange={(e) => updateNode(node.id, { nodePowerCapW: Number(e.target.value) })} className="w-full accent-[#76B900]" />
      </div>
      <label className="block text-xs text-zinc-400">Max concurrent jobs
        <input type="number" min={1} max={64} value={node.maxJobs} onChange={(e) => updateNode(node.id, { maxJobs: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-xs text-white" /></label>
      <button onClick={apply} className="w-full rounded-lg bg-nv py-2 text-xs font-bold text-black">Apply labels & features</button>
      <div className="flex gap-2">
        {node.status === "drain"
          ? <button onClick={() => undrainNode(node.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-nv/40 px-2 py-1.5 text-xs text-nv"><Play className="h-3 w-3" />Undrain (scontrol undrain)</button>
          : <button onClick={() => drainNode(node.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line px-2 py-1.5 text-xs text-zinc-300 hover:border-amberx/60"><Ban className="h-3 w-3" />Drain node</button>}
      </div>
      <div className="rounded-xl border border-line bg-black/30 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-500">
        $ scontrol update NodeName={node.hostname} Features="{node.features}"<br />
        $ kubectl label node {node.hostname} {node.labels.slice(0, 2).join(" ")}<br />
        # power cap {node.nodePowerCapW}W · {node.maxJobs} job slots
      </div>
    </div>
  );
}
