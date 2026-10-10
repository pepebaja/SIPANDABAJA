"use client";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { saveCashGrid } from "@/app/(app)/kas/actions";
import { formatRupiah } from "@/lib/format";
import { parseRupiah } from "@/lib/import/parse";
import { fromCents, toCents } from "@/lib/money";
import { QUARTER_SHORT, splitEvenly } from "@/lib/cash";

export type GridEntry = { id: string; progCode: string; progName: string; actCode: string; actName: string; subCode: string; subName: string; accCode: string; accName: string; fund: string; desc: string; pagu: string; q: (string | null)[] };
type Parsed = string | null | "invalid";
const fmt = (v: string | null) => (v === null ? "" : formatRupiah(v).replace(/^(-?)Rp /, "$1"));
const parse = (s: string): Parsed => { if (s.trim() === "") return null; const n = parseRupiah(s); return n === null || n.startsWith("-") ? "invalid" : n; };
const money = (c: bigint) => formatRupiah(fromCents(c)).replace(/^(-?)Rp /, "$1");
const MAX_ROWS = 400;

type Sub = { key: string; code: string; name: string; rows: GridEntry[] };
type Act = { key: string; code: string; name: string; subs: Sub[]; rows: GridEntry[] };
type Prog = { key: string; code: string; name: string; acts: Act[]; rows: GridEntry[] };

export function CashGrid({ entries, canEdit }: { entries: GridEntry[]; canEdit: boolean }) {
  const [vals, setVals] = useState<Record<string, string[]>>(() => Object.fromEntries(entries.map((e) => [e.id, e.q.map(fmt)])));
  const [base, setBase] = useState<Record<string, (string | null)[]>>(() => Object.fromEntries(entries.map((e) => [e.id, e.q])));
  const [search, setSearch] = useState(""), [prog, setProg] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  // Data server berubah (mis. setelah unggahan diterapkan): segarkan baris yang belum diedit, pertahankan filter & suntingan yang belum disimpan.
  useEffect(() => {
    const same = (a: Parsed[], b: (string | null)[]) => a.every((v, i) => v === b[i]);
    setVals((prev) => { const n = { ...prev }; for (const e of entries) { const old = base[e.id], pv = prev[e.id]; if (!old || !pv || same(pv.map(parse), old)) n[e.id] = e.q.map(fmt); } return n; });
    setBase(Object.fromEntries(entries.map((e) => [e.id, e.q])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const tree = useMemo<Prog[]>(() => {
    const ps: Prog[] = [];
    for (const e of entries) {
      let p = ps[ps.length - 1]; if (!p || p.code !== e.progCode) { p = { key: `p${ps.length}`, code: e.progCode, name: e.progName, acts: [], rows: [] }; ps.push(p); }
      let a = p.acts[p.acts.length - 1]; if (!a || a.code !== e.actCode) { a = { key: `${p.key}a${p.acts.length}`, code: e.actCode, name: e.actName, subs: [], rows: [] }; p.acts.push(a); }
      let s = a.subs[a.subs.length - 1]; if (!s || s.code !== e.subCode) { s = { key: `${a.key}s${a.subs.length}`, code: e.subCode, name: e.subName, rows: [] }; a.subs.push(s); }
      s.rows.push(e); a.rows.push(e); p.rows.push(e);
    }
    return ps;
  }, [entries]);

  const cur = useMemo(() => Object.fromEntries(entries.map((e) => [e.id, (vals[e.id] ?? ["", "", "", ""]).map(parse)])) as Record<string, Parsed[]>, [entries, vals]);
  const invalidCount = entries.filter((e) => cur[e.id]!.includes("invalid")).length;
  const dirtyIds = entries.filter((e) => cur[e.id]!.some((v, i) => v !== base[e.id]![i])).map((e) => e.id);
  const sum = (rows: GridEntry[]) => { const q = [0n, 0n, 0n, 0n]; let pagu = 0n; for (const e of rows) { pagu += toCents(e.pagu); cur[e.id]!.forEach((v, i) => { if (v && v !== "invalid") q[i]! += toCents(v); }); } return { q, pagu, total: q.reduce((a, b) => a + b, 0n) }; };

  const needle = search.trim().toLowerCase();
  const match = (e: GridEntry) => (!prog || e.progCode === prog) && (!needle || [e.desc, e.accCode, e.accName, e.subCode, e.subName].some((x) => x.toLowerCase().includes(needle)));
  const filteredIds = new Set(entries.filter(match).map((e) => e.id));

  const setCell = (id: string, i: number, v: string) => setVals((p) => ({ ...p, [id]: (p[id] ?? ["", "", "", ""]).map((x, k) => (k === i ? v : x)) }));
  const blur = (id: string, i: number) => { const p = cur[id]![i]; if (p && p !== "invalid") setCell(id, i, fmt(p)); };
  const spread = (e: GridEntry) => setVals((p) => ({ ...p, [e.id]: splitEvenly(e.pagu).map(fmt) }));
  const spreadEmpty = () => setVals((p) => { const n = { ...p }; for (const e of entries) if (filteredIds.has(e.id) && cur[e.id]!.every((v) => v === null)) n[e.id] = splitEvenly(e.pagu).map(fmt); return n; });
  const reset = () => { setVals(Object.fromEntries(entries.map((e) => [e.id, (base[e.id] ?? []).map(fmt)]))); setMsg({}); };
  const save = () => {
    if (invalidCount) { setMsg({ error: `${invalidCount} baris berisi angka tidak valid (ditandai merah).` }); return; }
    const changes = dirtyIds.map((id) => ({ entryId: id, q: cur[id]!.map((v) => (v === "invalid" ? null : v)) }));
    start(async () => {
      const r = await saveCashGrid(changes);
      if (r.ok) { setBase((p) => ({ ...p, ...Object.fromEntries(dirtyIds.map((id) => [id, cur[id]!.map((v) => (v === "invalid" ? null : v))])) })); setMsg({ ok: `Tersimpan: ${r.saved} baris.` }); }
      else setMsg({ error: r.error });
    });
  };

  const gt = sum(entries);
  let shown = 0;
  const tot = (s: ReturnType<typeof sum>, cls: string) => (
    <>
      <td className={`px-3 py-2 text-right tabular-nums ${cls}`}>{money(s.pagu)}</td>
      {s.q.map((c, i) => <td key={i} className={`px-3 py-2 text-right tabular-nums ${cls}`}>{money(c)}</td>)}
      <td className={`px-3 py-2 text-right tabular-nums ${cls}`}>{money(s.total)}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${cls} ${s.pagu - s.total < 0n ? "!text-red-600" : ""}`}>{money(s.pagu - s.total)}</td><td className="px-2" />
    </>);
  const Head = ({ cls, label, s }: { cls: string; label: string; s: ReturnType<typeof sum> }) => <tr className={cls}><td className="px-3 py-2 font-semibold">{label}</td>{tot(s, "font-semibold")}</tr>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="field-label">Cari<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Uraian, rekening, atau sub kegiatan" className="mt-1 block w-72" /></label>
        <label className="field-label">Program<select value={prog} onChange={(e) => setProg(e.target.value)} className="mt-1 block max-w-xs"><option value="">Semua program</option>{tree.map((p) => <option key={p.key} value={p.code}>{p.code} {p.name}</option>)}</select></label>
        {canEdit && <button type="button" onClick={spreadEmpty} className="btn btn-ghost btn-sm" title="Bagi pagu rata ke 4 triwulan pada baris yang masih kosong (sesuai filter)">Bagi rata semua yang kosong</button>}
        <p className="ml-auto text-sm text-slate-600">{filteredIds.size} dari {entries.length} rekening{dirtyIds.length > 0 && <> · <b className="text-amber-800">{dirtyIds.length} belum disimpan</b></>}</p>
      </div>
      {msg.ok && <p role="status" className="alert alert-ok">{msg.ok}</p>}
      {msg.error && <p role="alert" className="alert alert-error">{msg.error}</p>}
      <div className="card overflow-x-auto">
        <table className="cash-table min-w-[72rem]">
          <thead><tr><th className="min-w-[22rem]">Program / Kegiatan / Sub Kegiatan / Belanja</th><th className="text-right">Pagu</th>{QUARTER_SHORT.map((q) => <th key={q} className="text-right">{q}</th>)}<th className="text-right">Total kas</th><th className="text-right">Selisih thd pagu</th><th /></tr></thead>
          <tbody>
            {tree.map((p) => {
              const pRows = p.rows.filter((e) => filteredIds.has(e.id)); if (!pRows.length) return null;
              return (
                <Fragment key={p.key}>
                  <Head cls="bg-navy-800 text-white [&_td]:!text-white" label={`${p.code} ${p.name}`} s={sum(p.rows)} />
                  {p.acts.map((a) => { if (!a.rows.some((e) => filteredIds.has(e.id))) return null; return (
                    <Fragment key={a.key}>
                      <Head cls="bg-slate-200" label={`${a.code} ${a.name}`} s={sum(a.rows)} />
                      {a.subs.map((s) => { const rows = s.rows.filter((e) => filteredIds.has(e.id)); if (!rows.length) return null; return (
                        <Fragment key={s.key}>
                          <Head cls="bg-slate-100" label={`${s.code} ${s.name}`} s={sum(s.rows)} />
                          {rows.map((e) => {
                            if (shown >= MAX_ROWS) return null; shown++;
                            const c = cur[e.id]!, total = c.reduce<bigint>((a2, v) => a2 + (v && v !== "invalid" ? toCents(v) : 0n), 0n), diff = toCents(e.pagu) - total, bad = c.includes("invalid");
                            return (
                              <tr key={e.id} className={dirtyIds.includes(e.id) ? "!bg-amber-50" : ""}>
                                <td className="py-2 pl-8 pr-3"><span className="font-mono text-xs font-semibold">{e.accCode}</span> <span className="text-slate-800">{e.accName}</span><span className="block text-xs text-slate-500">{e.desc}{e.fund && <span className="badge badge-info ml-2">{e.fund}</span>}</span></td>
                                <td className="px-3 text-right tabular-nums">{money(toCents(e.pagu))}</td>
                                {[0, 1, 2, 3].map((i) => (
                                  <td key={i} className="px-1.5"><input value={vals[e.id]?.[i] ?? ""} readOnly={!canEdit} onChange={(ev) => setCell(e.id, i, ev.target.value)} onBlur={() => blur(e.id, i)} inputMode="decimal" placeholder="0,00"
                                    aria-label={`${QUARTER_SHORT[i]} ${e.accCode} ${e.desc}`} className={`w-32 px-2 py-1.5 text-right text-sm tabular-nums ${c[i] === "invalid" ? "!border-red-500 !bg-red-50" : ""} ${!canEdit ? "bg-slate-50" : ""}`} /></td>))}
                                <td className="px-3 text-right font-semibold tabular-nums">{money(total)}</td>
                                <td className={`px-3 text-right tabular-nums ${diff < 0n ? "font-bold text-red-600" : diff === 0n && total > 0n ? "font-semibold text-emerald-700" : "text-slate-600"}`}>{bad ? "-" : diff < 0n ? `${money(diff)} (lebih)` : money(diff)}</td>
                                <td className="px-2">{canEdit && <button type="button" onClick={() => spread(e)} className="link text-xs" title="Bagi pagu rata ke 4 triwulan">÷4</button>}</td>
                              </tr>);
                          })}
                        </Fragment>); })}
                    </Fragment>); })}
                </Fragment>);
            })}
            {shown === 0 && <tr><td colSpan={9} className="py-8 text-center text-slate-500">Tidak ada rekening yang cocok dengan filter.</td></tr>}
          </tbody>
          <tfoot><tr className="bg-navy-950 text-white [&_td]:!text-white"><td className="px-3 py-2.5 font-bold">TOTAL SEMUA</td>{tot(gt, "font-bold")}</tr></tfoot>
        </table>
      </div>
      {filteredIds.size > MAX_ROWS && <p className="alert alert-info text-sm">Menampilkan {MAX_ROWS} rekening pertama dari {filteredIds.size}. Gunakan pencarian atau filter program untuk mempersempit; subtotal tetap menghitung seluruh rekening.</p>}
      {canEdit && dirtyIds.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-white/95 p-3 shadow-glow backdrop-blur">
          <p className="text-sm"><b>{dirtyIds.length}</b> baris belum disimpan{invalidCount > 0 && <span className="ml-2 font-semibold text-red-700">· {invalidCount} berisi angka tidak valid</span>}</p>
          <button type="button" onClick={save} disabled={pending} className="btn btn-primary btn-sm">{pending ? "Menyimpan..." : "Simpan perubahan"}</button>
          <button type="button" onClick={reset} disabled={pending} className="btn btn-ghost btn-sm">Batalkan</button>
        </div>)}
    </div>
  );
}
