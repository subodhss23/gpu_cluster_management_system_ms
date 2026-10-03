export type GpuModelId = "H100" | "H200" | "A100-80GB" | "A100-40GB" | "L40S" | "A6000" | "RTX4090" | "V100";

export interface GpuCatalogEntry {
  model: GpuModelId;
  vendor: "NVIDIA";
  memoryGB: number;
  fp16TFLOPS: number;
  powerW: number;
  migSlices: number[];
  interconnect: string;
  pricePerHr: number;
}

export interface Cluster {
  id: string;
  name: string;
  region: string;
  regionCode: string;
  provider: string;
  status: "healthy" | "degraded" | "provisioning" | "maintenance" | "down";
  scheduler: "slurm" | "kubernetes" | "hybrid";
  orchestration: string[];
  gpuMix: Record<string, number>;
  totalGPUs: number;
  totalNodes: number;
  fabric: string;
  storagePB: number;
  powerCapKW: number;
  version: string;
  createdAt: string;
  tags: string[];
  description: string;
}

export interface SimNode {
  id: string;
  clusterId: string;
  hostname: string;
  role: "head" | "gpu-compute" | "cpu-compute" | "storage";
  status: "idle" | "allocated" | "drain" | "down" | "provisioning";
  cpuModel: string;
  cpuCores: number;
  cpuUtil: number;
  memTotalGB: number;
  memUsedGB: number;
  gpuIds: string[];
  networkGbps: number;
  storageTB: number;
  uptimeDays: number;
  powerW: number;
  tempC: number;
  // deep config (operator-tunable)
  labels: string[];
  taints: string[];
  features: string; // Slurm Features= / GRES string
  nodePowerCapW: number;
  maxJobs: number;
}

export interface SimGpu {
  id: string;
  nodeId: string;
  clusterId: string;
  model: GpuModelId;
  uuid: string;
  index: number;
  memTotalGB: number;
  memUsedGB: number;
  utilPct: number;
  tempC: number;
  powerW: number;
  powerLimitW: number;
  smClockMHz: number;
  memClockMHz: number;
  migEnabled: boolean;
  migSlicesUsed: number;
  migSlicesTotal: number;
  status: "idle" | "busy" | "throttled" | "down" | "sliced";
  jobId: string | null;
  eccErrors: number;
  throttleReason: string | null;
}

export interface SimUser {
  id: string;
  name: string;
  email: string;
  team: string;
  role: "admin" | "researcher" | "engineer" | "viewer";
  quotaGPUs: number;
  usedGPUs: number;
  quotaCpuCores: number;
  usedCpuCores: number;
  quotaMemGB: number;
  usedMemGB: number;
  priority: number;
  activeJobs: number;
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type AppType = "pretraining" | "fine-tune" | "inference" | "vllm-serve" | "sglang-serve" | "render" | "analytics";

export interface SimJob {
  id: string;
  name: string;
  user: string;
  team: string;
  appType: AppType;
  clusterId: string;
  scheduler: "slurm" | "kubernetes";
  status: JobStatus;
  gpusRequested: number;
  fractional?: number;
  cpuCores: number;
  memGB: number;
  storageGB: number;
  networkMbps: number;
  progress: number;
  walltimeHrs: number;
  elapsedHrs: number;
  costAccrued: number;
  submittedAt: string;
  startedAt: string | null;
  gpuIds: string[];
  logs?: string;
  framework: string;
  partition?: string;
}

export interface AutoscalePolicy {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetRps: number;
  targetP99Ms: number;
}

export interface ServeEndpoint {
  id: string;
  model: string;
  engine: "vLLM" | "SGLang" | "TensorRT-LLM";
  clusterId: string;
  gpus: number;
  replicas: number;
  rps: number;
  latencyP99Ms: number;
  tokensPerSec: number;
  status: "serving" | "scaling" | "down";
  version: string;
  policy?: AutoscalePolicy;
}

export interface ActivityEvent {
  id: string;
  ts: string;
  type: "job" | "cluster" | "node" | "gpu" | "alert" | "user" | "system";
  severity: "info" | "warn" | "error" | "success";
  actor: string;
  message: string;
  clusterId?: string;
}

export interface TelemetryPoint {
  t: string;
  util: number;
  powerKW: number;
  temp: number;
  memPct: number;
  jobs: number;
}

export type AlertMetric = "temp" | "util" | "power" | "ecc" | "queue";

export interface AlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  scope: string; // cluster id or "fleet"
  severity: "warn" | "error";
  enabled: boolean;
  cooldownSec: number;
}

export interface FiredAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  ts: string;
  severity: "warn" | "error";
  message: string;
  clusterId?: string;
  acked: boolean;
}

export interface JobCheckpoint {
  id: string;
  step: number;
  epoch: number;
  loss: number;
  sizeGB: number;
  ts: string;
  path: string;
}

export interface PartitionCfg {
  id: string;
  clusterId: string;
  name: string;
  kind: "slurm" | "nodepool";
  state: "up" | "down";
  nodeCount: number;
  gpuTypes: string;
  maxGpusPerJob: number;
  maxTimeHrs: number;
  priority: number;
  qos: string;
  allowAccounts: string; // comma list, * = all
}

export interface SchedPolicy {
  defaultWalltimeHrs: number;
  maxWalltimeHrs: number;
  maxGpusPerJob: number;
  fairshare: boolean;
  backfill: boolean;
  preemption: boolean;
  overcommitCpu: number;
  teamWeight: Record<string, number>;
  note: string;
}

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  cluster: Cluster;
  partitions: PartitionCfg[];
}
