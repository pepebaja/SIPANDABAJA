import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getPrintProfile } from "@/lib/server/print-profile";
import { buildReport } from "@/lib/server/reports";
import { findReport } from "@/lib/report-types";
import { ROLE_LABELS } from "@/lib/rbac";
import { PrintButton } from "@/components/print-button";
import { ReportTable, Sheet } from "@/components/report-sheet";
import { Icon } from "@/components/icons";

export default async function LaporanDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params, meta = findReport(slug); if (!meta) notFound();
  const s = await getSession(); if (!s) return null;
  const [ctx, sb, profile] = await Promise.all([getBudgetContext(), createClient(), getPrintProfile(s)]);
  const res = await buildReport(slug, { sb, ctx, session: s });
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/laporan" className="link text-sm">← Laporan &amp; dokumen</Link>
        {"report" in res && <div className="flex flex-wrap gap-2"><a href={`/api/laporan/${slug}`} className="btn btn-ghost"><Icon name="download" className="h-4 w-4" />Unduh Excel</a><PrintButton /></div>}
      </div>
      {"error" in res ? <p role="alert" className="alert alert-error max-w-xl">{res.error}</p> : <>
        <p className="no-print alert alert-info max-w-3xl text-xs">Untuk menyimpan sebagai PDF, klik <b>Cetak</b> lalu pilih tujuan <b>Simpan sebagai PDF</b>. Kop, nama pejabat, dan kota dapat diatur Super Admin di menu Pengaturan.</p>
        <Sheet profile={profile} title={res.report.title} subtitle={res.report.subtitle} orientation={res.report.landscape ? "landscape" : "portrait"}
          printer={{ name: s.profile.full_name, nip: s.profile.nip, role: s.roles[0] ? ROLE_LABELS[s.roles[0]] : "Pengguna" }}>
          <ReportTable report={res.report} />
        </Sheet></>}
    </section>
  );
}
