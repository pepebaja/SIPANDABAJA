import { parseRupiah } from "./parse";
import { toCents } from "../money";
import type { MatrixRow } from "./xlsx";

export type ProcType = "barang" | "konstruksi" | "konsultansi" | "jasa_lainnya";
export const PROC_TYPE_LABEL: Record<ProcType, string> = { barang: "Barang", konstruksi: "Konstruksi", konsultansi: "Konsultansi", jasa_lainnya: "Jasa lainnya" };
export type MethodRef = { id: string; code: string; name: string };
export type StagedRup = { rup_code: string; name: string; procurement_type: ProcType; planned_method_id: string | null; pagu: string };
export type RupRowError = { row: number; field: string; message: string; hint: string };
export type RupRowWarning = { row: number; code: string; message: string };

/** Kolom template sendiri. Berkas ekspor SIRUP ("RUP - Cari Paket": No, Paket, Pagu (Rp), Jenis Pengadaan, ..., Metode Pemilihan, ..., ID) dikenali lewat alias di bawah. */
export const RUP_TEMPLATE_COLUMNS = ["kode_rup", "nama_paket", "jenis_pengadaan", "metode_pemilihan", "pagu"] as const;

const alnum = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => String(v ?? "").trim();
type Field = "kode" | "nama" | "jenis" | "metode" | "pagu";
const ALIASES: Record<Field, string[]> = {
  kode: ["koderup", "kode", "idrup", "id", "idpaket", "kodepaket"],
  nama: ["namapaket", "paket", "namarup", "nama", "uraianpaket", "namapekerjaan"],
  jenis: ["jenispengadaan", "jenis", "jenisbelanja"],
  metode: ["metodepemilihan", "metodepengadaan", "metode"],
  pagu: ["pagurp", "pagu", "pagurup", "totalpagu", "nilaipagu", "jumlahpagu"],
};
export const FIELD_LABEL: Record<Field, string> = { kode: "Kode RUP (atau ID)", nama: "Nama paket (atau Paket)", jenis: "Jenis Pengadaan", metode: "Metode Pemilihan", pagu: "Pagu (Rp)" };

export type HeaderMap = { headerRow: number; cols: Partial<Record<Field, number>> };
/** Mencari baris header pada 30 baris pertama: berkas SIRUP biasanya memuat judul/keterangan di atas tabel. */
export function findHeader(rows: MatrixRow[]): { map: HeaderMap } | { error: string } {
  let best: { map: HeaderMap; score: number } | null = null;
  for (const r of rows.slice(0, 30)) {
    const cols: Partial<Record<Field, number>> = {};
    r.cells.forEach((v, i) => {
      const a = alnum(v); if (!a) return;
      for (const f of Object.keys(ALIASES) as Field[]) if (cols[f] === undefined && ALIASES[f].includes(a)) { cols[f] = i; break; }
    });
    const score = Object.keys(cols).length;
    if (cols.kode !== undefined && cols.nama !== undefined && cols.pagu !== undefined && (!best || score > best.score)) best = { map: { headerRow: r.n, cols }, score };
  }
  if (!best) return { error: "Baris judul kolom tidak ditemukan. File harus memuat kolom Kode RUP (atau ID), Nama Paket (atau Paket), Jenis Pengadaan, dan Pagu. Gunakan template dari menu ini bila perlu." };
  if (best.map.cols.jenis === undefined) return { error: "Kolom Jenis Pengadaan tidak ditemukan. Tambahkan kolom tersebut (Barang, Pekerjaan Konstruksi, Jasa Konsultansi, atau Jasa Lainnya)." };
  return { map: best.map };
}

export function mapProcurementType(v: unknown): ProcType | null {
  const s = str(v).toLowerCase(); if (!s) return null;
  const hit = new Set<ProcType>();
  if (s.includes("konsultansi")) hit.add("konsultansi");
  else if (s.includes("konstruksi")) hit.add("konstruksi");
  if (s.includes("barang")) hit.add("barang");
  if (/jasa\s*lain|jasa_lain/.test(s)) hit.add("jasa_lainnya");
  return hit.size === 1 ? [...hit][0]! : null;
}

const MONTHS = "januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|january|february|march|may|june|july|august|october|december|jan|feb|mar|apr|jun|jul|agu|aug|sep|sept|okt|oct|nov|des|dec";
const normMethod = (s: unknown) => String(s ?? "").toLowerCase().replace(new RegExp(`\\b(${MONTHS})\\b`, "g"), " ").replace(/\b\d{4}\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
/** Metode pemilihan SIRUP kerap diikuti bulan pemilihan ("Pengadaan Langsung January 2025"); dicocokkan ke master lewat nama/kode. */
export function matchMethod(v: unknown, methods: MethodRef[]): string | null {
  const c = normMethod(v); if (!c) return null;
  const cands = methods.map((m) => ({ id: m.id, n: normMethod(m.name), k: normMethod(m.code) })).filter((m) => m.n || m.k);
  const exact = cands.find((m) => m.n === c || m.k === c); if (exact) return exact.id;
  const inside = cands.filter((m) => m.n && ` ${c} `.includes(` ${m.n} `)).sort((a, b) => b.n.length - a.n.length);
  return inside[0]?.id ?? null;
}

const codeOf = (v: unknown) => (typeof v === "number" ? String(Math.trunc(v)) : str(v).replace(/\.0+$/, ""));

export type RupParse = { valid: StagedRup[]; errors: RupRowError[]; warnings: RupRowWarning[]; skipped: number; rowOf: Map<string, number> };
export function parseRupRows(rows: MatrixRow[], map: HeaderMap, methods: MethodRef[]): RupParse {
  const valid: StagedRup[] = [], errors: RupRowError[] = [], warnings: RupRowWarning[] = [], rowOf = new Map<string, number>();
  let skipped = 0;
  const c = map.cols, at = (r: MatrixRow, f: Field) => (c[f] === undefined ? undefined : r.cells[c[f]!]);
  for (const r of rows) {
    if (r.n <= map.headerRow) continue;
    const kode = codeOf(at(r, "kode")), nama = str(at(r, "nama")), paguRaw = at(r, "pagu");
    if (!kode && !nama && str(paguRaw) === "") { skipped++; continue; }                         // baris kosong / pemisah
    if (ALIASES.kode.includes(alnum(kode))) { skipped++; continue; }                            // judul kolom berulang
    const before = errors.length, err = (field: string, message: string, hint: string) => errors.push({ row: r.n, field, message, hint });
    if (!kode) err("kode_rup", "Kode RUP kosong", "Isi kode/ID RUP dari SIRUP");
    else if (kode.length > 50) err("kode_rup", "Kode RUP terlalu panjang (maks. 50 karakter)", "Periksa kolom kode");
    if (!nama) err("nama_paket", "Nama paket kosong", "Isi nama paket");
    else if (nama.length > 300) err("nama_paket", `Nama paket ${nama.length} karakter (maks. 300)`, "Persingkat nama paket");
    const type = mapProcurementType(at(r, "jenis"));
    if (!type) err("jenis_pengadaan", str(at(r, "jenis")) ? `Jenis pengadaan tidak dikenali: "${str(at(r, "jenis"))}"` : "Jenis pengadaan kosong", "Gunakan Barang, Pekerjaan Konstruksi, Jasa Konsultansi, atau Jasa Lainnya");
    const pagu = parseRupiah(paguRaw);
    if (pagu === null) err("pagu", `Format angka tidak valid: "${str(paguRaw)}"`, "Gunakan angka, mis. 1500000 atau 1.500.000,00");
    else if (pagu.startsWith("-")) err("pagu", "Pagu tidak boleh negatif", "Periksa tanda minus");
    if (kode && rowOf.has(kode)) err("kode_rup", `Kode RUP ${kode} dobel dengan baris ${rowOf.get(kode)}`, "Satu kode RUP hanya boleh muncul sekali");
    if (errors.length > before) continue;
    rowOf.set(kode, r.n);
    const mRaw = at(r, "metode"); let mid: string | null = null;
    if (str(mRaw)) { mid = matchMethod(mRaw, methods); if (!mid) warnings.push({ row: r.n, code: kode, message: `Metode "${str(mRaw)}" tidak ada di master Metode Pemilihan; dikosongkan` }); }
    valid.push({ rup_code: kode, name: nama, procurement_type: type!, planned_method_id: mid, pagu: pagu! });
  }
  return { valid, errors, warnings, skipped, rowOf };
}

export type ExistingRup = { id: string; rup_code: string; name: string; procurement_type: string; planned_method_id: string | null; pagu: string };
export type DiffRow = { row: number; code: string; name: string; action: "baru" | "ubah"; changes: string[]; pagu: string; overAlloc: boolean };
export type MissingRup = { code: string; name: string; pagu: string; allocations: number; linkedPackages: number };
export type RupDiff = { rows: DiffRow[]; added: number; changed: number; unchanged: number; missing: MissingRup[] };

/** Membandingkan baris valid dengan isi database. allocated = total alokasi (string desimal) per id paket RUP. */
export function diffRup(valid: StagedRup[], rowOf: Map<string, number>, existing: ExistingRup[], allocated: Map<string, string>, allocCount: Map<string, number>, linked: Map<string, number>): RupDiff {
  const by = new Map(existing.map((e) => [e.rup_code, e])), inFile = new Set(valid.map((v) => v.rup_code));
  const rows: DiffRow[] = []; let added = 0, changed = 0, unchanged = 0;
  for (const v of valid) {
    const e = by.get(v.rup_code), row = rowOf.get(v.rup_code) ?? 0;
    if (!e) { added++; rows.push({ row, code: v.rup_code, name: v.name, action: "baru", changes: [], pagu: v.pagu, overAlloc: false }); continue; }
    const ch: string[] = [];
    if (e.name !== v.name) ch.push("nama");
    if (e.procurement_type !== v.procurement_type) ch.push("jenis");
    if ((e.planned_method_id ?? null) !== v.planned_method_id) ch.push("metode");
    if (toCents(e.pagu) !== toCents(v.pagu)) ch.push("pagu");
    if (!ch.length) { unchanged++; continue; }
    changed++;
    rows.push({ row, code: v.rup_code, name: v.name, action: "ubah", changes: ch, pagu: v.pagu, overAlloc: ch.includes("pagu") && toCents(allocated.get(e.id) ?? "0.00") > toCents(v.pagu) });
  }
  const missing = existing.filter((e) => !inFile.has(e.rup_code)).map((e) => ({ code: e.rup_code, name: e.name, pagu: e.pagu, allocations: allocCount.get(e.id) ?? 0, linkedPackages: linked.get(e.id) ?? 0 }));
  return { rows, added, changed, unchanged, missing };
}
