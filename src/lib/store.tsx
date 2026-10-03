"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityEvent, AlertRule, AutoscalePolicy, Blueprint, CanaryRelease, Cluster, FiredAlert, PartitionCfg, SchedPolicy, ServeEndpoint, SimGpu, SimJob, SimNode, SimUser, TelemetryPoint } from "./types";
import { allocateGpus, defaultPartitions, effPriorityOf, generateFleet, pxeStageFor, releaseJobGpus, seededRand, seedHistory, snapshotTelemetry, tickGpu, clustersSeedTyped, DEFAULT_SCHED_POLICY, type FleetSeed } from "./sim";
import { track } from "./analytics";
import clustersSeed from "@/data/clusters.json";
import usersSeed from "@/data/users.json";
import jobsSeed from "@/data/jobs.json";
import endpointsSeed from "@/data/endpoints.json";
import activitySeed from "@/data/activity.json";
import alertRulesSeed from "@/data/alert-rules.json";

interface FleetState {
  clusters: Cluster[];
  nodes: SimNode[];
  gpus: SimGpu[];
  users: SimUser[];
  jobs: SimJob[];
  endpoints: ServeEndpoint[];
  activity: ActivityEvent[];
  rules: AlertRule[];
  fired: FiredAlert[];
  partitions: PartitionCfg[];
  schedPolicy: SchedPolicy;
  blueprints: Blueprint[];
  history: TelemetryPoint[];
  clusterHistory: Record<string, TelemetryPoint[]>;
  live: boolean;
  tick: number;
  toggleLive: () => void;
  simSpeed: number;
  simHours: number;
  setSimSpeed: (x: number) => void;
  addCluster: (c: Cluster) => void;
  updateCluster: (id: string, patch: Partial<Cluster>) => void;
  removeCluster: (id: string) => void;
  updateNode: (id: string, patch: Partial<SimNode>) => void;
  launchJob: (j: SimJob) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  preemptJobs: (clusterId: string, count: number) => void;
  reimageNode: (nodeId: string) => void;
  setGpuPowerLimit: (gpuId: string, watts: number) => void;
  setMig: (gpuId: string, enabled: boolean, usedSlices: number) => void;
  drainNode: (nodeId: string) => void;
  undrainNode: (nodeId: string) => void;
  addEndpoint: (e: ServeEndpoint) => void;
  removeEndpoint: (id: string) => void;
  scaleEndpoint: (id: string, delta: number) => void;
  updatePolicy: (id: string, policy: AutoscalePolicy) => void;
  startCanary: (id: string, version: string, trafficPct: number) => void;
  setCanaryTraffic: (id: string, trafficPct: number) => void;
  promoteCanary: (id: string) => void;
  rollbackCanary: (id: string) => void;
  addRule: (r: AlertRule) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string) => void;
  ackFired: (id: string) => void;
  addPartition: (p: PartitionCfg) => void;
  updatePartition: (id: string, patch: Partial<PartitionCfg>) => void;
  removePartition: (id: string) => void;
  updateSchedPolicy: (patch: Partial<SchedPolicy>) => void;
  saveBlueprint: (name: string, description: string, clusterId: string) => void;
  addBlueprint: (b: Blueprint) => void;
  removeBlueprint: (id: string) => void;
  instantiateBlueprint: (id: string, newName: string) => void;
  resetDemo: () => void;
  pushActivity: (e: Omit<ActivityEvent, "id" | "ts">) => void;
}

const FleetCtx = createContext<FleetState | null>(null);
const LS_KEY = "helios-fleet-v2";

interface Saved {
  clusters?: Cluster[];
  jobs?: SimJob[];
  users?: SimUser[];
  endpoints?: ServeEndpoint[];
  rules?: AlertRule[];
  nodes?: SimNode[];
  gpus?: SimGpu[];
  partitions?: PartitionCfg[];
  schedPolicy?: SchedPolicy;
  blueprints?: Blueprint[];
}

function loadLocal(): Saved | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function FleetProvider({ children }: { children: React.ReactNode }) {
  // deterministic boot: seed running jobs are pinned to sampled GPUs
  const [initial] = useState((): { fleet: FleetSeed; jobs: SimJob[] } => {
    const fleet = generateFleet(clustersSeedTyped);
    let gpus = fleet.gpus;
    const jobs = (jobsSeed as unknown as SimJob[]).map((j) => {
      if (j.status !== "running") return j;
      const r = allocateGpus(gpus, j.clusterId, Math.min(j.gpusRequested, 64), j.id);
      gpus = r.gpus;
      return { ...j, gpuIds: r.ids };
    });
    return { fleet: { nodes: fleet.nodes, gpus }, jobs };
  });
  const [clusters, setClusters] = useState<Cluster[]>(clustersSeedTyped);
  const [jobs, setJobs] = useState<SimJob[]>(initial.jobs);
  const [users, setUsers] = useState<SimUser[]>(usersSeed as unknown as SimUser[]);
  const [endpoints, setEndpoints] = useState<ServeEndpoint[]>(endpointsSeed as unknown as ServeEndpoint[]);
  const [activity, setActivity] = useState<ActivityEvent[]>(activitySeed as unknown as ActivityEvent[]);
  const [rules, setRules] = useState<AlertRule[]>(alertRulesSeed as unknown as AlertRule[]);
  const [fired, setFired] = useState<FiredAlert[]>([]);
  const [partitions, setPartitions] = useState<PartitionCfg[]>(() => clustersSeedTyped.flatMap(defaultPartitions));
  const [schedPolicy, setSchedPolicy] = useState<SchedPolicy>(DEFAULT_SCHED_POLICY);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [fleet, setFleet] = useState<FleetSeed>(initial.fleet);
  const [history, setHistory] = useState<TelemetryPoint[]>(() =>
    seedHistory(initial.fleet.gpus, initial.jobs.filter((j) => j.status === "running").length)
  );
  const [clusterHistory, setClusterHistory] = useState<Record<string, TelemetryPoint[]>>(() => {
    const out: Record<string, TelemetryPoint[]> = {};
    const by: Record<string, SimGpu[]> = {};
    for (const g of initial.fleet.gpus) { (by[g.clusterId] = by[g.clusterId] || []).push(g); }
    for (const cid of Object.keys(by)) {
      out[cid] = seedHistory(by[cid], initial.jobs.filter((j) => j.clusterId === cid && j.status === "running").length);
    }
    return out;
  });
  const [live, setLive] = useState(true);
  const [tick, setTick] = useState(0);
  const [simSpeed, setSimSpeedState] = useState(720);
  const [simHours, setSimHours] = useState(0);
  const randRef = useRef(seededRand(Date.now() % 100000));
  const lastFiredRef = useRef<Record<string, number>>({});

  // refs so the interval always sees fresh state without re-subscribing
  const gpusRef = useRef<SimGpu[]>(fleet.gpus);
  const endpointsRef = useRef<ServeEndpoint[]>(endpoints);
  const jobsRef = useRef<SimJob[]>(jobs);
  const rulesRef = useRef<AlertRule[]>(rules);
  const clustersRef = useRef<Cluster[]>(clusters);
  const usersRef = useRef<SimUser[]>(users);
  const schedPolicyRef = useRef<SchedPolicy>(schedPolicy);
  const simSpeedRef = useRef<number>(simSpeed);
  const nodesRef = useRef<SimNode[]>(fleet.nodes);
  useEffect(() => { gpusRef.current = fleet.gpus; }, [fleet.gpus]);
  useEffect(() => { endpointsRef.current = endpoints; }, [endpoints]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  useEffect(() => { rulesRef.current = rules; }, [rules]);
  useEffect(() => { clustersRef.current = clusters; }, [clusters]);
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { schedPolicyRef.current = schedPolicy; }, [schedPolicy]);
  useEffect(() => { simSpeedRef.current = simSpeed; }, [simSpeed]);
  useEffect(() => { nodesRef.current = fleet.nodes; }, [fleet.nodes]);

  // restore user-created clusters/jobs/endpoints/rules from localStorage
  useEffect(() => {
    const saved = loadLocal();
    if (saved?.clusters?.length) {
      setClusters(saved.clusters);
      if (saved.nodes?.length && saved.gpus?.length) {
        setFleet({ nodes: saved.nodes, gpus: saved.gpus });
      } else {
        setFleet(generateFleet(saved.clusters));
      }
      // seed starter partitions for any cluster that lacks them (e.g. restored customs)
      setPartitions((ps) => {
        const have = new Set(ps.map((p) => p.clusterId));
        const missing = saved.clusters!.filter((c) => !have.has(c.id)).flatMap(defaultPartitions);
        return [...ps, ...missing];
      });
    }
    if (saved?.jobs?.length) setJobs(saved.jobs);
    if (saved?.users?.length) setUsers(saved.users);
    if (saved?.endpoints?.length) setEndpoints(saved.endpoints);
    if (saved?.rules?.length) setRules(saved.rules);
    if (saved?.partitions?.length) setPartitions(saved.partitions);
    if (saved?.schedPolicy) setSchedPolicy(saved.schedPolicy);
    if (saved?.blueprints?.length) setBlueprints(saved.blueprints);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ clusters, jobs, users, endpoints, rules, nodes: fleet.nodes, gpus: fleet.gpus, partitions, schedPolicy, blueprints }));
    } catch { /* ignore (quota) */ }
  }, [clusters, jobs, users, endpoints, rules, fleet, partitions, schedPolicy, blueprints]);

  // live simulation tick every 2.5s: job lifecycle + scheduler loop +
  // DCGM telemetry + serving autoscale + alert-rule evaluation
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      const rand = randRef.current;
      const now = Date.now();
      const simH = (simSpeedRef.current * 2.5) / 3600;
      const snap = jobsRef.current;
      const cs = clustersRef.current;
      const us = usersRef.current;
      const pol = schedPolicyRef.current;

      // — completions: running jobs whose walltime expires this tick —
      const completed: SimJob[] = snap
        .filter((j) => j.status === "running" && j.elapsedHrs + simH >= j.walltimeHrs)
        .map((j) => ({ ...j, status: "completed" as const, progress: 100, elapsedHrs: j.walltimeHrs }));

      // — scheduler loop: start queued jobs by effective priority while GPUs free —
      const effOf = (j: SimJob) => effPriorityOf(j, us, pol.teamWeight);
      const freeFor = (clusterId: string, extraRunning: SimJob[]) => {
        const total = cs.find((c) => c.id === clusterId)?.totalGPUs ?? 0;
        const used = snap
          .filter((j) => j.clusterId === clusterId && j.status === "running" && !completed.some((c) => c.id === j.id))
          .concat(extraRunning)
          .reduce((a, j) => a + j.gpusRequested, 0);
        return total - used;
      };
      const toStart: SimJob[] = [];
      for (const q of snap.filter((j) => j.status === "queued").sort((a, b) => effOf(b) - effOf(a))) {
        if (q.gpusRequested <= freeFor(q.clusterId, toStart)) {
          toStart.push({
            ...q,
            status: "running",
            startedAt: new Date(now).toISOString(),
            logs: `[sched] placed on ${q.clusterId}${q.partition ? `:${q.partition}` : ""} · ${q.gpusRequested} GPUs · eff-pri ${Math.round(effOf(q))} · warming NCCL…`
          });
        }
      }

      // — pin GPUs for starters, release for completions, jitter the rest —
      let gpus = gpusRef.current;
      for (const c of completed) gpus = releaseJobGpus(gpus, c.id);
      const pinIds: Record<string, string[]> = {};
      for (const s of toStart) {
        const r = allocateGpus(gpus, s.clusterId, Math.min(s.gpusRequested, 64), s.id);
        gpus = r.gpus;
        pinIds[s.id] = r.ids;
      }
      const ticked = gpus.map((g) => tickGpu(g, rand));

      // — PXE pipeline: advance provisioning nodes toward ready —
      const pxeDone: string[] = [];
      const nextNodes = nodesRef.current.map((n) => {
        if (n.status !== "provisioning") return n;
        const prog = Math.min(100, (n.pxeProgress ?? 50) + 6 + rand() * 14);
        if (prog >= 100) {
          pxeDone.push(n.hostname);
          return { ...n, status: "idle" as const, pxeStage: "ready", pxeProgress: 100 };
        }
        return { ...n, pxeProgress: Math.round(prog), pxeStage: pxeStageFor(prog) };
      });
      setFleet({ nodes: nextNodes, gpus: ticked });
      if (pxeDone.length) {
        setActivity((a) => [
          ...pxeDone.map((h) => ({ id: `ev-${now}-pxe-${h}`, ts: new Date().toISOString(), type: "node" as const, severity: "success" as const, actor: "provisioner", message: `${h} finished provisioning (burn-in passed) — ready for scheduling` })),
          ...a
        ].slice(0, 120));
      }
      setTick((t) => t + 1);
      setSimHours((h) => h + simH);

      // — rolling chart history: one live point per tick (fleet + per-cluster) —
      const runningFinal = snap.filter((j) => j.status === "running" && !completed.some((c) => c.id === j.id)).length + toStart.length;
      setHistory((h) => [...h, snapshotTelemetry(ticked, runningFinal)].slice(-60));
      setClusterHistory((prev) => {
        const next: Record<string, TelemetryPoint[]> = { ...prev };
        const by: Record<string, SimGpu[]> = {};
        for (const g of ticked) { (by[g.clusterId] = by[g.clusterId] || []).push(g); }
        for (const cid of Object.keys(by)) {
          const rj = snap.filter((j) => j.clusterId === cid && j.status === "running" && !completed.some((c) => c.id === j.id)).length
            + toStart.filter((s) => s.clusterId === cid).length;
          next[cid] = [...(next[cid] || []), snapshotTelemetry(by[cid], rj)].slice(-60);
        }
        return next;
      });

      // — advance running jobs (progress derived from elapsed/walltime) —
      const doneIds = new Set(completed.map((j) => j.id));
      const startMap = new Map(toStart.map((s) => [s.id, { ...s, gpuIds: pinIds[s.id] ?? [] }]));
      setJobs(
        snap.map((j) => {
          if (doneIds.has(j.id)) return completed.find((c) => c.id === j.id)!;
          if (startMap.has(j.id)) return startMap.get(j.id)!;
          if (j.status !== "running") return j;
          const elapsed = j.elapsedHrs + simH;
          return { ...j, elapsedHrs: elapsed, progress: Math.min(99.9, (elapsed / j.walltimeHrs) * 100) };
        })
      );

      // — quota accounting + timeline for lifecycle events —
      if (completed.length || toStart.length) {
        setUsers((prev) =>
          prev.map((u) => {
            let d = u;
            for (const c of completed) {
              if (c.user === u.name) {
                d = {
                  ...d,
                  usedGPUs: Math.max(0, d.usedGPUs - c.gpusRequested),
                  usedCpuCores: Math.max(0, d.usedCpuCores - c.cpuCores),
                  usedMemGB: Math.max(0, d.usedMemGB - c.memGB),
                  activeJobs: Math.max(0, d.activeJobs - 1)
                };
              }
            }
            return d;
          })
        );
        setActivity((a) => [
          ...completed.map((c) => ({ id: `ev-${now}-done-${c.id}`, ts: new Date().toISOString(), type: "job" as const, severity: "success" as const, actor: "slurmctld", message: `${c.name} COMPLETED after ${c.walltimeHrs}h walltime — ${c.gpusRequested} GPUs released`, clusterId: c.clusterId })),
          ...toStart.map((s) => ({ id: `ev-${now}-start-${s.id}`, ts: new Date().toISOString(), type: "job" as const, severity: "success" as const, actor: "slurmctld", message: `${s.name} STARTED on ${s.clusterId} (${s.gpusRequested} GPUs pinned)`, clusterId: s.clusterId })),
          ...a
        ].slice(0, 120));
      }

      // GPUStack-style autoscale: jitter traffic, grow/shrink within policy
      const eps = endpointsRef.current;
      let changed: ServeEndpoint[] | null = null;
      const next = eps.map((e) => {
        const p = e.policy;
        const rps = Math.max(1, Math.round(e.rps + (rand() - 0.48) * e.rps * 0.09));
        let replicas = e.replicas;
        let scaled = false;
        if (p?.enabled) {
          if (rps > p.targetRps * 1.15 && replicas < p.maxReplicas) { replicas++; scaled = true; }
          else if (rps < p.targetRps * 0.45 && replicas > p.minReplicas) { replicas--; scaled = true; }
        }
        const load = rps / Math.max(1, replicas);
        const p99 = Math.max(80, Math.round(e.latencyP99Ms + (rand() - 0.5) * 50 + (p && load > p.targetRps ? 30 : -18)));
        const tps = Math.round(rps * (16 + rand() * 9));
        if (scaled || rps !== e.rps) {
          if (scaled) changed = [...(changed ?? []), { ...e, replicas }];
          return { ...e, rps, replicas, latencyP99Ms: p99, tokensPerSec: tps, status: (scaled ? "scaling" : e.status === "scaling" ? "serving" : e.status) as ServeEndpoint["status"] };
        }
        return e.rps === rps ? e : { ...e, rps, latencyP99Ms: p99, tokensPerSec: tps };
      });
      setEndpoints(next);
      if (changed) {
        const list = changed as ServeEndpoint[];
        // find previous replicas for the message
        setActivity((a) => [
          ...list.map((c) => {
            const prev = eps.find((x) => x.id === c.id);
            const dir = c.replicas > (prev?.replicas ?? c.replicas) ? "up" : "down";
            return { id: `ev-${now}-${c.id}`, ts: new Date().toISOString(), type: "job" as const, severity: "success" as const, actor: "GPUStack", message: `${c.model} autoscaled ${dir} → ${c.replicas} replicas (rps ${c.rps})`, clusterId: c.clusterId };
          }),
          ...a
        ].slice(0, 120));
      }

      // alert rules with per-rule cooldown
      const gs = gpusRef.current;
      const js = jobsRef.current;
      for (const r of rulesRef.current) {
        if (!r.enabled) continue;
        if (now - (lastFiredRef.current[r.id] ?? 0) < r.cooldownSec * 1000) continue;
        const inScope = (g: SimGpu) => r.scope === "fleet" || g.clusterId === r.scope;
        let msg: string | null = null;
        let cid: string | undefined;
        if (r.metric === "temp") {
          const hot = gs.filter(inScope).reduce<SimGpu | null>((a, g) => (!a || g.tempC > a.tempC ? g : a), null);
          if (hot && hot.tempC > r.threshold) { msg = `${hot.id} temp ${hot.tempC.toFixed(1)}°C exceeds ${r.threshold}°C policy`; cid = hot.clusterId; }
        } else if (r.metric === "util") {
          const sat = gs.filter((g) => inScope(g) && g.utilPct > r.threshold);
          if (sat.length >= 2) { msg = `${sat.length} GPUs above ${r.threshold}% SM util in ${r.scope} (peak ${sat[0].id} ${sat[0].utilPct.toFixed(0)}%)`; cid = sat[0].clusterId; }
        } else if (r.metric === "power") {
          const over = gs.filter((g) => inScope(g) && g.powerW > r.threshold);
          if (over.length) { msg = `${over[0].id} drawing ${over[0].powerW}W over ${r.threshold}W cap`; cid = over[0].clusterId; }
        } else if (r.metric === "ecc") {
          const bad = gs.filter((g) => inScope(g) && g.eccErrors >= r.threshold);
          if (bad.length) { msg = `${bad[0].id} reports ${bad[0].eccErrors} ECC errors`; cid = bad[0].clusterId; }
        } else if (r.metric === "queue") {
          const q = js.filter((j) => j.status === "queued" && (r.scope === "fleet" || j.clusterId === r.scope)).length;
          if (q > r.threshold) { msg = `${q} jobs queued on ${r.scope} (threshold ${r.threshold}) — consider preemption or burst`; cid = r.scope === "fleet" ? undefined : r.scope; }
        }
        if (msg) {
          lastFiredRef.current[r.id] = now;
          const fid = `fa-${now}-${r.id}`;
          setFired((f) => [{ id: fid, ruleId: r.id, ruleName: r.name, ts: new Date().toISOString(), severity: r.severity, message: msg as string, clusterId: cid, acked: false }, ...f].slice(0, 60));
          setActivity((a) => [{ id: `ev-${fid}`, ts: new Date().toISOString(), type: "alert" as const, severity: r.severity, actor: "alertmanager", message: `[${r.name}] ${msg}`, clusterId: cid }, ...a].slice(0, 120));
        }
      }
    }, 2500);
    return () => clearInterval(id);
  }, [live]);

  const pushActivity = useCallback((e: Omit<ActivityEvent, "id" | "ts">) => {
    setActivity((a) => [
      { ...e, id: `ev-${Date.now()}`, ts: new Date().toISOString() },
      ...a
    ].slice(0, 120));
  }, []);

  const addCluster = useCallback((c: Cluster) => {
    setClusters((cs) => [...cs, c]);
    setFleet((f) => {
      const gen = generateFleet([c]);
      return { nodes: [...f.nodes, ...gen.nodes], gpus: [...f.gpus, ...gen.gpus] };
    });
    setActivity((a) => [
      { id: `ev-${Date.now()}`, ts: new Date().toISOString(), type: "cluster", severity: "success", actor: "operator", message: `${c.name} provisioning started (${c.totalGPUs} GPUs, ${c.scheduler})`, clusterId: c.id },
      ...a
    ]);
    track("cluster_created", { gpus: c.totalGPUs, scheduler: c.scheduler, region: c.regionCode });
  }, []);

  const removeCluster = useCallback((id: string) => {
    setClusters((cs) => cs.filter((c) => c.id !== id));
    setFleet((f) => ({ nodes: f.nodes.filter((n) => n.clusterId !== id), gpus: f.gpus.filter((g) => g.clusterId !== id) }));
    setJobs((js) => js.map((j) => (j.clusterId === id && (j.status === "running" || j.status === "queued") ? { ...j, status: "cancelled" as const } : j)));
    setEndpoints((es) => es.filter((e) => e.clusterId !== id));
    setPartitions((ps) => ps.filter((p) => p.clusterId !== id));
    track("cluster_deleted", { cluster: id });
  }, []);

  const updateCluster = useCallback((id: string, patch: Partial<Cluster>) => {
    const cur = clusters.find((c) => c.id === id);
    if (!cur) return;
    const updated = { ...cur, ...patch };
    setClusters((cs) => cs.map((c) => (c.id === id ? updated : c)));
    // GPU mix / node count changes reshape the sampled fleet slice
    if (patch.gpuMix || patch.totalGPUs !== undefined || patch.totalNodes !== undefined) {
      const gen = generateFleet([updated]);
      setFleet((f) => ({
        nodes: [...f.nodes.filter((n) => n.clusterId !== id), ...gen.nodes],
        gpus: [...f.gpus.filter((g) => g.clusterId !== id), ...gen.gpus]
      }));
      const mix = Object.keys(updated.gpuMix).join("+");
      setPartitions((ps) => ps.map((p) => (p.clusterId === id ? { ...p, gpuTypes: mix } : p)));
    }
    pushActivity({ type: "cluster", severity: "info", actor: "operator", message: `${id} config updated (${Object.keys(patch).join(", ")})`, clusterId: id });
    track("cluster_updated", { cluster: id, keys: Object.keys(patch) });
  }, [clusters, pushActivity]);

  const updateNode = useCallback((id: string, patch: Partial<SimNode>) => {
    setFleet((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
    pushActivity({ type: "node", severity: "info", actor: "operator", message: `${id} node config updated (${Object.keys(patch).join(", ")})` });
    track("node_configured", { node: id, keys: Object.keys(patch) });
  }, [pushActivity]);

  const addPartition = useCallback((p: PartitionCfg) => {
    setPartitions((ps) => [...ps, p]);
    pushActivity({ type: "cluster", severity: "success", actor: "operator", message: `partition ${p.name} created on ${p.clusterId} (${p.kind}, pri ${p.priority})`, clusterId: p.clusterId });
    track("partition_created", { cluster: p.clusterId, kind: p.kind });
  }, [pushActivity]);

  const updatePartition = useCallback((id: string, patch: Partial<PartitionCfg>) => {
    setPartitions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    pushActivity({ type: "cluster", severity: "info", actor: "operator", message: `partition ${id} updated (${Object.keys(patch).join(", ")})` });
  }, [pushActivity]);

  const removePartition = useCallback((id: string) => {
    setPartitions((ps) => ps.filter((p) => p.id !== id));
    pushActivity({ type: "cluster", severity: "warn", actor: "operator", message: `partition ${id} deleted` });
  }, [pushActivity]);

  const updateSchedPolicy = useCallback((patch: Partial<SchedPolicy>) => {
    setSchedPolicy((s) => ({ ...s, ...patch }));
    pushActivity({ type: "system", severity: "info", actor: "operator", message: `scheduling policy updated (${Object.keys(patch).join(", ")})` });
    track("sched_policy_updated", { keys: Object.keys(patch) });
  }, [pushActivity]);

  const saveBlueprint = useCallback((name: string, description: string, clusterId: string) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) return;
    const bp: Blueprint = {
      id: `bp-${Date.now().toString(36)}`,
      name, description, createdAt: new Date().toISOString(),
      cluster: { ...cluster, id: "TEMPLATE", name: "TEMPLATE", status: "provisioning", createdAt: new Date().toISOString() },
      partitions: partitions.filter((p) => p.clusterId === clusterId).map((p) => ({ ...p, id: `TPL-${p.name}`, clusterId: "TEMPLATE" }))
    };
    setBlueprints((bs) => [bp, ...bs]);
    pushActivity({ type: "cluster", severity: "success", actor: "operator", message: `blueprint "${name}" saved from ${clusterId}` });
    track("blueprint_saved", { source: clusterId });
  }, [clusters, partitions, pushActivity]);

  const addBlueprint = useCallback((b: Blueprint) => {
    setBlueprints((bs) => [{ ...b, id: b.id || `bp-${Date.now().toString(36)}` }, ...bs]);
    track("blueprint_imported", {});
  }, []);

  const removeBlueprint = useCallback((id: string) => {
    setBlueprints((bs) => bs.filter((b) => b.id !== id));
  }, []);

  const instantiateBlueprint = useCallback((id: string, newName: string) => {
    const bp = blueprints.find((b) => b.id === id);
    if (!bp) return;
    const slug = newName.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || `cluster-${Date.now().toString(36)}`;
    const cluster: Cluster = { ...bp.cluster, id: slug, name: newName, status: "provisioning", createdAt: new Date().toISOString() };
    addCluster(cluster);
    bp.partitions.forEach((p) => addPartition({ ...p, id: `${slug}-${p.name}`, clusterId: slug }));
    track("blueprint_launched", { partitions: bp.partitions.length });
  }, [blueprints, addCluster, addPartition]);

  const launchJob = useCallback((j: SimJob) => {
    // every submission lands queued with quota reserved; the scheduler loop starts it
    const queued = { ...j, status: "queued" as const, startedAt: null as string | null, gpuIds: [] as string[] };
    setJobs((js) => [queued, ...js]);
    setUsers((us) => us.map((u) => (u.name === j.user ? { ...u, usedGPUs: u.usedGPUs + j.gpusRequested, usedCpuCores: u.usedCpuCores + j.cpuCores, usedMemGB: u.usedMemGB + j.memGB, activeJobs: u.activeJobs + 1 } : u)));
    track("job_submitted", { gpus: j.gpusRequested, cluster: j.clusterId, app: j.appType, scheduler: j.scheduler, team: j.team, fractional: j.fractional ?? 1 });
    setActivity((a) => [
      { id: `ev-${Date.now()}`, ts: new Date().toISOString(), type: "job", severity: "info", actor: j.user, message: `${j.name} submitted requesting ${j.gpusRequested} GPU${j.gpusRequested > 1 ? "s" : ""} on ${j.clusterId}${j.partition ? `:${j.partition}` : ""} — awaiting scheduler`, clusterId: j.clusterId },
      ...a
    ]);
  }, []);

  const releaseQuota = useCallback((id: string) => {
    const j = jobsRef.current.find((x) => x.id === id);
    if (!j || (j.status !== "running" && j.status !== "queued")) return;
    setUsers((us) => us.map((u) => (u.name === j.user ? { ...u, usedGPUs: Math.max(0, u.usedGPUs - j.gpusRequested), usedCpuCores: Math.max(0, u.usedCpuCores - j.cpuCores), usedMemGB: Math.max(0, u.usedMemGB - j.memGB), activeJobs: Math.max(0, u.activeJobs - 1) } : u)));
  }, []);

  const cancelJob = useCallback((id: string) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status: "cancelled" as const } : j)));
    setFleet((f) => ({ ...f, gpus: releaseJobGpus(f.gpus, id) }));
    releaseQuota(id);
    track("job_cancelled", { job: id });
  }, [releaseQuota]);

  const retryJob = useCallback((id: string) => {
    const j = jobsRef.current.find((x) => x.id === id);
    setJobs((js) => js.map((x) => (x.id === id ? { ...x, status: "queued" as const, progress: 0, gpuIds: [] } : x)));
    if (j && (j.status === "failed" || j.status === "cancelled" || j.status === "completed")) {
    setUsers((us) => us.map((u) => (u.name === j.user ? { ...u, usedGPUs: u.usedGPUs + j.gpusRequested, usedCpuCores: u.usedCpuCores + j.cpuCores, usedMemGB: u.usedMemGB + j.memGB, activeJobs: u.activeJobs + 1 } : u)));
    track("job_requeued", { job: id });
    }
  }, []);

  const reimageNode = useCallback((nodeId: string) => {
    setFleet((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? { ...n, status: "provisioning" as const, pxeStage: "discovery", pxeProgress: 0 } : n)) }));
    pushActivity({ type: "node", severity: "warn", actor: "operator", message: `${nodeId} reimage started — PXE pipeline from discovery` });
    track("node_reimaged", { node: nodeId });
  }, [pushActivity]);

  /** Spot reclaim: lowest effective-priority running jobs go back to queued (quota stays reserved). */
  const preemptJobs = useCallback((clusterId: string, count: number) => {
    const js = jobsRef.current;
    const us = usersRef.current;
    const pol = schedPolicyRef.current;
    const victims = js
      .filter((j) => j.clusterId === clusterId && j.status === "running")
      .sort((a, b) => effPriorityOf(a, us, pol.teamWeight) - effPriorityOf(b, us, pol.teamWeight))
      .slice(0, Math.max(0, count));
    if (!victims.length) return;
    const ids = new Set(victims.map((v) => v.id));
    setJobs((prev) => prev.map((j) => (ids.has(j.id)
      ? { ...j, status: "queued" as const, startedAt: null, gpuIds: [], logs: `PREEMPTED by spot reclaim on ${clusterId} — checkpoint kept, requeued (eff-pri ${effPriorityOf(j, usersRef.current, schedPolicyRef.current.teamWeight)})` }
      : j)));
    setFleet((f) => {
      let gpus = f.gpus;
      for (const v of victims) gpus = releaseJobGpus(gpus, v.id);
      return { ...f, gpus };
    });
    pushActivity({ type: "job", severity: "warn", actor: "spot-reclaimer", message: `spot reclaim on ${clusterId}: preempted ${victims.length} job(s) (${victims.map((v) => v.name).join(", ")})`, clusterId });
    track("spot_reclaim", { cluster: clusterId, count: victims.length });
  }, [pushActivity]);

  const setGpuPowerLimit = useCallback((gpuId: string, watts: number) => {
    setFleet((f) => ({ ...f, gpus: f.gpus.map((g) => (g.id === gpuId ? { ...g, powerLimitW: watts } : g)) }));
    track("power_cap_applied", { watts });
  }, []);

  const setMig = useCallback((gpuId: string, enabled: boolean, usedSlices: number) => {
    setFleet((f) => ({
      ...f,
      gpus: f.gpus.map((g) =>
        g.id === gpuId
          ? { ...g, migEnabled: enabled, migSlicesUsed: enabled ? Math.max(0, Math.min(g.migSlicesTotal, usedSlices)) : 0, status: enabled && usedSlices > 0 ? "sliced" : g.status === "sliced" ? "idle" : g.status }
          : g
      )
    }));
    pushActivity({ type: "gpu", severity: "info", actor: "operator", message: enabled ? `${gpuId} MIG enabled, ${usedSlices}/7 slices carved` : `${gpuId} MIG disabled (full-GPU mode)` });
    track("mig_toggled", { enabled, slices: usedSlices });
  }, [pushActivity]);

  const drainNode = useCallback((nodeId: string) => {
    setFleet((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? { ...n, status: "drain" as const } : n)) }));
    track("node_drained", { node: nodeId });
  }, []);

  const undrainNode = useCallback((nodeId: string) => {
    setFleet((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === nodeId ? { ...n, status: "allocated" as const } : n)) }));
  }, []);

  const addEndpoint = useCallback((e: ServeEndpoint) => {
    setEndpoints((es) => [e, ...es]);
    pushActivity({ type: "job", severity: "success", actor: "operator", message: `${e.model} deployed on ${e.engine} (${e.replicas} replicas, ${e.clusterId})`, clusterId: e.clusterId });
    track("endpoint_deployed", { engine: e.engine, gpus: e.gpus, replicas: e.replicas, cluster: e.clusterId });
  }, [pushActivity]);

  const removeEndpoint = useCallback((id: string) => {
    setEndpoints((es) => es.filter((e) => e.id !== id));
    pushActivity({ type: "job", severity: "warn", actor: "operator", message: `endpoint ${id} undeployed` });
    track("endpoint_removed", { endpoint: id });
  }, [pushActivity]);

  const scaleEndpoint = useCallback((id: string, delta: number) => {
    setEndpoints((es) =>
      es.map((e) => {
        if (e.id !== id) return e;
        const max = e.policy?.maxReplicas ?? 12;
        const min = e.policy?.minReplicas ?? 1;
        return { ...e, replicas: Math.max(min, Math.min(max, e.replicas + delta)), status: "scaling" as const };
      })
    );
    pushActivity({ type: "job", severity: "info", actor: "operator", message: `endpoint ${id} manually scaled ${delta > 0 ? "+" : ""}${delta}` });
    track("endpoint_scaled", { endpoint: id, delta });
  }, [pushActivity]);

  const updatePolicy = useCallback((id: string, policy: AutoscalePolicy) => {
    setEndpoints((es) => es.map((e) => (e.id === id ? { ...e, policy } : e)));
    pushActivity({ type: "job", severity: "info", actor: "operator", message: `autoscale policy updated on ${id} (min ${policy.minReplicas}, max ${policy.maxReplicas}, target ${policy.targetRps} rps)` });
    track("autoscale_policy_updated", { endpoint: id });
  }, [pushActivity]);

  const startCanary = useCallback((id: string, version: string, trafficPct: number) => {
    setEndpoints((es) => es.map((e) => (e.id === id
      ? { ...e, status: "scaling" as const, canary: { version, replicas: 1, trafficPct: Math.max(0, Math.min(100, trafficPct)) } as CanaryRelease }
      : e)));
    pushActivity({ type: "job", severity: "info", actor: "operator", message: `canary ${version} started on ${id} at ${trafficPct}% traffic (1 replica)` });
    track("canary_started", { endpoint: id, traffic: trafficPct });
  }, [pushActivity]);

  const setCanaryTraffic = useCallback((id: string, trafficPct: number) => {
    setEndpoints((es) => es.map((e) => (e.id === id && e.canary
      ? { ...e, canary: { ...e.canary, trafficPct: Math.max(0, Math.min(100, trafficPct)) } }
      : e)));
  }, []);

  const promoteCanary = useCallback((id: string) => {
    const e = endpointsRef.current.find((x) => x.id === id);
    if (!e?.canary) return;
    setEndpoints((es) => es.map((x) => (x.id === id ? { ...x, version: (x.canary as CanaryRelease).version, canary: undefined, status: "serving" as const } : x)));
    pushActivity({ type: "job", severity: "success", actor: "operator", message: `canary ${e.canary.version} PROMOTED to stable on ${id}` });
    track("canary_promoted", { endpoint: id });
  }, [pushActivity]);

  const rollbackCanary = useCallback((id: string) => {
    const e = endpointsRef.current.find((x) => x.id === id);
    if (!e?.canary) return;
    setEndpoints((es) => es.map((x) => (x.id === id ? { ...x, canary: undefined, status: "serving" as const } : x)));
    pushActivity({ type: "job", severity: "warn", actor: "operator", message: `canary ${e.canary.version} ROLLED BACK on ${id} — stable ${e.version} kept` });
    track("canary_rolled_back", { endpoint: id });
  }, [pushActivity]);

  const addRule = useCallback((r: AlertRule) => {
    setRules((rs) => [r, ...rs]);
    pushActivity({ type: "alert", severity: "info", actor: "operator", message: `alert rule created: ${r.name} (${r.metric} > ${r.threshold} on ${r.scope})` });
    track("alert_rule_created", { metric: r.metric, scope: r.scope, severity: r.severity });
  }, [pushActivity]);

  const removeRule = useCallback((id: string) => {
    setRules((rs) => rs.filter((r) => r.id !== id));
  }, []);

  const toggleRule = useCallback((id: string) => {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }, []);

  const ackFired = useCallback((id: string) => {
    setFired((fs) => fs.map((f) => (f.id === id ? { ...f, acked: true } : f)));
    track("alert_acknowledged", { alert: id });
  }, []);

  const resetDemo = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setClusters(clustersSeed as unknown as Cluster[]);
    const fresh = (() => {
      const fleet = generateFleet(clustersSeedTyped);
      let gpus = fleet.gpus;
      const jobs = (jobsSeed as unknown as SimJob[]).map((j) => {
        if (j.status !== "running") return j;
        const r = allocateGpus(gpus, j.clusterId, Math.min(j.gpusRequested, 64), j.id);
        gpus = r.gpus;
        return { ...j, gpuIds: r.ids };
      });
      return { fleet: { nodes: fleet.nodes, gpus }, jobs };
    })();
    setJobs(fresh.jobs);
    setUsers(usersSeed as unknown as SimUser[]);
    setEndpoints(endpointsSeed as unknown as ServeEndpoint[]);
    setActivity(activitySeed as unknown as ActivityEvent[]);
    setRules(alertRulesSeed as unknown as AlertRule[]);
    setFired([]);
    setPartitions(clustersSeedTyped.flatMap(defaultPartitions));
    setSchedPolicy(DEFAULT_SCHED_POLICY);
    setBlueprints([]);
    setFleet(fresh.fleet);
    setHistory(seedHistory(fresh.fleet.gpus, fresh.jobs.filter((j) => j.status === "running").length));
    setClusterHistory(() => {
      const out: Record<string, TelemetryPoint[]> = {};
      const by: Record<string, SimGpu[]> = {};
      for (const g of fresh.fleet.gpus) { (by[g.clusterId] = by[g.clusterId] || []).push(g); }
      for (const cid of Object.keys(by)) {
        out[cid] = seedHistory(by[cid], fresh.jobs.filter((j) => j.clusterId === cid && j.status === "running").length);
      }
      return out;
    });
    setSimHours(0);
  }, []);

  const toggleLive = useCallback(() => setLive((v) => !v), []);

  const setSimSpeed = useCallback((x: number) => {
    setSimSpeedState(x);
    pushActivity({ type: "system", severity: "info", actor: "operator", message: `simulation speed set to ${x}×` });
    track("sim_speed_changed", { speed: x });
  }, [pushActivity]);

  const value = useMemo<FleetState>(
    () => ({
      clusters, nodes: fleet.nodes, gpus: fleet.gpus, users, jobs, endpoints, activity, rules, fired,
      partitions, schedPolicy, blueprints, history, clusterHistory,
      live, tick, toggleLive, simSpeed, simHours, setSimSpeed, addCluster, updateCluster, removeCluster, updateNode, launchJob, cancelJob, retryJob, preemptJobs, reimageNode,
      setGpuPowerLimit, setMig, drainNode, undrainNode, addEndpoint, removeEndpoint,
      scaleEndpoint, updatePolicy, startCanary, setCanaryTraffic, promoteCanary, rollbackCanary, addRule, removeRule, toggleRule, ackFired,
      addPartition, updatePartition, removePartition, updateSchedPolicy,
      saveBlueprint, addBlueprint, removeBlueprint, instantiateBlueprint, resetDemo, pushActivity
    }),
    [clusters, fleet, users, jobs, endpoints, activity, rules, fired, partitions, schedPolicy, blueprints, history, clusterHistory, live, tick, toggleLive, simSpeed, simHours, setSimSpeed, addCluster, updateCluster, removeCluster, updateNode, launchJob, cancelJob, retryJob, preemptJobs, reimageNode, setGpuPowerLimit, setMig, drainNode, undrainNode, addEndpoint, removeEndpoint, scaleEndpoint, updatePolicy, startCanary, setCanaryTraffic, promoteCanary, rollbackCanary, addRule, removeRule, toggleRule, ackFired, addPartition, updatePartition, removePartition, updateSchedPolicy, saveBlueprint, addBlueprint, removeBlueprint, instantiateBlueprint, resetDemo, pushActivity]
  );

  return <FleetCtx.Provider value={value}>{children}</FleetCtx.Provider>;
}

export function useFleet(): FleetState {
  const v = useContext(FleetCtx);
  if (!v) throw new Error("useFleet must be used inside FleetProvider");
  return v;
}
