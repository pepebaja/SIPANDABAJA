"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { fromCents, sumCents } from "@/lib/money";
import { rankProviders, type ProviderStat, type RankBy } from "@/lib/provider-report";

/** Peringkat penyedia pelaksana pekerjaan: urut menurut total kontrak atau jumlah pekerjaan, dapat dicari dan dibatasi jumlahnya. */
export function ProviderRanking({ list }: { list: ProviderStat[] }) {
  const [by, setBy] = useState<RankBy>("contract"), [top, setTop] = useState(10), [q, setQ] = useState("");
  const ranked = useMemo(() => rankProviders(list, by), [list, by]);
  const s = q.trim().toLowerCase(), rows = ranked.filter((r) => !s || r.name.toLowerCase().includes(s)), shown = top === 0 ? rows : rows.slice(0, top);
  const totalPk = new Set(list.flatMap((p) => p.packages.map((k) => k.code))).size, totalContract = fromCents(sumCents(list.map((p) => p.contract)));
  const ctl = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm";
  if (!list.length) return <p className="text-slate-600">Belum ada penyedia yang tercatat. Pilih penyedia pada Input Realisasi atau kontrak paket.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="group" aria-label="Urutkan peringkat">{([["contract", "Total kontrak"], ["packages", "Jumlah pekerjaan"]] as const).map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)} className={`px-3 py-1.5 font-medium ${by === k ? "bg-navy-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{l}</button>)}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama penyedia" aria-label="Cari penyedia" className={`${ctl} min-w-48 flex-1`} />
        <select value={top} onChange={(e) => setTop(Number(e.target.value))} aria-label="Jumlah ditampilkan" className={ctl}><option value={10}>10 teratas</option><option value={25}>25 teratas</option><option value={0}>Semua</option></select>
      </div>
      <div className="table-wrap shadow-none"><table><caption className="sr-only">Peringkat penyedia berdasarkan {by === "contract" ? "total kontrak" : "jumlah pekerjaan"}</caption>
        <thead><tr><th scope="col" className="w-16">Peringkat</th><th scope="col">Nama penyedia</th><th scope="col" className="text-right">Jumlah pekerjaan</th><th scope="col" className="text-right">Total kontrak</th></tr></thead>
        <tbody>{shown.length ? shown.map((r) => <tr key={r.id}><td><span className={`badge tabular-nums ${r.rank <= 3 ? "badge-ok" : "badge-off"}`}>{r.rank}</span></td><td className="font-medium">{r.name}</td>
          <td className="text-right tabular-nums">{r.packages}</td><td className="text-right font-semibold tabular-nums">{Number(r.contract) > 0 ? formatRupiah(r.contract) : <span className="font-normal text-slate-500">belum ada kontrak</span>}</td></tr>)
          : <tr><td colSpan={4} className="py-4 text-center text-slate-600">Tidak ada penyedia yang cocok.</td></tr>}</tbody>
        <tfoot><tr className="font-semibold"><td colSpan={2} className="px-3.5 py-3">Total {list.length} penyedia</td><td className="px-3.5 py-3 text-right tabular-nums">{totalPk}</td><td className="px-3.5 py-3 text-right tabular-nums">{formatRupiah(totalContract)}</td></tr></tfoot></table></div>
      <p className="text-xs text-slate-500">Jumlah pekerjaan = paket (kode RUP unik) yang dilaksanakan penyedia dalam tahun anggaran ini (seluruh tahapan); total kontrak = nilai kontrak/SP pada paket tersebut. <Link href="/laporan/penyedia" className="link">Laporan lengkap per penyedia →</Link></p>
    </div>);
}
