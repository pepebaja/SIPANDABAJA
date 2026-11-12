import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getPrintProfile } from "@/lib/server/print-profile";
import { ROLE_LABELS } from "@/lib/rbac";
import { Sheet } from "@/components/report-sheet";
import { PrintButton } from "@/components/print-button";
import { rp } from "@/lib/format";
import { fmtDate, fmtDateTime } from "@/lib/date";
import { DOC_LABEL, JENIS_LABEL } from "@/lib/procurement-profile";
import { loadPackageExecutions } from "@/lib/server/package-executions";
import { summarizeExecutions } from "@/lib/package-executions";
import { parseRupiah } from "@/lib/import/parse";
export const metadata = { title: "Lembar rincian paket" };
const Person = (o: any) => (o ? `${o.name}${o.nip ? ` (NIP ${o.nip})` : ""}` : "-");

export default async function CetakPaket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await getSession(); if (!s) return null;
  const sb = await createClient();
  const { data: p } = await sb.from("procurement_packages").select("*, rup:rup_packages(rup_code, name), method:procurement_methods(name), ppbj:officials!ppbj_id(name, nip), ppk:officials!ppk_id(name, nip), pptk:officials!pptk_id(name, nip)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [profile, st, ev, ct, al, exec] = await Promise.all([getPrintProfile(s),
    sb.from("package_statuses").select("code, name").eq("organization_id", p.organization_id),
    sb.from("procurement_events").select("id, from_status, to_status, created_at").eq("procurement_package_id", id).order("created_at"),
    sb.from("contracts_or_orders").select("id, doc_type, doc_number, doc_date, selection_result_value, contract_value, description, provider:providers(name)").eq("procurement_package_id", id).order("created_at"),
    p.rup_package_id ? sb.from("package_budget_allocations").select("id, amount, entry:budget_entries(description, subactivities(code), expenditure_accounts(code))").eq("rup_package_id", p.rup_package_id) : Promise.resolve({ data: [] as any[] }),
    loadPackageExecutions(sb, p)]);
  const sum = summarizeExecutions(exec, parseRupiah(p.pagu) ?? "0.00");
  const sn = new Map((st.data ?? []).map((x) => [x.code, x.name])), name = (c: string) => sn.get(c) ?? c;
  const rows: [string, React.ReactNode][] = [
    ["Nama paket", p.name], ["Kode RUP (kode paket)", p.rup ? `${p.rup.rup_code} (${p.rup.name})` : "Belum ada kode RUP"],
    ["Jenis pengadaan", p.procurement_type ? JENIS_LABEL[p.procurement_type] : "-"], ["Cara pelaksanaan", p.execution_mode === "swakelola" ? "Swakelola" : "Melalui penyedia"], ["Metode pemilihan", p.method?.name ?? "-"], ["Sifat paket", p.is_recurring ? "Berulang (banyak pelaksanaan)" : "Sekali pelaksanaan"], ["Asal data", p.carried_from ? "Dibawa dari tahapan sebelumnya" : "Dibuat pada tahapan ini"], ["Pagu", rp(p.pagu)], ["Status", name(p.status)],
    ["PPBJ", Person(p.ppbj)], ["PPK", Person(p.ppk)], ["PPTK", Person(p.pptk)],
    ["Mulai proses", fmtDate(p.process_start)], ["Selesai proses", fmtDate(p.process_end)],
    ["Tenggat", fmtDate(p.due_date)], ["Serah terima", fmtDate(p.handover_date)], ["Kategori kendala", p.obstacle_category ?? "-"], ["Catatan", p.notes ?? "-"]];
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3"><Link href={`/paket/${id}`} className="link text-sm">← Kembali ke paket</Link><PrintButton label="Cetak lembar" /></div>
      <Sheet profile={profile} title="Lembar Rincian Paket Pengadaan" subtitle={`${p.internal_code} · ${p.name}`} printer={{ name: s.profile.full_name, nip: s.profile.nip, role: s.roles[0] ? ROLE_LABELS[s.roles[0]] : "Pengguna" }}>
        <dl className="kv">{rows.map(([k, v]) => <div key={k} className="contents"><dt>{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
        <h3>Kontrak / SP / dokumen pelaksanaan</h3>
        {ct.data?.length ? <table><thead><tr><th>Bentuk</th><th>Nomor</th><th>Tanggal</th><th>Penyedia</th><th>Uraian</th><th className="text-right">Hasil pemilihan</th><th className="text-right">Nilai</th></tr></thead>
          <tbody>{ct.data.map((c: any) => <tr key={c.id}><td>{DOC_LABEL[c.doc_type as keyof typeof DOC_LABEL] ?? c.doc_type}</td><td>{c.doc_number ?? "-"}</td><td>{fmtDate(c.doc_date)}</td><td>{c.provider?.name ?? "-"}</td><td>{c.description ?? "-"}</td><td className="text-right">{rp(c.selection_result_value)}</td><td className="text-right">{rp(c.contract_value)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-slate-600">Belum ada kontrak/SP tercatat.</p>}
        <h3>Alokasi anggaran</h3>
        {al.data?.length ? <table><thead><tr><th>Rekening anggaran</th><th className="text-right">Alokasi</th></tr></thead>
          <tbody>{al.data.map((a: any) => <tr key={a.id}><td>{a.entry?.subactivities?.code ?? ""} / {a.entry?.expenditure_accounts?.code ?? ""}: {a.entry?.description}</td><td className="text-right">{rp(a.amount)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-slate-600">{p.rup_package_id ? "Belum ada alokasi pada paket RUP terkait." : "Paket belum ditautkan ke paket RUP."}</p>}
        <h3>Rincian pelaksanaan (realisasi)</h3>
        <p className="text-sm">Jumlah pelaksanaan <b>{sum.count}</b> · total terpakai <b>{rp(sum.total)}</b> (diakui {rp(sum.recognized)}) · sisa pagu paket <b>{rp(sum.remaining)}</b>{sum.pct !== null && <> · terserap {sum.pct.replace(".", ",")}%</>}</p>
        {exec.length ? <table><thead><tr><th>Ke-</th><th>Tanggal</th><th>Uraian</th><th>Penyedia</th><th>Tgl / No SPM-SP2D</th><th className="text-right">Nilai</th><th>Status</th></tr></thead>
          <tbody>{exec.map((t, i) => <tr key={t.id}><td>{i + 1}</td><td>{fmtDate(t.date)}</td><td>{t.description ?? "-"}</td><td>{t.provider ?? "-"}</td><td>{t.paymentDate ? fmtDate(t.paymentDate) : "-"} {t.paymentNumber ?? ""}</td><td className="text-right">{rp(t.amount)}</td><td>{t.paymentDate ? "Diakui" : "belum diakui"}</td></tr>)}</tbody></table>
          : <p className="text-sm text-slate-600">Belum ada transaksi realisasi dengan kode RUP ini.</p>}
        <h3>Riwayat status</h3>
        {ev.data?.length ? <ul className="list-disc space-y-0.5 pl-5 text-sm">{ev.data.map((e) => <li key={e.id}>{fmtDateTime(e.created_at)}: {e.from_status ? `${name(e.from_status)} menjadi ` : "dibuat sebagai "}{name(e.to_status)}</li>)}</ul> : <p className="text-sm text-slate-600">Belum ada riwayat.</p>}
      </Sheet>
    </section>
  );
}
