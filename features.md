# Features — Helios GPU Management System (v0.4 + roadmap)

## ✅ Shipped in this build (all clickable, all simulated)

### Fleet command (/)
- Hero ops console with CTAs; 6 KPI cards (GPUs, avg util, power vs cap, running jobs/RPS, storage, attention).
- Fleet utilization stream (live 60-point rolling aggregate recomputed from GPU state every 2.5s) + power/temp/mem readout chips.
- GPU model mix donut with counts + shares; per-cluster capacity bars.
- Live GPU heatmap (72 compact cells on the overview; full slice on `/nodes`) with legend; needs-attention alert rail (XID, thermal, autoscale).
- Cluster + top-workload preview rails linking into detail pages.

### Multi-cluster & regions (/clusters, /clusters/[id])
- 4 seed clusters across us-west / us-east / eu-central: Slurm, Kubernetes, hybrid schedulers.
- Provisioning wizard: name, region, scheduler, GPU model × count, fabric, storage → appears as `provisioning`.
- Decommission with cascade (jobs cancelled, endpoints dropped).
- Detail: aggregate KPIs, live per-cluster util stream, heatmap, sampled nodes, hottest GPUs, cluster jobs, power-cap bar.

### Single-cluster depth (/nodes)
- Search + cluster/status filters over sampled nodes/GPUs; fleet heatmap click-to-inspect.
- Per-node CPU/MEM bars, network/storage/uptime/power; per-GPU chips.
- GPU inspector: util/mem/temp/power bars, SM/MEM clocks, MIG slices, ECC, throttle reason, UUID/job link.
- DCGM-style actions: per-GPU power-limit slider + apply; node drain / undrain (Slurm semantics).

### Scheduling & quotas (/workloads, /scheduler, /users)
- Unified Slurm + K8s queue with status filters, progress bars, resource lines
  (GPU/CPU/MEM/storage/NET, fractional badges), walltime/elapsed/cost, log viewer, cancel/requeue.
- Launch wizard: user/app (7 app types incl. vLLM/SGLang), cluster + partition picker with live free-GPU accounting,
  GPU slider clamped by policy/partition limits, fractional 1/0.5/0.25, CPU/MEM/storage/NET sliders, walltime;
  quota-vs-use bars, queue-position + cost estimate, sbatch/kubectl preview; submits to queue, scheduler loop starts it.
- Users & quotas: 8 users × 4 teams, roles/priorities, GPU/CPU/MEM budget bars, active-job counts.

### AI Factory + serving (/serving, /monitoring, /diagnostics)
- GPUStack endpoints: vLLM / SGLang / TensorRT-LLM cards (RPS, p99, tok/s, replicas, load bar, deploy CLI), routing topology strip.
- Monitoring: 4 live streams (util/power/temp/mem from the rolling history buffer), severity-filtered activity timeline (10+ seeded events), top power consumers, PROMQL hint card, sample counter.
- Diagnostics: rule-based Ops Agent chat (thermal/XID/queue/power/latency intents + quick prompts), DCGM level-2 runner with staged transcript, known-issues board. Findings append to the timeline.

### Platform behaviors (global)
- Dark / light mode toggle in the topbar (Sun/Moon), persisted to localStorage (`helios-theme`), no-flash boot script, theme-aware charts and terminal-style log blocks that stay dark in both modes.
- Synthetic telemetry ticks every 2.5s (pause/resume + 1×–3.6k× sim speed in topbar); job progress derives from elapsed/walltime; serving traffic jitters and autoscalers act.
- Persistence: seeds in `src/data/*.json`, full runtime state in localStorage (`helios-fleet-v2`: clusters, jobs, users, nodes, GPUs, endpoints, rules, partitions, policy, blueprints); Export JSON + Reset demo in topbar.
- Product analytics (opt-in): PostHog pageviews + ~25 explicit operator events when `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is set, all tagged `app=gpu_management_system_app1_ms`; completely inert otherwise. Only synthetic IDs and counts leave the browser.
- Failure theater: XID-79 down GPU, SW_THERMAL cap, failed NCCL job w/ checkpoint, degraded + provisioning clusters.

## ✅ Wave 2 — five more systems (all functional)

### 1. FinOps cost & chargeback (/billing)
- Metered spend from GPU catalog $/GPU-hr × job GPU-hours (fractional billed pro-rata) + projection to walltime.
- KPIs (burned / projected / burn multiple / top team), 30-day cumulative burn chart, spend-by-team donut with budget bars, top-jobs ledger, per-cluster price book, per-user burn table.
- Exports: chargeback **CSV** + billing JSON for team cost centers.

### 2. MIG slice manager (/nodes inspector)
- For MIG-capable GPUs (H100/H200/A100/L40S): enable/disable MIG, carve/release up to 7 hardware-isolated slices with a visual slice grid; non-capable models explain the fractional fallback.
- Inspector now reads live store state (no stale snapshots) so power caps, MIG and telemetry stay in sync.

### 3. Serving autoscale + deploy (/serving)
- Per-endpoint autoscale policy editor (enable, min/max replicas, target RPS, target p99) with live enforcement on the 2.5s tick (hysteresis + timeline entries on every scale event).
- Manual +/− replica controls clamped to policy, deploy wizard (model/engine/cluster/GPUs/replicas), undeploy with cascade-safe confirm.

### 4. Checkpoint browser (/workloads)
- Deterministic per-job checkpoints (step, epoch, decaying loss, size, S3 path) in a Logs/Checkpoints tab; one-click **resume-as-new-job** at checkpoint progress; per-checkpoint manifest JSON download.

### 5. Alert rules engine (/alerts)
- CRUD threshold rules over 5 metrics (temp/util/power/ECC/queue) scoped to fleet or one cluster, with severity + arm/disarm + per-rule cooldowns; evaluated live every tick.
- Firing feed with acknowledge, unacked bell count, and automatic mirroring into the monitoring timeline.

## ✅ Wave 3 — deep configuration (create, edit, tweak everything)

### 1. Cluster deep-config editor (clusters list + detail)
- Per-cluster **Configure** modal: rename, region, scheduler, status (incl. maintenance/down), fabric, tags, storage, power cap, node count, description, orchestration-stack toggles.
- **GPU mix editor** (add/remove GPU types + counts) — saving reshapes the sampled fleet, updates totals and partition GPU types, and logs to the timeline. Cluster IDs stay immutable so jobs/nodes/endpoints never dangle.

### 2. Partitions & QOS editor (cluster detail)
- Slurm partitions / K8s node pools with inline editing: up/down state, node count, max GPUs/job, max time, priority slider, QOS, account allow-list; create + delete with cascade-safe cleanup on decommission.
- The launch wizard reads them: partition picker with limits, placement verdict and sbatch lines carry `cluster:partition`.

### 3. Node configuration (nodes inspector → Configure tab)
- Per-node K8s labels, taints, Slurm Features/GRES string, node power cap slider, max job slots, drain/undrain — with live `scontrol`/`kubectl` preview lines. Inspector tabs share live store state (no stale reads).

### 4. Scheduling policy console (/policies)
- Fleet-wide knobs that **actually bind the launch wizard**: default/max walltime, max GPUs/job, CPU overcommit, fairshare/backfill/preemption toggles, per-team priority weights.
- Live queue-order preview and per-user effective priorities (`user pri × team weight`); factory-defaults reset.

### 5. Configuration blueprints (/blueprints)
- Snapshot any cluster (full config + partitions) into a reusable template; instantiate under a new name (cluster + partitions provisioned together); export all/one as JSON; import JSON files with validation.
- Persistence extended: nodes, GPUs, partitions, policy and blueprints all survive reload (store key bumped to `helios-fleet-v2` for the new node schema).

## ✅ Wave 4 — core realism: a scheduler that actually schedules

### 1. Capacity-aware scheduler loop
- Submissions land **queued**; every tick the loop starts them in effective-priority order while aggregate GPUs are free (`provisioned − running reservations` per cluster).
- The launch wizard's verdict reads the same accounting (`N GPUs free / M allocated`), and starts write placement log lines (`placed on cluster[:partition] · N GPUs · eff-pri`).

### 2. True job lifecycle + sim clock
- Running jobs advance `elapsed → walltime` and **complete**: progress hits 100, GPUs are released, quota is refunded, and the timeline records it. Queued jobs flow in behind them.
- **Simulation speed control** in the topbar (1× / 60× / 720× / 3.6k×) plus a live `T+… SIM` clock — crank it to watch a 16-hour job finish in seconds.

### 3. Live quota accounting + GPU pinning
- Users' GPU/CPU/RAM usage and active-job counts move on submit, start, completion, cancel, and requeue — the Users page and scheduler quota bars are live, not seeded.
- Started jobs are **pinned to specific sampled GPUs** (up to the visible slice): workload cards show `pinned N GPUs → node-a, node-b`, and the GPU inspector links each card back to its job. Cancel/retry/completion releases pins.

## 🗺 Roadmap (from PRD phases 2b / 3b)
- [ ] Virtualized 100k-node table + IB topology map.
- [x] Slurm partition editor (wave 3).
- [ ] PXE state machine per node (discovery → provision → burn-in → allocated).
- [x] MIG slice carve/release + Run:AI fractional billing (wave 2).
- [ ] Full MIG profile editor (named 1g/2g/3g/4g/7g geometries) + Run:AI policy simulator.
- [x] Endpoint autoscaling policies (wave 2).
- [ ] Canary deploys + spot/preempt pool.
- [x] Cost ledger + team chargeback CSV + checkpoint browser (wave 2).
- [ ] Vitest suite for sim determinism/tick bounds/quota math; Playwright smoke for acceptance flows.
