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
import { DOC_TYPES, KINDS } from "@/lib/transactions";
export const metadata = { title: "Lembar rincian paket" };
const DOC: Record<string, string> = { kontrak: "Kontrak", spk: "SPK", surat_pesanan: "Surat Pesanan" };
const Person = (o: any) => (o ? `${o.name}${o.nip ? ` (NIP ${o.nip})` : ""}` : "-");

export default async function CetakPaket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await getSession(); if (!s) return null;
  const sb = await createClient();
  const { data: p } = await sb.from("procurement_packages").select("*, rup:rup_packages(rup_code, name), method:procurement_methods(name), ppbj:officials!ppbj_id(name, nip), ppk:officials!ppk_id(name, nip), pptk:officials!pptk_id(name, nip)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [profile, st, ev, ct, al, tx] = await Promise.all([getPrintProfile(s),
    sb.from("package_statuses").select("code, name").eq("organization_id", p.organization_id),
    sb.from("procurement_events").select("id, from_status, to_status, created_at").eq("procurement_package_id", id).order("created_at"),
    sb.from("contracts_or_orders").select("id, doc_type, doc_number, doc_date, selection_result_value, contract_value, provider:providers(name)").eq("procurement_package_id", id).order("created_at"),
    p.rup_package_id ? sb.from("package_budget_allocations").select("id, amount, entry:budget_entries(description, subactivities(code), expenditure_accounts(code))").eq("rup_package_id", p.rup_package_id) : Promise.resolve({ data: [] as any[] }),
    sb.from("transactions").select("id, transaction_date, kind, doc_type, doc_number, amount, verification_status").eq("procurement_package_id", id).order("transaction_date")]);
  const sn = new Map((st.data ?? []).map((x) => [x.code, x.name])), name = (c: string) => sn.get(c) ?? c;
  const rows: [string, React.ReactNode][] = [
    ["Kode paket", p.internal_code], ["Nama paket", p.name], ["Kode RUP", p.rup ? `${p.rup.rup_code} (${p.rup.name})` : "Belum ada kode RUP"],
    ["Cara pelaksanaan", p.execution_mode === "swakelola" ? "Swakelola" : "Melalui penyedia"], ["Metode pemilihan", p.method?.name ?? "-"], ["Pagu", rp(p.pagu)], ["Status", name(p.status)],
    ["PPBJ", Person(p.ppbj)], ["PPK", Person(p.ppk)], ["PPTK", Person(p.pptk)],
    ["Tanggal penugasan", fmtDate(p.assigned_date)], ["Dokumen diterima", fmtDate(p.docs_received_date)], ["Mulai proses", fmtDate(p.process_start)], ["Selesai proses", fmtDate(p.process_end)],
    ["Tenggat", fmtDate(p.due_date)], ["Serah terima", fmtDate(p.handover_date)], ["Kategori kendala", p.obstacle_category ?? "-"], ["Catatan", p.notes ?? "-"]];
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3"><Link href={`/paket/${id}`} className="link text-sm">← Kembali ke paket</Link><PrintButton label="Cetak lembar" /></div>
      <Sheet profile={profile} title="Lembar Rincian Paket Pengadaan" subtitle={`${p.internal_code} · ${p.name}`} printer={{ name: s.profile.full_name, nip: s.profile.nip, role: s.roles[0] ? ROLE_LABELS[s.roles[0]] : "Pengguna" }}>
        <dl className="kv">{rows.map(([k, v]) => <div key={k} className="contents"><dt>{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
        <h3>Kontrak / Surat Pesanan</h3>
        {ct.data?.length ? <table><thead><tr><th>Bentuk</th><th>Nomor</th><th>Tanggal</th><th>Penyedia</th><th className="text-right">Hasil pemilihan</th><th className="text-right">Nilai</th></tr></thead>
          <tbody>{ct.data.map((c: any) => <tr key={c.id}><td>{DOC[c.doc_type]}</td><td>{c.doc_number ?? "-"}</td><td>{fmtDate(c.doc_date)}</td><td>{c.provider?.name ?? "-"}</td><td className="text-right">{rp(c.selection_result_value)}</td><td className="text-right">{rp(c.contract_value)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-slate-600">Belum ada kontrak/SP tercatat.</p>}
        <h3>Alokasi anggaran</h3>
        {al.data?.length ? <table><thead><tr><th>Rekening anggaran</th><th className="text-right">Alokasi</th></tr></thead>
          <tbody>{al.data.map((a: any) => <tr key={a.id}><td>{a.entry?.subactivities?.code ?? ""} / {a.entry?.expenditure_accounts?.code ?? ""}: {a.entry?.description}</td><td className="text-right">{rp(a.amount)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-slate-600">{p.rup_package_id ? "Belum ada alokasi pada paket RUP terkait." : "Paket belum ditautkan ke paket RUP."}</p>}
        <h3>Realisasi terkait paket</h3>
        {tx.data?.length ? <table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Dokumen</th><th className="text-right">Nilai</th><th>Status</th></tr></thead>
          <tbody>{tx.data.map((t) => <tr key={t.id}><td>{fmtDate(t.transaction_date)}</td><td>{(KINDS[t.kind] ?? t.kind).split(" ")[0]}</td><td>{DOC_TYPES[t.doc_type]} {t.doc_number ?? ""}</td><td className="text-right">{rp(t.amount)}</td><td>{t.verification_status === "verified" ? "Terverifikasi" : "Belum diverifikasi"}</td></tr>)}</tbody></table>
          : <p className="text-sm text-slate-600">Belum ada transaksi realisasi yang ditautkan ke paket ini.</p>}
        <h3>Riwayat status</h3>
        {ev.data?.length ? <ul className="list-disc space-y-0.5 pl-5 text-sm">{ev.data.map((e) => <li key={e.id}>{fmtDateTime(e.created_at)}: {e.from_status ? `${name(e.from_status)} menjadi ` : "dibuat sebagai "}{name(e.to_status)}</li>)}</ul> : <p className="text-sm text-slate-600">Belum ada riwayat.</p>}
      </Sheet>
    </section>
  );
}
