# Technical Design — Helios GPU Management System

## 1. Architecture (Vercel-native, DB-free)
```
Next.js 14 App Router (static + client components)
│
├─ src/data/*.json ......... seed truth (clusters, users, jobs, endpoints, activity,
│                             gpu-catalog, alert-rules)
├─ src/lib/sim.ts ........... deterministic fleet generator + live tick (mulberry32 PRNG),
│                             allocate/releaseGpu helpers, clusterFreeGpus, defaultPartitions,
│                             DEFAULT_SCHED_POLICY
├─ src/lib/store.tsx ........ FleetProvider (React context, 2.5s lifecycle tick,
│                             localStorage mirror under helios-fleet-v2)
├─ src/lib/types.ts ......... Cluster/SimNode(+config)/SimGpu/SimJob(+partition)/
│                             ServeEndpoint(+policy)/AlertRule/FiredAlert/PartitionCfg/
│                             SchedPolicy/Blueprint/JobCheckpoint
├─ src/lib/finops.ts ........ catalog pricing, spend/projection, CSV, team budgets
├─ src/lib/checkpoints.ts .... deterministic resume points per job
├─ src/lib/theme.tsx ........ dark/light ThemeProvider + no-flash boot
├─ src/lib/analytics.ts .... PostHog wrapper: init-once if NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
│                             set (defaults 2026-05-30, app=gpu_management_system_app1_ms tag),
│                             else silent no-op; ~25 explicit operator events (tick internals excluded)
├─ src/components/* ......... Sidebar, Topbar (live/speed/theme/export/reset),
│                             Footer (live status bar), cards, charts (theme-aware,
│                             compact heatmap), ClusterEditor
└─ src/app/*/page.tsx ....... 15 pages, all client-rendered from context
```
No API routes, no server actions, no env vars → deploys to Vercel as a standard Next.js app.
`vercel.json` pins `framework: nextjs`. Node ≥ 18.

## 2. Data model
- **clusters.json** is the aggregate truth: `gpuMix`, `totalGPUs`, `totalNodes`, `fabric`,
  `storagePB`, `powerCapKW`, `scheduler`, `orchestration[]`. Fleet KPIs are computed from it.
- **nodes/gpus are derived**, not stored: `generateFleet(clusters)` materializes 1 head node +
  up to 8 GPU nodes × 8 GPUs per cluster with a seeded RNG (identical on every load).
  Each GPU carries DCGM fields: `utilPct, memUsedGB, tempC, powerW, powerLimitW, smClockMHz,
  memClockMHz, mig{Enabled,Slices}, eccErrors, throttleReason, jobId, status`.
- **jobs.json / users.json / endpoints.json / activity.json / alert-rules.json** seed the
  scheduler, quotas, serving, timeline and alert rules. Runtime mutations (launch/cancel/
  requeue/restore, add/update/remove cluster, node config, power caps, MIG, drain, endpoint
  CRUD + scaling + policies, alert rules, partitions, scheduling policy, blueprints) live in
  context and mirror `{clusters, jobs, users, endpoints, rules, nodes, gpus, partitions,
  schedPolicy, blueprints}` to localStorage key `helios-fleet-v2` (in-memory + JSON requirement).
- Nodes carry operator-tunable config (`labels, taints, features, nodePowerCapW, maxJobs`);
  partitions (`PartitionCfg`) and scheduling policy (`SchedPolicy`) are first-class state with
  starter values from `defaultPartitions()` / `DEFAULT_SCHED_POLICY`; blueprints snapshot
  `{cluster, partitions}` for re-instantiation.
- Export = `downloadJson("helios-fleet-export.json", …)` from Topbar; billing adds chargeback CSV.
- Export = `downloadJson("helios-fleet-export.json", …)` from Topbar.

## 3. Simulation engine (`sim.ts`)
- `seededRand(seed)` (mulberry32) + `hashStr` → deterministic per-cluster streams.
- `generateFleet()`: busy-biased utils (72% busy), degraded cluster gets a hot 87°C node,
  helios-prod-g14 GPU-5 is XID-79 down, edge-dev tail nodes are `provisioning`.
- `tickGpu()` every 2.5s: mean-reverting util random-walk, temp follows util, power follows
  util × powerLimit, throttled GPUs pinned to 1440MHz SM clock.
- **Lifecycle engine (wave 4, same tick):** sim-hours advance by `speed × 2.5s`; running jobs
  derive progress from `elapsed/walltime` and complete at walltime (GPU release via
  `releaseJobGpus`, quota refund, timeline entry); queued jobs start in effective-priority
  order while `clusterFreeGpus` (provisioned − running) covers them, with sampled-slice
  pinning via `allocateGpus` (best-effort visual, aggregate math stays truthful).
  `simSpeed` (1/60/720/3600) and `simHours` are session-only; quotas mutate live on
  submit/cancel/retry/complete.
- `seedTelemetryPoints(n)`: 1-min synthetic fleet series (util/power/temp/mem/jobs) for charts.

## 4. State (`store.tsx`)
Single `FleetProvider` exposes fleet slices (clusters/nodes/gpus/users/jobs/endpoints/activity/
rules/fired/partitions/schedPolicy/blueprints), clocks (`live/tick/simSpeed/simHours`), and actions:
`toggleLive/setSimSpeed`, cluster CRUD (`addCluster/updateCluster/removeCluster`, mix edits reshape
the sampled slice), `updateNode`, job lifecycle (`launchJob` reserves quota + queues, `cancelJob`
releases pins + quota, `retryJob` re-queues), `setGpuPowerLimit/setMig/drainNode/undrainNode`,
endpoint CRUD + `scaleEndpoint/updatePolicy`, alert CRUD + `ackFired`, partition CRUD,
`updateSchedPolicy`, blueprint CRUD + `instantiateBlueprint`, `resetDemo/pushActivity`.
The 2.5s interval reads via refs (never re-subscribes) and stays side-effect-pure outside `set*`
calls; persistence effect writes the full mirror; mount effect restores it.

## 5. Rendering & charts
- Recharts: `FleetArea` (gradient area, adjustable height), `ModelDonut`, `MiniBars` (adjustable
  height), `GpuHeatmap` (div grid, `compact` cell mode, color buckets by util + status override).
  Tooltips/grid/ticks adapt to the active theme via `useTheme()`.
- No SSR data fetching; pages are `"use client"` and read context. Layout stays a server
  component wrapping the client providers (Next pattern); a pre-paint inline script restores the
  saved theme class to avoid a flash.
- Tailwind v3 theme tokens: `void/panel/panel2/panel3/line/nv/nv-dim/amberx/cyanx/violetx/rose`;
  `globals.css` carries the full `html.light` override layer (surfaces, text ramp, brand tones)
  while terminal `<pre>` blocks stay dark in both modes.

## 6. Routing
| Route | Purpose |
|---|---|
| `/` | Fleet overview (hero, KPIs, streams, heatmap, alerts, previews) |
| `/clusters` | Fleet list + provisioning wizard + decommission |
| `/clusters/[id]` | Single-cluster deep view |
| `/nodes` | Node/GPU inventory + inspector + power caps + drain |
| `/workloads` | Queue table + logs + cancel/requeue |
| `/scheduler` | Launch wizard (resources + fractional + quota + estimate) |
| `/serving` | GPUStack endpoints |
| `/users` | Quotas |
| `/billing` | FinOps: metered spend, budgets, chargeback CSV |
| `/policies` | Scheduling policy console (limits, engines, team weights, queue preview) |
| `/blueprints` | Config templates: snapshot, instantiate, JSON import/export |
| `/monitoring` | 4-stream charts + timeline + top-power + PROMQL |
| `/alerts` | Rules engine: 5 metrics, live evaluation, ack feed |
| `/diagnostics` | Ops-agent chat (rule-based) + DCGM runner + known issues |

Wave-2 store additions: `setMig`, endpoint CRUD (`addEndpoint/removeEndpoint/scaleEndpoint/updatePolicy`),
alert CRUD (`addRule/removeRule/toggleRule/ackFired`), tick-driven autoscale (RPS jitter, hysteresis,
timeline entries) and rule evaluation (scope filter, per-rule cooldown, mirrored to activity).
New libs: `finops.ts` (catalog pricing, spend/projection, CSV), `checkpoints.ts` (deterministic
resume points), `alert-rules.json` seeds. Endpoints + rules persist to localStorage alongside clusters/jobs.

Wave-3 additions: `updateCluster` (mix edits regenerate the cluster's sampled slice + refresh
partition GPU types), `updateNode`, partition CRUD, `updateSchedPolicy`, blueprint CRUD +
`instantiateBlueprint` (cluster + partitions provisioned together). Persistence grew to the full
mirror under `helios-fleet-v2`; seed-job GPU pins are computed in the lazy initializer so the
heatmap is truthful on first paint.

Wave-4 additions: `allocateGpus/releaseJobGpus/clusterFreeGpus` in `sim.ts`; tick now advances
sim-hours by `simSpeed × 2.5s`, completes jobs at walltime (pin + quota release, timeline entries),
and starts queued jobs by effective priority while aggregate GPUs are free. `simSpeed/simHours`
are session-only; `users` quota fields mutate live on submit/cancel/retry/complete.

Rolling chart history (same tick): `snapshotTelemetry()` aggregates the ticked GPUs (avg
util/temp/mem, total power, running count) into fleet + per-cluster 60-point buffers (`history` /
`clusterHistory`), backfilled at boot by `seedHistory()` random-walking into the live values.
Overview, monitoring, and cluster-detail charts render these buffers, so every chart visibly
moves each tick — no frozen seed series anywhere.

## 7. Scale story (how we fake 100k nodes honestly)
Aggregates (480 GPUs, 65 nodes) come from JSON; only a representative slice is materialized
for interactivity. Every sampled surface is labeled "sampled". Phase 2b adds virtualized tables
+ IB topology canvas without changing the store contract.

## 8. Failure injection (built-in)
XID-79 down GPU, SW_THERMAL throttle, failed NCCL job with checkpoint preserved, degraded
cluster, provisioning wizard, queued backlog — all seeded so every demo hits the same story.

## 9. Testing & verification
`npm run build` (typecheck + route compile, 17 routes) is the gate, plus `npx tsc --noEmit`.
Manual script in `instructions.md` covers the acceptance flows end to end (now 10 steps incl.
policy/blueprint/lifecycle paths). Sim math (`allocateGpus`, `releaseJobGpus`,
`clusterFreeGpus`, seed determinism, tick bounds) is additionally verified ad-hoc by compiling
`sim.ts` standalone and asserting in Node. No unit framework shipped yet (deliberate, keeps
install < 60s); vitest + Playwright remain the proposed next step.

## 10. File map
`package.json, next.config.js, tailwind.config.js, postcss.config.js, tsconfig.json, vercel.json,
.gitignore, prd.md, technical_design.md, design_document.md, features.md, instructions.md, README.md,
src/app/{layout,page,globals.css}, src/app/{clusters,nodes,workloads,scheduler,serving,users,
billing,policies,blueprints,monitoring,alerts,diagnostics,cluster-detail}/page.tsx,
src/app/clusters/[id]/page.tsx, src/components/{Sidebar,Topbar,Footer,cards,charts,
ClusterEditor}.tsx, src/lib/{types,sim,store,utils,finops,checkpoints,theme}.ts(x),
src/data/{clusters,users,jobs,endpoints,activity,gpu-catalog,alert-rules}.json`
