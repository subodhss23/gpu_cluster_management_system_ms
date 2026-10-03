export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

export function pct(used: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 1000) / 10);
}

export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const STATUS_COLOR: Record<string, string> = {
  healthy: "text-nv",
  running: "text-nv",
  serving: "text-nv",
  idle: "text-muted",
  queued: "text-amberx",
  provisioning: "text-amberx",
  scaling: "text-amberx",
  degraded: "text-amberx",
  throttled: "text-amberx",
  drain: "text-amberx",
  down: "text-rose",
  failed: "text-rose",
  error: "text-rose",
  completed: "text-cyanx",
  success: "text-nv",
  info: "text-cyanx",
  warn: "text-amberx",
  cancelled: "text-muted",
  allocated: "text-cyanx",
  busy: "text-nv",
  sliced: "text-violetx"
};
