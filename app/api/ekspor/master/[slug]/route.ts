import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/server/session";
import { getPrintProfile } from "@/lib/server/print-profile";
import { fetchAll } from "@/lib/server/fetch-all";
import { reportToXlsx } from "@/lib/server/xlsx-report";
import { findMaster } from "@/lib/masters";
import type { Report } from "@/lib/report-types";

export const dynamic = "force-dynamic";
export async function GET(_r: Request, { params }: { params: Promise<{ slug: string }> }) {
  const def = findMaster((await params).slug); if (!def) return new Response("Data master tidak ditemukan.", { status: 404 });
  const s = await getSession(); if (!s) return new Response("Sesi berakhir.", { status: 401 });
  const sb = await createClient(), orderCol = def.fields.some((f) => f.name === "code") ? "code" : "name";
  const rows = await fetchAll<any>((f, t) => sb.from(def.table).select("*").order(orderCol).order("id").range(f, t));
  const refs = new Map<string, Map<string, string>>();
  for (const f of def.fields.filter((x) => x.type === "ref" && x.ref)) {
    const data = await fetchAll<any>((a, b) => sb.from(f.ref!.table).select(["id", ...f.ref!.labelCols].join(",")).order("id").range(a, b));
    refs.set(f.name, new Map(data.map((r) => [r.id, f.ref!.labelCols.map((c) => r[c]).join(" ")])));
  }
  const show = (f: (typeof def.fields)[number], r: any): string => f.type === "bool" ? (r[f.name] ? "Ya" : "Tidak") : f.type === "ref" ? (refs.get(f.name)?.get(r[f.name]) ?? "-")
    : f.type === "enum" ? (f.options?.find((o) => o.value === r[f.name])?.label ?? "-") : String(r[f.name] ?? "");
  const report: Report = { slug: `master-${def.slug}`, title: `Master Data: ${def.title}`, landscape: false,
    columns: [{ key: "no", label: "No", kind: "int", align: "center", width: 6 }, ...def.fields.map((f) => ({ key: f.name, label: f.label, width: 28 })), { key: "status", label: "Status", width: 12 }],
    rows: rows.map((r, i) => ({ no: i + 1, ...Object.fromEntries(def.fields.map((f) => [f.name, show(f, r)])), status: r.is_active ? "Aktif" : "Nonaktif" })) };
  const buf = await reportToXlsx(report, await getPrintProfile(s), s.profile.full_name);
  return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="master-${def.slug}.xlsx"`, "Cache-Control": "no-store" } });
}
