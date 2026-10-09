import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { ImportForm } from "@/components/import-form";
import { ensureBudgetVersion } from "./actions";

export default async function ImportPage() {
  const ctx = await getBudgetContext();
  if (!ctx) return <p>Tahun/tahapan anggaran belum disiapkan. Hubungi administrator.</p>;
  const sb = await createClient();
  const { data: jobs } = ctx.versionId ? await sb.from("import_jobs").select("id, file_name, status, ok_rows, error_rows, created_at")
    .eq("budget_version_id", ctx.versionId).order("created_at", { ascending: false }).limit(10) : { data: [] };
  return (
    <section className="max-w-4xl space-y-5">
      <div><h1 className="page-title">Impor anggaran</h1>
        <p className="text-slate-600">Tahun {ctx.year}, tahapan {ctx.stageName}. <a className="link" href="/api/templates/budget">Unduh template Excel</a></p></div>
      {!ctx.versionId ? (
        <form action={ensureBudgetVersion} className="card p-4"><p className="mb-3 text-sm">Belum ada versi anggaran untuk {ctx.year} {ctx.stageName}.</p>
          <button className="btn btn-primary">Siapkan versi anggaran</button></form>
      ) : <ImportForm />}
      <div><h2 className="mb-2 font-semibold">Riwayat impor</h2>
        {jobs?.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Status</th><th>Valid</th><th>Bermasalah</th><th>Waktu</th></tr></thead>
          <tbody>{jobs.map((j) => <tr key={j.id}><td>{j.file_name}</td><td>{j.status === "confirmed" ? "Dikonfirmasi" : "Menunggu konfirmasi"}</td><td>{j.ok_rows}</td><td>{j.error_rows}</td><td>{new Date(j.created_at).toLocaleString("id-ID")}</td></tr>)}</tbody></table></div>
          : <p className="text-sm text-slate-600">Belum ada impor. Unduh template, isi, lalu unggah.</p>}</div>
    </section>
  );
}
