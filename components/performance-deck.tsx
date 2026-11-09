"use client";
import { useEffect, useMemo, useState } from "react";
import { buildPerformance, NO_OFFICER, progressOf, type PerfPackage, type OfficerStat } from "@/lib/officer-performance";
import type { PrintProfile } from "@/lib/settings";
import { formatRupiah } from "@/lib/format";
import { analyzeEpurchasing, narrateEpurchasing, type EpItem, type MethodStat } from "@/lib/epurchasing-analysis";

const rp = (v: string) => formatRupiah(v), pc = (v: string | null) => (v === null ? "N/A" : `${v.replace(".", ",")}%`);
const dt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const num = (v: string | null) => (v === null ? 0 : Number(v));

function Bar({ label, n, max, tone = "bg-cyan-600" }: { label: string; n: number; max: number; tone?: string }) {
  return <div className="grid grid-cols-[minmax(0,12rem)_1fr_2.5rem] items-center gap-2 text-sm"><span className="truncate" title={label}>{label}</span>
    <span className="h-3 rounded bg-slate-100"><span className={`block h-3 rounded ${tone}`} style={{ width: `${max ? Math.max(2, (n / max) * 100) : 0}%` }} /></span><span className="text-right tabular-nums font-semibold">{n}</span></div>;
}
function Kpi({ t, v, s }: { t: string; v: string; s?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t}</p><p className="mt-1 font-display text-2xl font-bold tabular-nums text-navy-800">{v}</p>{s && <p className="text-xs text-slate-600">{s}</p>}</div>;
}

/** Laporan kinerja pejabat pengadaan berformat presentasi (kerangka laporan tata naskah dinas): navigasi papan ketik, filter pejabat, dan cetak/PDF. */
export function PerformanceDeck({ pkgs, epItems, today, year, stageName, profile, printer }: { pkgs: PerfPackage[]; epItems: EpItem[]; today: string; year: number; stageName: string; profile: PrintProfile; printer: { name: string; nip: string | null } }) {
  const [officer, setOfficer] = useState("*"), [i, setI] = useState(0), [drill, setDrill] = useState<string | null>(null);
  const [dasar, setDasar] = useState("Ketentuan peraturan perundang-undangan tentang pengadaan barang/jasa pemerintah yang berlaku, serta Dokumen Pelaksanaan Anggaran dan Rencana Umum Pengadaan tahun anggaran " + year + ".");
  const [simpulan, setSimpulan] = useState(""), [saran, setSaran] = useState("");
  const list = useMemo(() => (officer === "*" ? pkgs : pkgs.filter((p) => (p.officer || NO_OFFICER) === officer)), [pkgs, officer]);
  const perf = useMemo(() => buildPerformance(list, today), [list, today]);
  const all = useMemo(() => buildPerformance(pkgs, today), [pkgs, today]), a = perf.all;
  const officers = all.officers.map((o) => o.officer);
  const epA = useMemo(() => analyzeEpurchasing(officer === "*" ? epItems : epItems.filter((x) => x.hasPackage && (x.officer || NO_OFFICER) === officer)), [epItems, officer]), epText = narrateEpurchasing(epA);
  const mrow = (m: MethodStat, strong = false) => <tr key={m.name} className={`border-b ${strong ? "font-semibold" : ""} ${m.isEp ? "bg-cyan-50" : ""}`}><td className="py-1">{m.name}</td><td className="text-right">{m.items}</td><td className="text-right">{pc(m.sharePkg)}</td><td className="text-right tabular-nums">{rp(m.pagu)}</td><td className="text-right">{pc(m.sharePagu)}</td><td className="text-right tabular-nums">{rp(m.avgPagu)}</td><td className="text-right tabular-nums">{m.contracted ? rp(m.contract) : "-"}</td><td className="text-right">{pc(m.contractPct)}</td><td className="text-right tabular-nums">{rp(m.realized)}</td><td className="text-right">{pc(m.absorption)}</td></tr>;
  const auto = [
    `Dari ${a.total} paket, ${a.selesai} paket (${pc(a.completion)} dari paket aktif) telah selesai, ${a.diproses} paket sedang diproses, ${a.persiapan} paket masih tahap persiapan, dan ${a.batalTunda} paket dibatalkan/ditunda.`,
    a.onTimePct !== null ? `Ketepatan waktu serah terima paket selesai ${pc(a.onTimePct)} (${a.onTime} tepat waktu, ${a.late} terlambat).` : "Ketepatan waktu belum dapat dihitung karena belum ada paket selesai dengan tenggat dan tanggal serah terima.",
    `${a.overdue} paket melewati tenggat dan belum selesai per ${dt(today)}.`,
    a.contract !== "0.00" ? `Nilai kontrak/SP ${rp(a.contract)} terhadap pagu paket bernilai kontrak; selisih ${rp(a.saving)}.` : "Belum ada nilai kontrak/SP yang tercatat.",
    ...epText.slice(0, 2),
  ];
  const slides: { title: string; body: React.ReactNode }[] = [
    { title: "Sampul", body: <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-600">{profile.orgName || "Perangkat Daerah"}</p>
      <h1 className="font-display text-3xl font-extrabold text-navy-800 md:text-4xl">LAPORAN KINERJA<br />PEJABAT PENGADAAN</h1>
      <p className="text-lg">Tahun Anggaran {year} · Tahapan {stageName}</p>
      <p className="text-sm text-slate-600">{officer === "*" ? "Seluruh pejabat pengadaan" : officer} · Data per {dt(today)}</p></div> },
    { title: "I. Pendahuluan", body: <div className="space-y-3 text-sm"><div><h3 className="font-bold">A. Dasar</h3><textarea aria-label="Dasar penyusunan" value={dasar} onChange={(e) => setDasar(e.target.value)} rows={3} className="no-print mt-1 w-full" /><p className="print-only whitespace-pre-wrap">{dasar}</p></div>
      <div><h3 className="font-bold">B. Maksud dan tujuan</h3><p>Memberikan gambaran kinerja pejabat pengadaan secara akurat dan akuntabel sebagai bahan pengendalian, evaluasi, dan pengambilan keputusan pimpinan.</p></div>
      <div><h3 className="font-bold">C. Ruang lingkup</h3><p>Paket pengadaan tahun {year} tahapan {stageName}: {pkgs.length} paket, {officers.filter((o) => o !== NO_OFFICER).length} pejabat pengadaan. Sumber data: modul Paket pengadaan SIPANDABAJA; angka dihitung otomatis tanpa penilaian subjektif.</p></div></div> },
    { title: "II. Ringkasan kinerja", body: <div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi t="Paket" v={String(a.total)} s={`Pagu ${rp(a.pagu)}`} /><Kpi t="Penyelesaian" v={pc(a.completion)} s={`${a.selesai} selesai`} /><Kpi t="Tepat waktu" v={pc(a.onTimePct)} s={`${a.onTime} dari ${a.onTime + a.late} selesai`} /><Kpi t="Lewat tenggat" v={String(a.overdue)} s="belum selesai" /></div>
      <div className="grid gap-4 md:grid-cols-2"><div className="space-y-1.5"><h3 className="text-sm font-bold">Progres paket</h3>{[["Selesai", a.selesai, "bg-emerald-600"], ["Diproses", a.diproses, "bg-cyan-600"], ["Persiapan", a.persiapan, "bg-amber-500"], ["Batal/Tunda", a.batalTunda, "bg-slate-400"]].map(([l, n, t]) => <Bar key={l as string} label={l as string} n={n as number} max={a.total} tone={t as string} />)}</div>
        <div className="space-y-1.5"><h3 className="text-sm font-bold">Nilai</h3><p className="text-sm">Pagu paket: <b>{rp(a.pagu)}</b></p><p className="text-sm">Nilai kontrak/SP: <b>{rp(a.contract)}</b></p><p className="text-sm">Selisih terhadap pagu (paket berkontrak): <b>{rp(a.saving)}</b></p><p className="text-xs text-slate-500">Nilai kontrak/SP adalah komitmen, bukan realisasi keuangan.</p></div></div></div> },
    { title: "III. Kegiatan: status paket", body: <div className="space-y-1.5"><p className="mb-2 text-sm">Sebaran paket menurut status pada siklus pengadaan.</p>{perf.statuses.length ? perf.statuses.map((s) => <Bar key={s.name} label={s.name} n={s.n} max={perf.statuses[0]!.n} />) : <p className="text-sm text-slate-600">Belum ada paket.</p>}</div> },
    { title: "IV. Hasil: kinerja per pejabat", body: <div className="space-y-2"><p className="no-print text-xs text-slate-600">Klik nama pejabat untuk melihat rincian paketnya.</p><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left"><th className="py-1">Pejabat</th><th className="text-right">Paket</th><th className="text-right">Selesai</th><th className="text-right">Diproses</th><th className="text-right">Penyelesaian</th><th className="text-right">Tepat waktu</th><th className="text-right">Lewat tenggat</th><th className="text-right">Rerata proses (hari)</th><th className="text-right">Pagu</th></tr></thead>
      <tbody>{perf.officers.map((o: OfficerStat) => <tr key={o.officer} className="border-b"><td className="py-1"><button className="link text-left" onClick={() => setDrill(drill === o.officer ? null : o.officer)}>{o.officer}</button></td><td className="text-right">{o.total}</td><td className="text-right">{o.selesai}</td><td className="text-right">{o.diproses}</td><td className="text-right">{pc(o.completion)}</td><td className="text-right">{pc(o.onTimePct)}</td><td className="text-right">{o.overdue}</td><td className="text-right">{o.avgDays ?? "-"}</td><td className="text-right tabular-nums">{rp(o.pagu)}</td></tr>)}</tbody></table></div>
      {drill && <div className="rounded-lg border border-slate-200 p-2 text-xs"><p className="font-bold">Paket: {drill}</p><ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{list.filter((p) => (p.officer || NO_OFFICER) === drill).map((p) => <li key={p.id}>{p.code} · {p.name} · <i>{p.statusName}</i> · {rp(p.pagu)}{p.due ? ` · tenggat ${dt(p.due)}` : ""}</li>)}</ul></div>}</div> },
    { title: "V. Analisis e-purchasing", body: <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Kpi t="Paket e-purchasing" v={String(epA.ep.items)} s={`${pc(epA.ep.sharePkg)} dari ${epA.total.items} paket`} /><Kpi t="Pagu RUP e-purchasing" v={rp(epA.ep.pagu)} s={`${pc(epA.ep.sharePagu)} dari total pagu`} />
        <Kpi t="Nilai kontrak/SP" v={epA.ep.contracted ? rp(epA.ep.contract) : "-"} s={`${epA.ep.contracted} paket bernilai kontrak`} /><Kpi t="Realisasi diakui" v={rp(epA.ep.realized)} s={`serapan ${pc(epA.ep.absorption)} dari pagu RUP`} /></div>
      <div className="overflow-x-auto"><table className="w-full"><caption className="sr-only">Perbandingan e-purchasing dengan metode pemilihan lainnya</caption><thead><tr className="border-b text-left"><th className="py-1">Metode pemilihan</th><th className="text-right">Paket</th><th className="text-right">% paket</th><th className="text-right">Pagu RUP</th><th className="text-right">% pagu</th><th className="text-right">Rata-rata pagu</th><th className="text-right">Nilai kontrak</th><th className="text-right">Kontrak/pagu</th><th className="text-right">Realisasi</th><th className="text-right">Serapan</th></tr></thead>
        <tbody>{mrow(epA.ep, true)}{mrow(epA.others, true)}{mrow(epA.total, true)}</tbody>
        <tbody><tr><td colSpan={10} className="pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Rincian per metode (pagu RUP terbesar)</td></tr>{epA.methods.map((m) => mrow(m))}</tbody></table></div>
      <div className="space-y-1"><h3 className="text-sm font-bold">Analisis</h3><ol className="list-decimal space-y-1 pl-5 text-sm">{epText.map((t, k) => <li key={k}>{t}</li>)}</ol></div>
      <p className="text-[11px] text-slate-500">Pagu = pagu RUP paket; serapan = realisasi diakui (bertanggal SPM/SP2D, kumulatif tahapan) / pagu RUP; nilai kontrak hanya dari paket yang sudah bernilai kontrak/SP. Paket batal/tunda tidak dianalisis{epA.cancelled ? ` (${epA.cancelled} paket)` : ""}. Paket RUP yang belum dibuat paket pengadaannya dikelompokkan menurut rencana metode RUP.</p></div> },
    { title: "VI. Kendala dan paket terlambat", body: <div className="grid gap-4 md:grid-cols-2"><div className="space-y-1.5"><h3 className="text-sm font-bold">Kategori kendala</h3>{perf.obstacles.length ? perf.obstacles.map((o) => <Bar key={o.name} label={o.name} n={o.n} max={perf.obstacles[0]!.n} tone="bg-amber-500" />) : <p className="text-sm text-slate-600">Tidak ada kendala yang dicatat.</p>}</div>
      <div><h3 className="text-sm font-bold">Paket melewati tenggat ({perf.overdue.length})</h3><ul className="mt-1 max-h-60 space-y-0.5 overflow-y-auto text-xs">{perf.overdue.slice(0, 15).map((p) => <li key={p.id}>{p.code} · {p.name} · tenggat {dt(p.due!)} · {p.statusName}</li>)}{perf.overdue.length > 15 && <li className="text-slate-500">dan {perf.overdue.length - 15} paket lainnya</li>}{!perf.overdue.length && <li className="text-slate-600">Tidak ada.</li>}</ul></div></div> },
    { title: "VII. Simpulan dan saran", body: <div className="space-y-2 text-sm"><h3 className="font-bold">Simpulan (otomatis dari data)</h3><ol className="list-decimal space-y-1 pl-5">{auto.map((t, k) => <li key={k}>{t}</li>)}</ol>
      <label className="no-print block text-xs font-semibold">Simpulan tambahan (opsional)<textarea value={simpulan} onChange={(e) => setSimpulan(e.target.value)} rows={2} className="mt-1 w-full font-normal" /></label>{simpulan && <p className="print-only">{simpulan}</p>}
      <h3 className="font-bold">Saran</h3><label className="no-print block text-xs">Tuliskan saran tindak lanjut (mis. percepatan paket terlambat)<textarea value={saran} onChange={(e) => setSaran(e.target.value)} rows={3} className="mt-1 w-full" /></label><p className="print-only whitespace-pre-wrap">{saran || "-"}</p></div> },
    { title: "VIII. Penutup", body: <div className="flex h-full flex-col justify-between text-sm"><p>Demikian laporan kinerja pejabat pengadaan ini disusun berdasarkan data yang tercatat dalam aplikasi untuk digunakan sebagaimana mestinya. Kelengkapan dan kebenaran data menjadi tanggung jawab pengguna yang menginput.</p>
      <div className="grid grid-cols-2 gap-6 pt-6 text-center"><div><p>Disusun oleh,</p><div className="h-16" /><p className="font-bold underline">{printer.name}</p>{printer.nip && <p>NIP {printer.nip}</p>}</div>
        <div><p>{profile.city ? `${profile.city}, ` : ""}{dt(today)}</p><p>{profile.headTitle}</p><div className="h-12" /><p className="font-bold underline">{profile.headName || "................................"}</p>{profile.headNip && <p>NIP {profile.headNip}</p>}</div></div></div> },
  ];
  useEffect(() => { const k = (e: KeyboardEvent) => { if (["TEXTAREA", "INPUT", "SELECT"].includes((e.target as HTMLElement).tagName)) return; if (e.key === "ArrowRight" || e.key === "PageDown") setI((x) => Math.min(slides.length - 1, x + 1)); if (e.key === "ArrowLeft" || e.key === "PageUp") setI((x) => Math.max(0, x - 1)); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [slides.length]);
  const slide = (s: (typeof slides)[number], n: number, key?: number) => (
    <article key={key} className="deck-slide flex aspect-video min-h-[26rem] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      {n > 0 && <header className="mb-3 border-b border-slate-200 pb-2"><p className="text-[11px] uppercase tracking-wider text-slate-500">{profile.orgName} · Laporan kinerja pejabat pengadaan {year}</p><h2 className="text-lg">{s.title}</h2></header>}
      <div className="min-h-0 flex-1 overflow-y-auto">{s.body}</div><footer className="mt-2 text-right text-[11px] text-slate-500">Hal. {n + 1} / {slides.length}</footer></article>);
  return (
    <div className="space-y-4">
      <style>{`.print-only{display:none}@media print{@page{size:A4 landscape;margin:10mm}.no-print{display:none!important}.print-only{display:block}.deck-slide{break-after:page;aspect-ratio:auto;min-height:0;box-shadow:none;border:0;height:185mm}.deck-all>*:not(.deck-slide){display:none}}`}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Laporan</p><h1 className="page-title">Kinerja pejabat pengadaan <span className="page-sub">Tahun {year} · {stageName}</span></h1></div>
        <div className="flex flex-wrap items-end gap-2"><label className="text-xs">Pejabat<select value={officer} onChange={(e) => { setOfficer(e.target.value); setDrill(null); }} className="mt-0.5 block"><option value="*">Semua pejabat</option>{officers.map((o) => <option key={o}>{o}</option>)}</select></label>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Cetak / simpan PDF</button></div></div>
      {!pkgs.length && <p className="alert alert-info max-w-xl">Belum ada paket pengadaan pada tahapan ini.</p>}
      <div className="no-print">{slide(slides[i]!, i)}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>← Sebelumnya</button>
          <div className="flex flex-wrap gap-1">{slides.map((s, k) => <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}: ${s.title}`} aria-current={k === i} className={`h-2.5 w-6 rounded-full ${k === i ? "bg-navy-800" : "bg-slate-300"}`} />)}</div>
          <button className="btn btn-primary btn-sm" disabled={i === slides.length - 1} onClick={() => setI(i + 1)}>Berikutnya →</button></div>
        <p className="mt-1 text-center text-xs text-slate-500">Gunakan tombol panah ← → pada papan ketik.</p></div>
      <div className="deck-all print-only">{slides.map((s, k) => slide(s, k, k))}</div>
    </div>
  );
}
