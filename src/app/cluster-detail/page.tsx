import Link from "next/link";

export default function ClusterDetailLegacy() {
  return (
    <div className="glass rounded-2xl p-8 text-sm text-zinc-300">
      <h1 className="text-lg font-bold text-white">Cluster detail has moved</h1>
      <p className="mt-2 text-zinc-400">Per-cluster deep views now live under <span className="font-mono text-nv">/clusters/[id]</span>.</p>
      <Link href="/clusters" className="mt-4 inline-block rounded-lg bg-nv px-4 py-2 font-semibold text-black">Go to clusters →</Link>
    </div>
  );
}
