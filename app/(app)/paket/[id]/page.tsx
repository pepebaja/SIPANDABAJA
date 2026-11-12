import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ContractForm } from "@/components/contract-form";
import { rp } from "@/lib/format";
import { changeStatus, linkRup, updateDue, updateOfficials, updatePackageMeta } from "./actions";
import { contractProfile, DOC_LABEL, JENIS_LABEL, methodKind } from "@/lib/procurement-profile";
import { loadPackageExecutions } from "@/lib/server/package-executions";
import { summarizeExecutions } from "@/lib/package-executions";
import { parseRupiah } from "@/lib/import/parse";
import { fromCents, sumCents } from "@/lib/money";
import { fmtDateTime } from "@/lib/date";
export default async function PackageDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params, sp = await searchParams, sb = await createClient();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: p } = await sb.from("procurement_packages").select("*, method:procurement_methods(code, name)").eq("id", id).maybeSingle() as { data: any };
  if (!p) notFound();
  const [st, ev, ct, rups, prov, off, methods, exec] = await Promise.all([
    sb.from("package_statuses").select("code, name, definition").eq("is_active", true).order("sort_order"),
    sb.from("procurement_events").select("id, from_status, to_status, created_at").eq("procurement_package_id", id).order("created_at", { ascending: false }).limit(20),
    sb.from("contracts_or_orders").select("id, doc_type, doc_number, doc_date, selection_result_value, contract_value, description, provider:providers(name)").eq("procurement_package_id", id).order("created_at"),
    sb.from("rup_packages").select("id, rup_code, name").eq("budget_version_id", p.budget_version_id).order("rup_code").limit(1000),
    sb.from("providers").select("id, name").eq("is_active", true).order("name").limit(1000),
    sb.from("officials").select("id, name, nip, official_type").eq("is_active", true).order("name").limit(1000),
    sb.from("procurement_methods").select("id, name").eq("is_active", true).order("name"),
    loadPackageExecutions(sb, p)]);
  const kind = methodKind(p.method), profile = contractProfile(kind), sum = summarizeExecutions(exec, parseRupiah(p.pagu) ?? "0.00"), last = exec[exec.length - 1];
  const contractTotal = fromCents(sumCents((ct.data ?? []).map((c) => parseRupiah(c.contract_value) ?? "0.00")));
  const ofs = (t: string) => (off.data ?? []).filter((o) => o.official_type === t);
  const name = new Map((st.data ?? []).map((s) => [s.code, s.name])), cur = st.data?.find((s) => s.code === p.status);
  return (
    <section className="max-w-4xl space-y-6">
      <div><div className="flex flex-wrap items-center justify-between gap-2"><Link href="/paket" className="link text-sm">← Kembali ke daftar paket</Link><Link href={`/paket/${id}/cetak`} className="btn btn-ghost btn-sm">Cetak lembar rincian</Link></div>
        <h1 className="page-title mt-1">{p.name}</h1><p className="text-slate-600">Kode RUP {p.internal_code}, pagu {rp(p.pagu)}, {p.execution_mode === "swakelola" ? "swakelola" : "melalui penyedia"}{p.is_recurring && <span className="badge badge-info ml-2">Paket berulang</span>}{p.carried_from && <span className="badge badge-off ml-2">Dibawa dari tahapan sebelumnya</span>}</p>
        <p className="text-sm text-slate-600">Jenis pengadaan: <b>{p.procurement_type ? JENIS_LABEL[p.procurement_type] : "belum diisi"}</b> · Metode pemilihan: <b>{p.method?.name ?? "belum ditentukan"}</b></p></div>
      {sp.error && <p role="alert" className="alert alert-error">Perubahan gagal disimpan. Periksa isian dan hak akses Anda.</p>}
      <form action={updatePackageMeta} className="card grid gap-3 p-4 sm:grid-cols-2"><input type="hidden" name="id" value={id} /><h2 className="font-semibold sm:col-span-2">Jenis dan metode pengadaan</h2>
        <label className="block text-sm font-medium">Jenis pengadaan<select name="procurement_type" defaultValue={p.procurement_type ?? "jasa_lainnya"} className="mt-1 w-full">{Object.entries(JENIS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="block text-sm font-medium">Metode pemilihan<select name="method_id" defaultValue={p.method_id ?? ""} className="mt-1 w-full"><option value="">(belum ditentukan)</option>{methods.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="block text-sm font-medium">Cara pelaksanaan<select name="execution_mode" defaultValue={p.execution_mode} className="mt-1 w-full"><option value="penyedia">Melalui penyedia</option><option value="swakelola">Swakelola</option></select></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="is_recurring" defaultChecked={p.is_recurring} className="mt-1" /><span><b>Paket berulang</b> (dibelanjakan berkali-kali, mis. konsumsi rapat, pemeliharaan kendaraan): banyak pelaksanaan, kontrak/SP, dan pembayaran di bawah satu kode RUP.</span></label>
        <div className="sm:col-span-2"><button className="btn btn-dark btn-sm">Simpan</button></div></form>
      <div className="space-y-2 card p-4"><h2 className="font-semibold">Status: {cur?.name ?? p.status}</h2>{cur && <p className="text-sm text-slate-600">{cur.definition}</p>}
        <form action={changeStatus} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={id} />
          <label className="text-sm font-medium">Ubah status<select name="status" defaultValue={p.status} className="ml-2 py-1.5">{st.data?.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
          <button className="btn btn-dark btn-sm">Simpan status</button></form>
        {!!ev.data?.length && <ul className="mt-2 text-sm text-slate-700">{ev.data.map((e) => <li key={e.id}>{fmtDateTime(e.created_at)}: {e.from_status ? `${name.get(e.from_status) ?? e.from_status} menjadi ` : "dibuat sebagai "}{name.get(e.to_status) ?? e.to_status}</li>)}</ul>}</div>
      <form action={linkRup} className="flex flex-wrap items-end gap-2 card p-4"><input type="hidden" name="id" value={id} />
        <label className="text-sm font-medium">Kode RUP (kode paket)<select name="rup_package_id" defaultValue={p.rup_package_id ?? ""} className="ml-2 py-1.5"><option value="">(belum ada kode RUP)</option>{rups.data?.map((r) => <option key={r.id} value={r.id}>{r.rup_code} {r.name}</option>)}</select></label>
        <button className="btn btn-dark btn-sm">Simpan kode RUP</button></form>
      <form action={updateOfficials} className="card grid gap-3 p-4 sm:grid-cols-3"><input type="hidden" name="id" value={id} />
        <h2 className="font-semibold sm:col-span-3">Pejabat terkait</h2>
        {([["ppbj_id", "PPBJ (pejabat pengadaan)", "ppbj"], ["ppk_id", "PPK", "ppk"], ["pptk_id", "PPTK", "pptk"]] as const).map(([k, l, t]) => (
          <label key={k} className="block text-sm font-medium">{l}<select name={k} defaultValue={(p as any)[k] ?? ""} className="mt-1 w-full"><option value="">(belum ditentukan)</option>{ofs(t).map((o) => <option key={o.id} value={o.id}>{o.nip ? `${o.name} - NIP ${o.nip}` : o.name}</option>)}</select></label>))}
        <div className="sm:col-span-3"><button className="btn btn-dark btn-sm">Simpan pejabat</button><span className="ml-3 text-xs text-slate-600">Nama dan NIP pejabat dikelola Admin di Master data &gt; Pejabat.</span></div></form>
      <form action={updateDue} className="card flex flex-wrap items-end gap-3 p-4"><input type="hidden" name="id" value={id} />
        <label className="text-sm font-medium">Target selesai (tenggat)<input type="date" name="due_date" defaultValue={p.due_date ?? ""} className="ml-2 py-1.5" /></label><button className="btn btn-dark btn-sm">Simpan tenggat</button>
        <p className="w-full text-xs text-slate-600">Mulai proses: <b>{p.process_start ?? "-"}</b> · Selesai proses: <b>{p.process_end ?? "-"}</b> · Serah terima: <b>{p.handover_date ?? "-"}</b>. Ketiganya terisi otomatis saat status diubah.</p></form>
      <div className="space-y-3"><h2 className="font-semibold">Kontrak / SP / dokumen pelaksanaan</h2><p className="text-xs text-slate-600">Nilai di sini bukan realisasi keuangan. Realisasi dicatat terpisah berdasarkan dokumen pembayaran.</p>
        {ct.data?.length ? <div className="table-wrap"><table><thead><tr><th>Bentuk</th><th>Nomor</th><th>Tanggal</th><th>Penyedia</th><th>Uraian</th><th className="text-right">Hasil pemilihan</th><th className="text-right">Nilai</th></tr></thead>
          <tbody>{ct.data.map((c: any) => <tr key={c.id}><td>{DOC_LABEL[c.doc_type as keyof typeof DOC_LABEL] ?? c.doc_type}</td><td>{c.doc_number ?? "-"}</td><td>{c.doc_date ?? "-"}</td><td>{c.provider?.name ?? "-"}</td><td>{c.description ?? "-"}</td><td className="text-right">{rp(c.selection_result_value)}</td><td className="text-right">{rp(c.contract_value)}</td></tr>)}</tbody>
          {ct.data.length > 1 && <tfoot><tr className="font-semibold"><td colSpan={6}>Total {ct.data.length} dokumen</td><td className="px-3.5 py-3 text-right">{rp(contractTotal)}</td></tr></tfoot>}</table></div> : <p className="text-sm text-slate-600">Belum ada dokumen kontrak/SP.</p>}
        <ContractForm packageId={id} providers={(prov.data ?? []).map((r) => ({ value: r.id, label: r.name }))} profile={profile} methodName={p.method?.name ?? null} recurring={!!p.is_recurring} /></div>
      <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Rincian pelaksanaan (realisasi)</h2>
        <Link className="btn btn-ghost btn-sm" href={`/realisasi?tab=manual&rup=${encodeURIComponent(p.internal_code)}${last?.description ? `&uraian=${encodeURIComponent(last.description)}` : ""}`}>+ Catat pelaksanaan baru</Link></div>
        <p className="text-xs text-slate-600">Seluruh transaksi dengan kode RUP {p.internal_code} pada tahun anggaran ini, termasuk yang tercatat pada tahapan sebelumnya. {p.is_recurring ? "Paket berulang: setiap pembelian dicatat sebagai pelaksanaan tersendiri dengan uraiannya." : ""}</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{([["Jumlah pelaksanaan", String(sum.count)], ["Total terpakai", rp(sum.total)], ["Sisa pagu paket", rp(sum.remaining)], ["Terserap", sum.pct === null ? "N/A" : `${sum.pct.replace(".", ",")}%`]] as const).map(([k, v]) => <div key={k} className="card p-3"><p className="text-xs text-slate-600">{k}</p><p className="font-semibold tabular-nums">{v}</p></div>)}</div>
        {exec.length ? <div className="table-wrap"><table><thead><tr><th>Ke-</th><th>Tanggal</th><th>Uraian</th><th>Penyedia</th><th>SPM/SP2D</th><th className="text-right">Nilai</th></tr></thead>
          <tbody>{exec.map((x, i) => <tr key={x.id}><td>{i + 1}</td><td className="whitespace-nowrap">{x.date}</td><td>{x.description ?? "-"}</td><td>{x.provider ?? "-"}</td><td>{x.paymentDate ? `${x.paymentDate}${x.paymentNumber ? ` · ${x.paymentNumber}` : ""}` : <span className="badge badge-warn">belum diakui</span>}</td><td className="text-right tabular-nums">{rp(x.amount)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-600">Belum ada transaksi realisasi dengan kode RUP ini.</p>}</div>
    </section>);
}
