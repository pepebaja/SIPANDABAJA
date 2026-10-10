import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getBudgetContext } from "@/lib/server/budget-context";
import { getPrintProfile } from "@/lib/server/print-profile";
import { buildReport } from "@/lib/server/reports";
import { reportToXlsx } from "@/lib/server/xlsx-report";
import { findReport } from "@/lib/report-types";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!findReport(slug)) return new Response("Laporan tidak ditemukan.", { status: 404 });
  const s = await getSession(); if (!s) return new Response("Sesi berakhir.", { status: 401 });
  const [ctx, sb, profile] = await Promise.all([getBudgetContext(), createClient(), getPrintProfile(s)]);
  const res = await buildReport(slug, { sb, ctx, session: s });
  if ("error" in res) return new Response(res.error, { status: 403 });
  const buf = await reportToXlsx(res.report, profile, s.profile.full_name);
  const name = `${slug}${ctx ? `-${ctx.year}` : ""}.xlsx`;
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
