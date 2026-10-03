# Technical Map — Helios GPU Management System

> **What this file is:** the complete engineering map of the app — every layer, engine,
> function, component, data flow, and magic number, with file paths and line-level behavior.
> If `technical_design.md` is the *why*, this is the *exactly-how*.
> Last synced: v0.4 · build 17/17 green.

---

## 1. System map (one picture)

```
┌─ SEED LAYER ───────────────────────────── src/data/*.json (7 files, human-editable)
│  clusters · users · jobs · endpoints · activity · gpu-catalog · alert-rules
└──────────────┬──────────────────────────────────────────────────────────────
               │ import (boot only)
               ▼
┌─ SIM ENGINE ───────────────────────────── src/lib/sim.ts (pure functions, no React)
│  seededRand → generateFleet → tickGpu → allocateGpus / releaseJobGpus
│  clusterFreeGpus → snapshotTelemetry / seedHistory → defaultPartitions
└──────────────┬──────────────────────────────────────────────────────────────
               │ driven by
               ▼
┌─ STORE ────────────────────────────────── src/lib/store.tsx (FleetProvider, 2.5s tick)
│  12 state slices · 8 mirror refs · 30 actions · full localStorage mirror
└──────────────┬──────────────────────────────────────────────────────────────
               │ useFleet() / useTheme()
               ▼
┌─ UI ───────────────────────────────────── src/components/* + src/app/*/page.tsx
│  shell (Sidebar/Topbar/Footer) · primitives (cards/charts/ClusterEditor) · 15 pages
└─────────────────────────────────────────────────────────────────────────────
```

**Golden rules of the architecture:**
1. `sim.ts` is **pure** — same seeds in, same fleet out, zero React imports. Only file allowed to touch randomness.
2. `store.tsx` is the **only writer** of fleet state. Pages/components never mutate — they call actions.
3. `clusters.json` is the **aggregate truth** (480 GPUs). The materialized slice (~232 GPUs) is the **visual truth**. Arithmetic uses aggregates; eyes use the slice.
4. No API routes, no server actions, no env vars. The tick is a client `setInterval`, not a server.

---

## 2. Seed layer — `src/data/` (the entire "database")

| File | Records | Shape (key fields) | Role |
|---|---|---|---|
| `clusters.json` | 4 | `id, name, region, regionCode, scheduler, gpuMix{}, totalGPUs, totalNodes, fabric, storagePB, powerCapKW, orchestration[], status, tags[], description` | Aggregate truth for KPIs, capacity math, fleet generation input |
| `users.json` | 8 | `name, team, role, quotaGPUs/usedGPUs, quotaCpuCores/usedCpuCores, quotaMemGB/usedMemGB, priority, activeJobs` | Quota ledger (mutates live), scheduler identity |
| `jobs.json` | 12 | `id, name, user, team, appType, clusterId, scheduler, status, gpusRequested, fractional?, cpuCores, memGB, storageGB, networkMbps, progress, walltimeHrs, elapsedHrs, costAccrued, submittedAt, startedAt, framework, logs` | Queue seed; `gpuIds` filled at boot by pinning |
| `endpoints.json` | 5 | `model, engine, clusterId, gpus, replicas, rps, latencyP99Ms, tokensPerSec, status, version, policy{}` | Serving seed incl. autoscale policies |
| `activity.json` | 10 | `id, ts, type, severity, actor, message, clusterId?` | Timeline seed (XID-79, thermal, autoscale, NCCL failure…) |
| `gpu-catalog.json` | 8 models | `model, memoryGB, fp16TFLOPS, powerW, migSlices[], interconnect, pricePerHr` | Pricing + spec truth for billing and inspector |
| `alert-rules.json` | 5 | `id, name, metric, threshold, scope, severity, enabled, cooldownSec` | Rules-engine seed |

**Seed story (deterministic demo):** `helios-prod-g14` GPU-5 is XID-79 down → `job-7010` failed NucCL with checkpoint preserved; `vulcan-g06` L40S-3 runs 87 °C throttled; `edge-dev` is mid-provisioning; 3 jobs queued behind a busy fleet.

---

## 3. Type system — `src/lib/types.ts` (240 lines)

```
GpuModelId ── "H100"|"H200"|"A100-80GB"|"A100-40GB"|"L40S"|"A6000"|"RTX4090"|"V100"
GpuCatalogEntry ── spec + pricePerHr
Cluster ── aggregate record (see seed table; status: healthy|degraded|provisioning|maintenance|down)
SimNode ── id, clusterId, hostname, role, status, cpu{Model,Cores,Util}, mem{Total,Used},
           gpuIds[], networkGbps, storageTB, uptimeDays, powerW, tempC
           + CONFIG: labels[], taints[], features, nodePowerCapW, maxJobs
SimGpu ── id (`{nodeId}-gpu{index}`), model, uuid, index, mem{Total,Used}, utilPct, tempC,
           powerW, powerLimitW, smClockMHz, memClockMHz, mig{Enabled,SlicesUsed,SlicesTotal:7},
           status (idle|busy|throttled|down|sliced), jobId|null, eccErrors, throttleReason|null
SimUser ── quotas + usage + priority + activeJobs
SimJob ── status (queued|running|completed|failed|cancelled), resources, progress,
           walltimeHrs/elapsedHrs, costAccrued, gpuIds[] (pins), partition?, logs?
ServeEndpoint ── traffic (rps/latency/tokens) + policy?: AutoscalePolicy
AutoscalePolicy ── enabled, min/maxReplicas, targetRps, targetP99Ms
AlertRule ── metric (temp|util|power|ecc|queue), threshold, scope (cluster|fleet),
           severity, enabled, cooldownSec
FiredAlert ── ruleId, ts, message, acked
PartitionCfg ── kind (slurm|nodepool), state (up|down), nodeCount, gpuTypes,
           maxGpusPerJob, maxTimeHrs, priority, qos, allowAccounts
SchedPolicy ── default/maxWalltimeHrs, maxGpusPerJob, fairshare, backfill, preemption,
           overcommitCpu, teamWeight{}, note
Blueprint ── { cluster (id=TEMPLATE), partitions[], name, description, createdAt }
JobCheckpoint ── step, epoch, loss, sizeGB, ts, s3 path
TelemetryPoint ── { t, util, powerKW, temp, memPct, jobs }
```

**ID conventions:** clusters `kebab` (`helios-prod`); nodes `{cluster}-g{NN}` + `{cluster}-head`; GPUs `{node}-gpu{N}`; jobs `job-7xxx`; endpoints `ep-NN`; rules `rule-*`; blueprints `bp-*`; partitions `{cluster}-{name}`.

---

## 4. Sim engine — `src/lib/sim.ts` (pure, testable, ~314 lines)

### 4.1 `seededRand(seed)` — mulberry32 PRNG
Deterministic stream per seed. `hashStr()` (FNV-1a) converts cluster/job IDs to seeds, so every load generates the **identical fleet**. Verified: regenerate → `gpus[0].utilPct` equal.

### 4.2 Constant tables
| Model | MEM (GB) | Power (W) | MIG? |
|---|---|---|---|
| H100 / H200 | 80 / 141 | 700 | ✅ |
| A100-80GB / 40GB | 80 / 40 | 400 | ✅ |
| L40S | 48 | 350 | ✅ |
| A6000 / RTX4090 / V100 | 48 / 24 / 32 | 300 / 450 / 300 | ❌ (fractional time-slicing instead) |

`MIG_CAPABLE` (nodes page) = `[H100, H200, A100-80GB, A100-40GB, L40S]`, 7 slices each.

### 4.3 `generateFleet(clusters)` — seed → nodes + GPUs
Per cluster: **1 head node** (EPYC 9654, 192c, labels `mgr,slurmctld,login`) + **up to 8 GPU nodes × 8 GPUs** (the sampling cap — `MAX_GPU_NODES_PER_CLUSTER = 8`).
- GPU node `n` uses `gpuMix` entry `n % entries.length` (mixed clusters rotate models per socket).
- Busy bias: `rand() > 0.28` → ~72 % busy; busy util `62 + rand*36`, idle `< 8`.
- Scripted incidents: `helios-prod-g14/gpu5` = XID-79 down; `vulcan-infer` last node GPUs 6–7 = 86–89 °C throttled (`SW_THERMAL`, SM 1440 MHz); `edge-dev` tail nodes = `provisioning`; `helios-prod-g14` node = `drain`.
- Node config defaults: labels `[clusterId, slurm|k8s, gpu, modelslug]`, taints (`spot` on edge-dev, `nvidia.com/gpu.present` elsewhere), `features: gpu,{model},ib`, `nodePowerCapW = nodePower + 900`, `maxJobs = 8`.

### 4.4 `tickGpu(g, rand)` — the 2.5 s heartbeat (per GPU)
- `down` GPUs untouched. Others: util mean-reverts (`0.85×current + 0.15×base + drift±3`), where base = 4 (idle) / 95 (throttled) / 78 (busy).
- Temp follows util (`±0.8` + `+0.4` above 90 %), clamped 30–92 °C.
- Power = `powerLimit × util/100 ± 9`, clamped to `[40, powerLimit]`.
- Throttled GPUs hold SM 1440 MHz; else `1410 + util×6`.

### 4.5 `allocateGpus(gpus, clusterId, count, jobId)` / `releaseJobGpus(gpus, jobId)`
- Allocate: first `count` GPUs with `status === idle && !jobId` in the cluster → `{jobId, busy}`. Returns `{gpus, ids}`. Best-effort: returns fewer if the sampled slice is exhausted (verified: 32 requested → 16 pinned on a busy slice).
- Release: holder GPUs → `jobId: null`, `busy → idle` (down/throttled keep status), util softly floored.
- Aggregate truth never depends on pins — pins are the visual binding only.

### 4.6 `clusterFreeGpus(clusters, jobs, clusterId)`
`totalGPUs − Σ gpusRequested (running on cluster)`, floored at 0. The single source of capacity truth for the scheduler loop and wizard verdict. Verified: 128−48=80, 256−24=232.

### 4.7 `snapshotTelemetry(gpus, runningJobs, at?)` / `seedHistory(gpus, runningJobs, n=48)`
- Snapshot: avg util/temp/mem %, total kW, running count, timestamped `HH:MM:SS`.
- Seed: random-walks 48 points **into** the live snapshot (last point `===` live values — asserted in tests).

### 4.8 `defaultPartitions(cluster)` / `DEFAULT_SCHED_POLICY`
- K8s clusters → `gpu-pool` + `spot-pool` (preemptible, interns/vision only). Slurm/hybrid → `compute` (64 GPU, 240 h) + `debug` (4 GPU, 2 h, pri 90) + `k8s-interactive` if hybrid.
- Policy defaults: walltime 48/720 h, 64 GPU/job, fairshare + backfill ON, preemption OFF, overcommit 1×, team weights frontier 1.5 / platform 1.3 / serve 1.2 / vision 1.0 / interns 0.4.

### 4.9 `fleetTotals(clusters)` — KPI sums (GPUs, nodes, PB, kW cap).

---

## 5. Store — `src/lib/store.tsx` (`FleetProvider`, ~629 lines)

### 5.1 Twelve state slices
`clusters · fleet{nodes,gpus} · users · jobs · endpoints · activity · rules · fired · partitions · schedPolicy · blueprints · history · clusterHistory` + clocks `live/tick/simSpeed(720)/simHours`.

### 5.2 Boot sequence (lazy `useState` initializer → effects)
1. `generateFleet(seeds)` → pin running seed jobs via `allocateGpus` (heatmap truthful on first paint) → `initial {fleet, jobs}`.
2. `seedHistory()` × (fleet + per-cluster) → charts full immediately.
3. Mount effect: restore `helios-fleet-v2` mirror if present; backfill starter partitions for restored custom clusters.
4. `helios-theme` restored separately by `theme.tsx` + pre-paint script.

### 5.3 Ref-mirror pattern
8 refs (`gpusRef, endpointsRef, jobsRef, rulesRef, clustersRef, usersRef, schedPolicyRef, simSpeedRef`) synced by tiny effects, so the 2.5 s interval **never re-subscribes** and always sees fresh state.

### 5.4 The tick pipeline (exact order, every 2.5 s while `live`)
| Step | What | Detail |
|---|---|---|
| 1 | `simH = speed × 2.5 / 3600` | 720× default → 0.5 sim-hour/tick |
| 2 | **Completions** | running jobs with `elapsed + simH ≥ walltime` → `completed, progress 100` |
| 3 | **Scheduler loop** | queued jobs sorted by `effPriority = user.priority × teamWeight[team]`; start while `gpusRequested ≤ freeFor(cluster)` (completions excluded, starters accumulate); writes `placed on … · eff-pri` log |
| 4 | **GPU write** | release completions → pin starters (≤64 sampled) → `tickGpu` jitter all → single `setFleet` |
| 5 | **History** | fleet + per-cluster `snapshotTelemetry` appended, capped at **60 pts** |
| 6 | **Jobs write** | completions / starters (with `gpuIds`) / `elapsed += simH`, `progress = elapsed/walltime × 100` |
| 7 | **Quotas + timeline** | completed jobs refund GPU/CPU/RAM/activeJobs; STARTED/COMPLETED entries pushed (cap 120) |
| 8 | **Autoscale** | per endpoint: RPS jitter ±~4.5 %; scale **up** if `rps > target×1.15` (till max), **down** if `< target×0.45` (till min); p99 drifts with load; every scale event → timeline |
| 9 | **Alert rules** | per enabled rule past `cooldownSec`: temp (hottest GPU), util (≥2 GPUs), power, ecc, queue (backlog depth); fire → `fired[]` (cap 60) + mirrored timeline entry |

### 5.5 All 30 actions (grouped)
- **Lifecycle:** `launchJob` (always queued + quota reserved), `cancelJob` (pins + quota released), `retryJob` (re-queued + quota re-reserved).
- **Clusters/nodes:** `addCluster` (generates slice), `updateCluster` (mix edits regenerate slice + refresh partition GPU types), `removeCluster` (cancels jobs, drops endpoints + partitions), `updateNode`, `drainNode/undrainNode`, `setGpuPowerLimit`, `setMig` (sliced status at >0 slices).
- **Serving:** `addEndpoint/removeEndpoint/scaleEndpoint` (clamped to policy min/max, sets `scaling`), `updatePolicy`.
- **Alerts:** `addRule/removeRule/toggleRule/ackFired`.
- **Config:** `addPartition/updatePartition/removePartition`, `updateSchedPolicy`, `saveBlueprint/addBlueprint/removeBlueprint/instantiateBlueprint` (cluster + partitions provisioned together).
- **Meta:** `toggleLive`, `setSimSpeed` (logs the change), `resetDemo` (clears LS, rebuilds everything incl. pins + history), `pushActivity` (prepend, cap 120).

### 5.6 Persistence (`helios-fleet-v2`)
Full mirror `{clusters, jobs, users, endpoints, rules, nodes, gpus, partitions, schedPolicy, blueprints}` written on every relevant change (try/catch quota guard). `fired`, `simSpeed`, `simHours`, `history` are session-only by design. Bump the key to invalidate old schemas.

---

## 6. Supporting engines — `src/lib/`

### 6.1 `theme.tsx` — dark/light with no flash
`ThemeProvider` defaults dark → reconciles `helios-theme` in an effect → toggles `documentElement.light` + `colorScheme`. Layout injects a pre-paint inline script setting the class before hydration. Charts read `useTheme()` for grid/tooltip colors; `globals.css` carries the `html.light` override layer (terminals stay dark). Theme flips fire `theme_changed`.

### 6.1b `analytics.ts` + `AnalyticsBoot.tsx` — PostHog, off by default
`initAnalytics()` inits posthog-js once iff `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` exists (`defaults: "2026-05-30"`), then registers `app: "gpu_management_system_app1_ms"` on every event so one PostHog project can tell apps apart. `track(event, props)` no-ops otherwise — safe to call from all 25 instrumented sites (every store action in §5.5 plus theme/export/reset; tick internals excluded as too noisy). `AnalyticsBoot` (in layout) boots once and captures SPA `$pageview` per route. `.env.example` documents the two vars.

### 6.2 `finops.ts` — money math
- `pricePerHr(model)` ← catalog lookup, fallback 1.5.
- `clusterGpuPrice(c)` = mix-weighted $/GPU-hr.
- `jobSpend` = `costAccrued + elapsed × gpus × slice × price` (queued/cancelled → accrued only).
- `jobProjected` = spend + `remaining × gpus × slice × price` (running only).
- `toCsv` (quoted, escaped), `money` ($, 0 decimals), `TEAM_BUDGETS` (120k/60k/40k/25k/2k).

### 6.3 `checkpoints.ts` — deterministic resume points
`checkpointsFor(job)` seeds from `hash(job.id)`: total steps 20–80k, 3–5 evenly spaced checkpoints with decaying loss (`×0.82–0.92`, floor 0.4), size `gpus×(2–5)+8` GB, S3 path `s3://helios/checkpoints/{name}/step-{n}/`. Queued jobs → none.

### 6.4 `utils.ts`
`cx` (conditional join), `fmtNum` (locale), `pct` (clamped 1-decimal), `timeAgo` (m/h/d), `downloadJson` (blob), `STATUS_COLOR` (status → text class; dots reuse via `text-`→`bg-` swap).

---

## 7. Components — `src/components/`

| Component | File | Props | Behavior |
|---|---|---|---|
| `Sidebar` | `Sidebar.tsx` | — | 13-item nav (13 icons), active ring + live dot via `usePathname`; static SIMULATION MODE card |
| `Topbar` | `Topbar.tsx` | — | Mobile drawer; LIVE pill + `T+… SIM` clock; speed segmented control (1/60/720/3.6k, `title=` explains walltime); Sun/Moon theme toggle; Pause/Resume; Export JSON (`{clusters, jobs, exportedAt, gpuSample[25]}`); Reset (confirm + `resetDemo`) |
| `Footer` | `Footer.tsx` | — | Live status bar: clusters · provisioned GPUs · live samples · running/queued; right side (`md+`): simulated-telemetry note + California credit |
| `Card/StatCard/Badge/Bar/SectionTitle/Empty` | `cards.tsx` | minimal | Glass cards, KPI hairline, status dot+label badges, capped progress bars |
| `FleetArea` | `charts.tsx` | `data, dataKey, color, unit` | Gradient area, theme grid/ticks/tooltip |
| `ModelDonut` | `charts.tsx` | `{name,value}[]` | 6-color categorical donut |
| `MiniBars` | `charts.tsx` | `data, height` | Capacity bars (`h-44` on overview) |
| `GpuHeatmap` | `charts.tsx` | `gpus, onPick?, compact?` | Util-bucket cells + status overrides; compact = smaller cells (overview: 72) |
| `useChartTheme` | `charts.tsx` | — | Grid/tooltip colors per theme |
| `ClusterEditor` | `ClusterEditor.tsx` | `cluster, onClose` | Modal (click-outside close): rename/region/scheduler/status/fabric/tags/storage/power/nodes/description, GPU-mix rows (auto totals), orchestration chip toggles; rejects empty mix; ID immutable |

---

## 8. Pages — `src/app/` (15 pages, all `"use client"` except layout)

| Route | Reads | Writes | Notes |
|---|---|---|---|
| `/` overview | everything + `history` | — | Hero CTAs; 6 KPIs; live stream + chips; donut + capacity; 72-cell heatmap; top-3 alerts; cluster/job previews; platform strip |
| `/clusters` | clusters/nodes/gpus | add/remove/update (via wizard + `ClusterEditor`) | Provisioning wizard (8-GPU steps); decommission confirm cascades |
| `/clusters/[id]` | cluster slice + `clusterHistory[id]` + partitions/jobs/activity | partition CRUD, `ClusterEditor` | KPIs, live stream, heatmap, nodes, hot GPUs, jobs, power bar + headroom line, cluster-scoped events card, partitions table (inline numeric editing) |
| `/cluster-detail` | — | — | Legacy alias → links to `/clusters` |
| `/nodes` | nodes/gpus/clusters | power caps, MIG, drain, node config | Search + filters; 220-cell heatmap; live inspector (Inspect/Configure tabs, `key={node.id}` form); empty state shows status census + fleet avg temp/power |
| `/workloads` | jobs (+gpuIds→nodes) | cancel/retry/restore | Status filters; Logs/Checkpoints tabs; pinned-placement line; manifest download |
| `/scheduler` | clusters/partitions/policy/users/jobs | `launchJob` | App→cluster→partition→resources; sliders clamped to `min(policy, partition)`; verdict from `clusterFreeGpus`; always-queued submit; right rail adds clickable per-cluster capacity bars (retargets form) |
| `/policies` | policy/users/jobs/clusters | `updateSchedPolicy` | Limit sliders, engine toggles, team weights, live queue-order preview, effective priorities, factory reset; empty queue shows per-cluster free-GPU bars |
| `/serving` | endpoints/clusters | endpoint CRUD/scale/policy | Policy editor, manual ±, deploy wizard, undeploy confirm; dashed Deploy card fills grid + shows live replica/RPS totals; module-scope `EndpointCard` (stable hooks across ticks) |
| `/users` | users/jobs | — | Budget bars, roles, live usage |
| `/billing` | clusters/jobs/users | — | Burned/projected/burn-multiple/top-team; burn chart; team donut + budget bars; top jobs; price book; CSV + JSON export |
| `/monitoring` | history/activity/gpus + `tick` | severity filter (local) | 4 live streams + sample counter, timeline spine, top-power, PROMQL card, latest-job-transitions feed |
| `/alerts` | rules/fired/clusters | rule CRUD/ack | Creator form (metric presets), armed/dimmed rule rows, firing feed, coverage strip (armed count, metrics, cooldowns) |
| `/diagnostics` | gpus/jobs | chat (local), diag runner, `pushActivity` | Signals card (throttled/down/queued + hottest GPU), rule-based agent (thermal/XID/queue/power/latency intents), staged `dcgmi` transcript, known-issues board |
| `/blueprints` | blueprints/clusters | snapshot/instantiate/import/export/delete | Template cards with partition counts, launch-by-name, file import with validation |

Layout (`layout.tsx`, server): metadata + theme boot script + `ThemeProvider` → `FleetProvider` → Sidebar + Topbar + `children` + `Footer`.

---

## 9. End-to-end traces (follow one action through all layers)

### A. Submit → start → complete → refund (the core loop)
1. `/scheduler` submit → `launchJob({…status:"queued"})` → quota reserved on user → timeline "awaiting scheduler" → push to `/workloads`.
2. Next tick: loop sorts queued by eff-priority → `freeFor(helios-prod)` covers 8 → status `running` + placement log → `allocateGpus` pins sampled GPUs → `gpuIds` recorded.
3. Each tick: `elapsed += simH`, `progress = elapsed/walltime` → bars, billing spend, checkpoints all move.
4. `elapsed ≥ walltime` → `completed` → pins released → quota refunded → timeline entry → next queued job starts same tick.

### B. Thermal alert fires
`tickGpu` pushes `vulcan-g06` L40S past 83 °C → rule `rule-thermal` (fleet scope, 120 s cooldown) matches hottest GPU → `fired[]` + timeline `[alert] …` → `/alerts` bell increments, monitoring rail shows it.

### C. Autoscale reacts to traffic
Endpoint RPS jitters above `target × 1.15` → replicas +1 (≤ max), status `scaling` → timeline `autoscaled up → N replicas` → p99 relaxes as load/replica falls → `/serving` card updates; policy edit changes the thresholds live.

### D. Blueprint → cluster
`/blueprints` Launch `helios-clone` → `instantiateBlueprint` → `addCluster` (status `provisioning`, fresh slice generated) + partitions cloned with new IDs → appears in `/clusters`, detail, scheduler picker, billing price book.

### E. GPU-mix edit reshapes the fleet
`ClusterEditor` H100×128 → H200×64 → `updateCluster` → totals updated → old slice dropped, `generateFleet([updated])` appended → heatmap/inspector show H200s → partitions' `gpuTypes` refreshed → timeline logs the keys changed.

---

## 10. Timings, caps & magic numbers

| Constant | Value | Where |
|---|---|---|
| Tick interval | 2500 ms, skipped when paused | store effect `[live]` |
| Sim speeds | 1 / 60 / 720 (default) / 3600 | Topbar → `simSpeed` |
| History buffer | 60 pts live, 48 seeded | store / `seedHistory` |
| Timeline / fired caps | 120 / 60 | `pushActivity`, tick |
| Sampling cap | 8 GPU nodes × 8 GPUs / cluster | `generateFleet` |
| Pin cap per job | 64 sampled GPUs | tick + boot |
| Busy bias | 72 % (`rand > 0.28`) | `generateFleet` |
| Util bases | idle 4 / throttled 95 / busy 78 | `tickGpu` |
| Temp clamp | 30–92 °C; thermal policy 83 °C | `tickGpu` / seeds+rules |
| Throttle clock | 1440 MHz (`SW_THERMAL`) | `tickGpu` |
| Autoscale hysteresis | up > 1.15×, down < 0.45× target | tick step 8 |
| RPS jitter | ±~4.5 %/tick, p99 ±25 + load bias | tick step 8 |
| Throttled util floor | sampled GPUs pinned only if idle | `allocateGpus` |
| LocalStorage keys | `helios-fleet-v2` (full mirror) · `helios-theme` | store / theme |
| Export sample | 25 GPUs in fleet JSON | Topbar |

---

## 11. Known simplifications (documented, not hidden)

1. **Sampled vs aggregate:** ~232 GPUs materialized of 480 provisioned. Capacity, billing, and verdicts use aggregates; heatmaps/inspectors/pins use the slice. Every sampled surface is labeled "sampled."
2. **Pins are best-effort:** a 64-GPU job pins at most 64 *visible idle* GPUs; the aggregate reservation is what the scheduler enforces.
3. **Session-only:** `fired`, `simSpeed`, `simHours`, `history` reset on reload; everything else persists.
4. **No backend:** autoscale, alerts, and scheduler decisions all run in the browser interval — timing granularity is 2.5 s by construction.
5. **Stale-while-restore:** `updateCluster` reads `clusters` from its (dep-tracked) closure and regenerates the slice synchronously — it never reads the updated record from inside another state updater, where it wouldn't exist yet.
