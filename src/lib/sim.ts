import type { Cluster, PartitionCfg, SchedPolicy, SimGpu, SimJob, SimNode, SimUser, GpuModelId, TelemetryPoint } from "./types";
import clustersSeed from "@/data/clusters.json";

const MEM_BY_MODEL: Record<string, number> = {
  H100: 80,
  H200: 141,
  "A100-80GB": 80,
  "A100-40GB": 40,
  L40S: 48,
  A6000: 48,
  RTX4090: 24,
  V100: 32
};

const POWER_BY_MODEL: Record<string, number> = {
  H100: 700,
  H200: 700,
  "A100-80GB": 400,
  "A100-40GB": 400,
  L40S: 350,
  A6000: 300,
  RTX4090: 450,
  V100: 300
};

/** Deterministic PRNG (mulberry32) so fleet looks identical on every load. */
export function seededRand(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface FleetSeed {
  nodes: SimNode[];
  gpus: SimGpu[];
}

/**
 * Expand compact cluster definitions into individual nodes + GPUs.
 * To keep the JSON small we only materialize up to 8 GPU nodes per
 * cluster in the UI (representative slice); aggregate totals still come
 * from clusters.json so fleet-wide math stays truthful.
 */
export function generateFleet(clusters: Cluster[]): FleetSeed {
  const nodes: SimNode[] = [];
  const gpus: SimGpu[] = [];
  const MAX_GPU_NODES_PER_CLUSTER = 8;

  for (const c of clusters) {
    const rand = seededRand(hashStr(c.id));
    // head node
    nodes.push({
      id: `${c.id}-head`,
      clusterId: c.id,
      hostname: `${c.id}-head`,
      role: "head",
      status: c.status === "down" ? "down" : "idle",
      cpuModel: "AMD EPYC 9654",
      cpuCores: 192,
      cpuUtil: 12 + rand() * 20,
      memTotalGB: 1536,
      memUsedGB: 200 + rand() * 300,
      gpuIds: [],
      networkGbps: 100,
      storageTB: 50,
      uptimeDays: 100 + Math.floor(rand() * 200),
      powerW: 450,
      tempC: 42,
      labels: ["mgr", "slurmctld", "login"],
      taints: ["dedicated=scheduler:NoSchedule"],
      features: "head,eth100g",
      nodePowerCapW: 900,
      maxJobs: 4
    });

    const entries = Object.entries(c.gpuMix);
    const totalGpuNodes = Math.max(1, c.totalNodes - 1);
    const shownGpuNodes = Math.min(totalGpuNodes, MAX_GPU_NODES_PER_CLUSTER);
    let gpuCursor = 0;

    for (let n = 0; n < shownGpuNodes; n++) {
      const nodeIdx = n + 1;
      const hostname = `${c.id}-g${String(nodeIdx).padStart(2, "0")}`;
      const nodeId = hostname;
      const gpusPerNode = 8;
      const gpuIds: string[] = [];
      const modelForNode = entries[n % entries.length][0] as GpuModelId;
      const memTotal = MEM_BY_MODEL[modelForNode] ?? 80;
      const powerLimit = POWER_BY_MODEL[modelForNode] ?? 400;

      let nodePower = 0;
      for (let g = 0; g < gpusPerNode; g++) {
        // rotate model if cluster is mixed
        const model = entries[(n + g) % entries.length]
          ? (entries[(n + g) % entries.length][0] as GpuModelId)
          : modelForNode;
        const mem = MEM_BY_MODEL[model] ?? 80;
        const plim = POWER_BY_MODEL[model] ?? 400;
        const busy = rand() > 0.28;
        const degraded = c.status === "degraded" && n === shownGpuNodes - 1 && g >= 6;
        const down = c.id === "helios-prod" && nodeId === "helios-prod-g14" && g === 5;
        const util = down ? 0 : degraded ? 96 : busy ? 62 + rand() * 36 : rand() * 8;
        const temp = down ? 31 : degraded ? 86 + rand() * 3 : busy ? 62 + rand() * 16 : 38 + rand() * 8;
        const power = down ? 55 : Math.round((plim * util) / 100 + rand() * 25);
        nodePower += power;
        const gid = `${nodeId}-gpu${g}`;
        gpuIds.push(gid);
        gpus.push({
          id: gid,
          nodeId,
          clusterId: c.id,
          model,
          uuid: `GPU-${hashStr(gid).toString(16).slice(0, 8).toUpperCase()}`,
          index: g,
          memTotalGB: mem,
          memUsedGB: Math.round(mem * (busy ? 0.55 + rand() * 0.4 : rand() * 0.08) * 10) / 10,
          utilPct: Math.round(util * 10) / 10,
          tempC: Math.round(temp * 10) / 10,
          powerW: power,
          powerLimitW: plim,
          smClockMHz: degraded ? 1440 : down ? 0 : Math.round(1410 + util * 6),
          memClockMHz: down ? 0 : 2619,
          migEnabled: ["H100", "A100-80GB", "A100-40GB", "L40S"].includes(model) && rand() > 0.7,
          migSlicesUsed: 0,
          migSlicesTotal: 7,
          status: down ? "down" : degraded ? "throttled" : busy ? "busy" : "idle",
          jobId: busy && !down ? `job-${7000 + (gpuCursor % 12)}` : null,
          eccErrors: rand() > 0.97 ? Math.floor(rand() * 4) : 0,
          throttleReason: degraded ? "SW_THERMAL" : null
        });
        void memTotal;
        void powerLimit;
        gpuCursor++;
      }

      const isDrain = c.id === "helios-prod" && nodeId === "helios-prod-g14";
      const isProv = c.status === "provisioning" && n >= shownGpuNodes - 2;
      nodes.push({
        id: nodeId,
        clusterId: c.id,
        hostname,
        role: "gpu-compute",
        status: isDrain ? "drain" : isProv ? "provisioning" : rand() > 0.12 ? "allocated" : "idle",
        cpuModel: c.id === "edge-dev" ? "AMD Ryzen 7950X" : "Intel Xeon 8480+",
        cpuCores: 96,
        cpuUtil: Math.round((30 + rand() * 55) * 10) / 10,
        memTotalGB: 1024,
        memUsedGB: Math.round(300 + rand() * 500),
        gpuIds,
        networkGbps: c.id === "helios-prod" ? 400 : c.id === "atlas-train" ? 200 : 25,
        storageTB: 30,
        uptimeDays: 20 + Math.floor(rand() * 200),
        powerW: Math.round(nodePower + 600),
        tempC: Math.round((40 + rand() * 12) * 10) / 10,
        labels: [c.id, c.scheduler === "slurm" ? "slurm" : "k8s", "gpu", modelForNode.toLowerCase().replace(/[^a-z0-9]+/g, "")],
        taints: c.id === "edge-dev" ? ["spot=true:PreferNoSchedule"] : [`nvidia.com/gpu.present=true:NoSchedule`],
        features: `gpu,${modelForNode.toLowerCase().replace(/[^a-z0-9]+/g, "")},ib`,
        nodePowerCapW: Math.round(nodePower + 900),
        maxJobs: 8,
        ...(isProv ? { pxeStage: "imaging", pxeProgress: Math.round(30 + rand() * 40) } : {})
      });
    }
  }
  return { nodes, gpus };
}

/** Live tick: jitter util/temp/power so dashboards feel alive (DCGM-style). */
export function tickGpu(g: SimGpu, rand: () => number): SimGpu {
  if (g.status === "down") return g;
  const drift = (rand() - 0.5) * 6;
  const base = g.status === "idle" ? 4 : g.status === "throttled" ? 95 : 78;
  const util = Math.max(0, Math.min(100, g.utilPct * 0.85 + base * 0.15 + drift));
  const temp = Math.max(
    30,
    Math.min(92, g.tempC + (rand() - 0.5) * 1.6 + (util > 90 ? 0.4 : -0.2))
  );
  const power = Math.max(40, Math.min(g.powerLimitW, Math.round((g.powerLimitW * util) / 100 + (rand() - 0.5) * 18)));
  return {
    ...g,
    utilPct: Math.round(util * 10) / 10,
    tempC: Math.round(temp * 10) / 10,
    powerW: power,
    memUsedGB: Math.round((g.memUsedGB + (rand() - 0.5) * 0.6) * 10) / 10,
    smClockMHz: g.throttleReason ? 1440 : Math.round(1410 + util * 6)
  };
}

/** Pin a job to specific sampled GPUs (visual + inspector binding). */
export function allocateGpus(gpus: SimGpu[], clusterId: string, count: number, jobId: string): { gpus: SimGpu[]; ids: string[] } {
  const ids: string[] = [];
  const next = gpus.map((g) => {
    if (g.clusterId !== clusterId || ids.length >= count) return g;
    if (g.status !== "idle" || g.jobId) return g;
    ids.push(g.id);
    return { ...g, jobId, status: "busy" as const };
  });
  return { gpus: next, ids };
}

/** Release every sampled GPU held by a job back to idle (down/throttled kept). */
export function releaseJobGpus(gpus: SimGpu[], jobId: string): SimGpu[] {
  return gpus.map((g) => {
    if (g.jobId !== jobId) return g;
    if (g.status === "down" || g.status === "throttled") return { ...g, jobId: null };
    return { ...g, jobId: null, status: "idle" as const, utilPct: Math.min(g.utilPct, 6) };
  });
}

/** Aggregate accounting: provisioned minus running reservations per cluster. */
export function clusterFreeGpus(clusters: Cluster[], jobs: SimJob[], clusterId: string): number {
  const total = clusters.find((c) => c.id === clusterId)?.totalGPUs ?? 0;
  const used = jobs.filter((j) => j.clusterId === clusterId && j.status === "running").reduce((a, j) => a + j.gpusRequested, 0);
  return Math.max(0, total - used);
}

export function fleetTotals(clusters: Cluster[]) {
  return {
    clusters: clusters.length,
    gpus: clusters.reduce((a, c) => a + c.totalGPUs, 0),
    nodes: clusters.reduce((a, c) => a + c.totalNodes, 0),
    storagePB: Math.round(clusters.reduce((a, c) => a + c.storagePB, 0) * 10) / 10,
    powerCapKW: clusters.reduce((a, c) => a + c.powerCapKW, 0)
  };
}

export const clustersSeedTyped = clustersSeed as unknown as Cluster[];

/** Aggregate one live snapshot from GPU + job state (feeds the rolling charts). */
export function snapshotTelemetry(gpus: SimGpu[], runningJobs: number, at?: number): TelemetryPoint {
  const n = Math.max(1, gpus.length);
  const util = gpus.reduce((a, g) => a + g.utilPct, 0) / n;
  const powerKW = gpus.reduce((a, g) => a + g.powerW, 0) / 1000;
  const temp = gpus.reduce((a, g) => a + g.tempC, 0) / n;
  const memPct = gpus.reduce((a, g) => a + (g.memTotalGB ? (g.memUsedGB / g.memTotalGB) * 100 : 0), 0) / n;
  return {
    t: new Date(at ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    util: Math.round(util * 10) / 10,
    powerKW: Math.round(powerKW * 10) / 10,
    temp: Math.round(temp * 10) / 10,
    memPct: Math.round(memPct * 10) / 10,
    jobs: runningJobs
  };
}

/** Backfill `n` historical points ending at the live snapshot (random walk into now). */
export function seedHistory(gpus: SimGpu[], runningJobs: number, n = 48): TelemetryPoint[] {
  const rand = seededRand(hashStr("helios-history"));
  const cur = snapshotTelemetry(gpus, runningJobs);
  let u = cur.util - 6 - rand() * 8;
  let p = cur.powerKW * (0.82 + rand() * 0.1);
  let t = cur.temp - 2 - rand() * 3;
  let m = cur.memPct - 4 - rand() * 4;
  let j = Math.max(0, cur.jobs - Math.floor(rand() * 3));
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const k = (i + 1) / n; // 0 → now
    u += (cur.util - u) * 0.12 + (rand() - 0.5) * 5;
    p += (cur.powerKW - p) * 0.12 + (rand() - 0.5) * 6;
    t += (cur.temp - t) * 0.12 + (rand() - 0.5) * 1.2;
    m += (cur.memPct - m) * 0.12 + (rand() - 0.5) * 2;
    j = Math.max(0, Math.round(j + (cur.jobs - j) * 0.2 + (rand() - 0.45) * 1.4));
    return {
      t: new Date(now - (n - 1 - i) * 2500).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      util: Math.round(u * 10) / 10,
      powerKW: Math.round(Math.max(1, p) * 10) / 10,
      temp: Math.round(t * 10) / 10,
      memPct: Math.round(Math.max(0, m) * 10) / 10,
      jobs: j
    };
  }).map((pt, i, arr) => (i === arr.length - 1 ? cur : pt));
}

/** Deterministic starter partitions / node pools per cluster (operator-editable). */
export function defaultPartitions(c: Cluster): PartitionCfg[] {
  const gpuTypes = Object.keys(c.gpuMix).join("+");
  const computeNodes = Math.max(1, c.totalNodes - 1);
  if (c.scheduler === "kubernetes") {
    return [
      { id: `${c.id}-gpu-pool`, clusterId: c.id, name: "gpu-pool", kind: "nodepool", state: "up", nodeCount: computeNodes, gpuTypes, maxGpusPerJob: 8, maxTimeHrs: 168, priority: 60, qos: "standard", allowAccounts: "*" },
      { id: `${c.id}-spot-pool`, clusterId: c.id, name: "spot-pool", kind: "nodepool", state: "up", nodeCount: Math.max(1, Math.floor(computeNodes / 4)), gpuTypes, maxGpusPerJob: 4, maxTimeHrs: 24, priority: 20, qos: "preemptible", allowAccounts: "interns,vision" }
    ];
  }
  return [
    { id: `${c.id}-compute`, clusterId: c.id, name: "compute", kind: "slurm", state: "up", nodeCount: computeNodes, gpuTypes, maxGpusPerJob: 64, maxTimeHrs: 240, priority: 50, qos: "normal", allowAccounts: "*" },
    { id: `${c.id}-debug`, clusterId: c.id, name: "debug", kind: "slurm", state: "up", nodeCount: 1, gpuTypes, maxGpusPerJob: 4, maxTimeHrs: 2, priority: 90, qos: "debug", allowAccounts: "*" },
    ...(c.scheduler === "hybrid"
      ? [{ id: `${c.id}-k8s-pool`, clusterId: c.id, name: "k8s-interactive", kind: "nodepool" as const, state: "up" as const, nodeCount: 2, gpuTypes, maxGpusPerJob: 2, maxTimeHrs: 72, priority: 40, qos: "interactive", allowAccounts: "*" }]
      : [])
  ];
}

export const DEFAULT_SCHED_POLICY: SchedPolicy = {
  defaultWalltimeHrs: 48,
  maxWalltimeHrs: 720,
  maxGpusPerJob: 64,
  fairshare: true,
  backfill: true,
  preemption: false,
  overcommitCpu: 1,
  teamWeight: { "frontier-train": 1.5, "serve-llm": 1.2, vision: 1.0, platform: 1.3, interns: 0.4 },
  note: "fairshare + backfill; preemption off; interns preemptible"
};

/** Effective scheduling priority shared by the loop, previews, and preemption. */
export function effPriorityOf(
  j: Pick<SimJob, "user" | "team">,
  users: Pick<SimUser, "name" | "priority">[],
  teamWeight: Record<string, number>
): number {
  const u = users.find((x) => x.name === j.user);
  return Math.round((u?.priority ?? 50) * (teamWeight[j.team] ?? 1));
}

/** PXE provisioning pipeline: discovery → dhcp → ipxe → imaging → burn-in → ready. */
export const PXE_STAGES = ["discovery", "dhcp", "ipxe", "imaging", "burn-in", "ready"] as const;

export function pxeStageFor(progress: number): string {
  const idx = Math.min(PXE_STAGES.length - 1, Math.floor((progress / 100) * PXE_STAGES.length));
  return PXE_STAGES[idx];
}

export interface TopoNode {
  id: string;
  hostname: string;
  clusterId: string;
  region: string;
  role: string;
  status: "allocated" | "idle" | "drain" | "provisioning" | "down" | "degraded";
  gpus: number;
  util: number;
  temp: number;
  power: number;
  uptimeDays: number;
  pod: number;
  rack: number;
}

/**
 * 100k-node fleet table source. Deterministic (seed 100k), weighted across the real
 * clusters so region/cluster filters mirror the aggregate truth. ~50 lines of generation
 * for 100,000 rows — the page virtualizes rendering, not data.
 */
export function generateTopologyRows(clusters: Cluster[], total = 100000): TopoNode[] {
  const rand = seededRand(100000);
  const weights = clusters.map((c) => c.totalNodes);
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const rows: TopoNode[] = [];
  const perClusterTarget = clusters.map((c) => Math.max(8, Math.round((c.totalNodes / wSum) * total)));
  clusters.forEach((c, ci) => {
    for (let i = 0; i < perClusterTarget[ci]; i++) {
      const r = rand();
      const status: TopoNode["status"] =
        r > 0.995 ? "down" : r > 0.975 ? "degraded" : r > 0.945 ? "drain" : r > 0.915 ? "provisioning" : r > 0.28 ? "allocated" : "idle";
      const busy = status === "allocated" || status === "degraded";
      const util = status === "down" ? 0 : status === "degraded" ? 94 + rand() * 5 : busy ? 55 + rand() * 43 : rand() * 9;
      const pod = ["us-west", "us-east", "eu-central", "ap-south"].indexOf(c.regionCode);
      rows.push({
        id: `${c.id}-r${String(Math.floor(rand() * 64)).padStart(2, "0")}-n${String(i).padStart(5, "0")}`,
        hostname: `${c.id}-r${String(Math.floor(rand() * 64)).padStart(2, "0")}-n${String(i).padStart(5, "0")}`,
        clusterId: c.id,
        region: c.region,
        role: i === 0 ? "head" : rand() > 0.92 ? "storage" : "gpu-compute",
        status,
        gpus: i === 0 ? 0 : 8,
        util: Math.round(util * 10) / 10,
        temp: Math.round((status === "down" ? 30 : status === "degraded" ? 86 : busy ? 62 + rand() * 15 : 36 + rand() * 8) * 10) / 10,
        power: Math.round(600 + util * 6 + rand() * 200),
        uptimeDays: Math.floor(rand() * 400),
        pod: pod < 0 ? ci % 4 : pod,
        rack: Math.floor(rand() * 64)
      });
    }
  });
  return rows;
}
