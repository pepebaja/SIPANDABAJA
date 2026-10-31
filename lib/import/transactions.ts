import { parseRupiah } from "./parse";
import { parseDateCell } from "./dates";
import { toCents } from "../money";
import type { MatrixRow } from "./xlsx";
import { BASIS_LABEL, paymentStatusOf, referenceDate, resolveVersion, type Basis, type PaymentStatus, type StageVersion } from "../stage-rule";

export const DOC_TYPE_KEYS = ["kuitansi", "bast", "invoice", "sp2d", "lainnya"] as const;
export type TxField = "tanggal" | "sub" | "rek" | "dana" | "uraian" | "rup" | "paket" | "jenis" | "dokjenis" | "doknomor" | "doktgl" | "spmno" | "spmtgl" | "sp2dno" | "sp2dtgl" | "nilai" | "catatan";
export const TX_TEMPLATE_COLUMNS = ["tanggal_transaksi", "kode_subkegiatan", "kode_rekening", "kode_sumber_dana", "uraian", "kode_rup", "kode_paket", "jenis_transaksi", "jenis_dokumen", "nomor_dokumen", "tanggal_dokumen", "no_spm", "tanggal_spm", "no_sp2d", "tanggal_sp2d", "nilai", "catatan"] as const;
const alnum = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => String(v ?? "").trim();
const ALIASES: Record<TxField, string[]> = {
  tanggal: ["tanggaltransaksi", "tgltransaksi", "tanggal", "tgl", "tanggalbukti", "tanggalrealisasi"],
  sub: ["kodesubkegiatan", "subkegiatan", "kodesubkeg", "kodesub", "kodesubkegiatan"],
  rek: ["koderekening", "rekening", "kodeakun", "akun", "koderek", "kodeakunbelanja"],
  dana: ["kodesumberdana", "sumberdana", "dana"],
  uraian: ["uraian", "uraianbelanja", "uraianrekening"],
  rup: ["koderup", "idrup", "kodepaketrup", "rup"],
  paket: ["kodepaket", "kodepaketpengadaan", "kodepengadaan", "nopaket"],
  jenis: ["jenistransaksi", "jenis", "sifat"],
  dokjenis: ["jenisdokumen", "jenisdok", "dokumen"],
  doknomor: ["nomordokumen", "nodokumen", "nomordok", "nomorbukti", "nobukti", "nomorkuitansi", "nomorbast", "nomorinvoice"],
  doktgl: ["tanggaldokumen", "tgldokumen", "tgldok", "tanggalbukti"],
  spmno: ["nospm", "nomorspm", "spm"],
  spmtgl: ["tanggalspm", "tglspm"],
  sp2dno: ["nosp2d", "nomorsp2d", "sp2d"],
  sp2dtgl: ["tanggalsp2d", "tglsp2d", "tanggalpencairan", "tglcair"],
  nilai: ["nilai", "jumlah", "nominal", "realisasi", "nilairealisasi", "jumlahrp", "nilairp", "bruto"],
  catatan: ["catatan", "keterangan", "ket"],
};
export const TX_FIELD_LABEL: Record<TxField, string> = { tanggal: "Tanggal transaksi", sub: "Kode subkegiatan", rek: "Kode rekening", dana: "Kode sumber dana", uraian: "Uraian", rup: "Kode RUP", paket: "Kode paket", jenis: "Jenis transaksi", dokjenis: "Jenis dokumen",
  doknomor: "Nomor dokumen", doktgl: "Tanggal dokumen", spmno: "No SPM", spmtgl: "Tanggal SPM", sp2dno: "No SP2D", sp2dtgl: "Tanggal SP2D", nilai: "Nilai", catatan: "Catatan" };
export type TxHeaderMap = { headerRow: number; cols: Partial<Record<TxField, number>> };

/** Mencari baris judul kolom pada 30 baris pertama (berkas ekspor sering memuat judul laporan di atas tabel). */
export function findTxHeader(rows: MatrixRow[]): { map: TxHeaderMap } | { error: string } {
  let best: { map: TxHeaderMap; score: number } | null = null;
  for (const r of rows.slice(0, 30)) {
    const cols: Partial<Record<TxField, number>> = {};
    r.cells.forEach((v, i) => { const a = alnum(v); if (!a) return; for (const f of Object.keys(ALIASES) as TxField[]) if (cols[f] === undefined && ALIASES[f].includes(a)) { cols[f] = i; break; } });
    const score = Object.keys(cols).length;
    if (cols.tanggal !== undefined && cols.sub !== undefined && cols.rek !== undefined && cols.nilai !== undefined && (!best || score > best.score)) best = { map: { headerRow: r.n, cols }, score };
  }
  if (!best) return { error: "Baris judul kolom tidak ditemukan. File wajib memuat kolom tanggal_transaksi, kode_subkegiatan, kode_rekening, dan nilai. Unduh template bila perlu." };
  return { map: best.map };
}

export type TxEntry = { id: string; versionId: string; sub: string; acc: string; fund: string; desc: string };
export type TxLookup = {
  year: number; versions: StageVersion[]; entries: TxEntry[];
  rupByVersion: Map<string, Map<string, string>>;                                         // versionId -> kode RUP -> id
  pkgByVersion: Map<string, Map<string, { id: string; rupId: string | null }>>;            // versionId -> kode paket -> {id, rupId}
  rupCodeById?: Map<string, string>;
  allocRupByEntry?: Map<string, string[]>;                                                 // entryId -> kode RUP yang dialokasikan ke rekening itu
};
export type StagedTx = {
  row: number; version_id: string; stage_code: string; stage_name: string; entry_id: string; entry_label: string;
  rup_package_id: string | null; rup_code: string | null; procurement_package_id: string | null; proses: "pengadaan" | "non_pengadaan";
  kind: "pembayaran" | "koreksi" | "pembatalan"; doc_type: string; doc_number: string; doc_date: string | null; transaction_date: string;
  spm_number: string | null; spm_date: string | null; sp2d_number: string | null; sp2d_date: string | null;
  ref_date: string; basis: Basis; payment_status: PaymentStatus; amount: string; notes: string | null;
};
export type TxRowError = { row: number; field: string; message: string; hint: string };
export type TxRowWarning = { row: number; message: string };
const KIND_MAP: Record<string, StagedTx["kind"]> = { pembayaran: "pembayaran", bayar: "pembayaran", realisasi: "pembayaran", koreksi: "koreksi", pembatalan: "pembatalan", batal: "pembatalan" };
const DOC_MAP: Record<string, string> = { kuitansi: "kuitansi", kwitansi: "kuitansi", bast: "bast", beritaacara: "bast", invoice: "invoice", faktur: "invoice", sp2d: "sp2d", lainnya: "lainnya", lain: "lainnya" };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function parseTxRows(rows: MatrixRow[], map: TxHeaderMap, lk: TxLookup): { valid: StagedTx[]; errors: TxRowError[]; warnings: TxRowWarning[]; skipped: number } {
  const valid: StagedTx[] = [], errors: TxRowError[] = [], warnings: TxRowWarning[] = [], seen = new Map<string, number>(); let skipped = 0;
  const c = map.cols, at = (r: MatrixRow, f: TxField) => (c[f] === undefined ? undefined : r.cells[c[f]!]);
  const entriesBy = new Map<string, TxEntry[]>(); for (const e of lk.entries) { const k = `${e.versionId}|${e.sub}|${e.acc}`; entriesBy.set(k, [...(entriesBy.get(k) ?? []), e]); }
  for (const r of rows) {
    if (r.n <= map.headerRow) continue;
    const g = (f: TxField) => str(at(r, f));
    if (!g("tanggal") && !g("sub") && !g("rek") && g("nilai") === "" ) { skipped++; continue; }            // baris kosong / pemisah
    if (ALIASES.tanggal.includes(alnum(g("tanggal"))) || ALIASES.sub.includes(alnum(g("sub")))) { skipped++; continue; } // judul berulang
    const before = errors.length, err = (field: string, message: string, hint: string) => errors.push({ row: r.n, field, message, hint });
    const warn = (message: string) => warnings.push({ row: r.n, message });

    const tgl = parseDateCell(at(r, "tanggal")); let tanggal = "";
    if (!tgl) err("tanggal_transaksi", g("tanggal") ? `Tanggal tidak dapat dibaca: "${g("tanggal")}"` : "Tanggal transaksi kosong", "Gunakan format 15/03/2026, 2026-03-15, atau 15 Maret 2026");
    else if (Number(tgl.slice(0, 4)) !== lk.year) err("tanggal_transaksi", `Tanggal ${tgl} bukan tahun anggaran ${lk.year}`, `Pilih tahun anggaran ${tgl.slice(0, 4)} di bagian atas, lalu unggah ulang baris ini`);
    else tanggal = tgl;
    const sub = g("sub"), acc = g("rek");
    if (!sub) err("kode_subkegiatan", "Kosong", "Isi kode subkegiatan sesuai DPA"); if (!acc) err("kode_rekening", "Kosong", "Isi kode rekening");

    const amountRaw = parseRupiah(at(r, "nilai")); let amount = "";
    if (amountRaw === null) err("nilai", g("nilai") ? `Format angka tidak valid: "${g("nilai")}"` : "Nilai kosong", "Gunakan angka, mis. 1500000 atau 1.500.000,00");
    else if (toCents(amountRaw) <= 0n) err("nilai", "Nilai harus lebih dari nol", "Isi positif; untuk pengurangan pilih jenis_transaksi koreksi atau pembatalan");
    else amount = amountRaw;

    const kindRaw = g("jenis"), kind = kindRaw ? KIND_MAP[alnum(kindRaw)] : "pembayaran";
    if (!kind) err("jenis_transaksi", `Jenis transaksi tidak dikenali: "${kindRaw}"`, "Gunakan pembayaran, koreksi, atau pembatalan");
    const spmNo = g("spmno") || null, sp2dNo = g("sp2dno") || null;
    const spmTgl = parseDateCell(at(r, "spmtgl")), sp2dTgl = parseDateCell(at(r, "sp2dtgl")), docTgl = parseDateCell(at(r, "doktgl"));
    if (spmTgl === null) err("tanggal_spm", `Tanggal tidak dapat dibaca: "${g("spmtgl")}"`, "Gunakan format 15/03/2026"); if (sp2dTgl === null) err("tanggal_sp2d", `Tanggal tidak dapat dibaca: "${g("sp2dtgl")}"`, "Gunakan format 15/03/2026");
    if (docTgl === null) err("tanggal_dokumen", `Tanggal tidak dapat dibaca: "${g("doktgl")}"`, "Gunakan format 15/03/2026");
    if (spmNo && spmTgl === "") err("tanggal_spm", "No SPM diisi tetapi tanggal SPM kosong", "Isi tanggal SPM");
    if (sp2dNo && sp2dTgl === "") err("tanggal_sp2d", "No SP2D diisi tetapi tanggal SP2D kosong", "Isi tanggal SP2D");
    if (!spmNo && spmTgl) err("no_spm", "Tanggal SPM diisi tetapi No SPM kosong", "Isi nomor SPM");
    if (!sp2dNo && sp2dTgl) err("no_sp2d", "Tanggal SP2D diisi tetapi No SP2D kosong", "Isi nomor SP2D");
    for (const [d, f] of [[spmTgl, "tanggal_spm"], [sp2dTgl, "tanggal_sp2d"]] as const) if (d && Number(d.slice(0, 4)) !== lk.year) err(f, `Tanggal ${d} di luar tahun anggaran ${lk.year}`, "Realisasi dicatat pada tahun anggaran yang sama dengan tanggal pencairan");
    if (spmTgl && sp2dTgl && sp2dTgl < spmTgl) err("tanggal_sp2d", "Tanggal SP2D lebih awal dari tanggal SPM", "SP2D terbit setelah SPM; periksa kedua tanggal");

    const docRaw = g("dokjenis"); let docType = docRaw ? DOC_MAP[alnum(docRaw)] : undefined;
    if (docRaw && !docType) err("jenis_dokumen", `Jenis dokumen tidak dikenali: "${docRaw}"`, "Gunakan kuitansi, bast, invoice, sp2d, atau lainnya");
    const docNo = g("doknomor") || sp2dNo || spmNo;
    if (!docNo) err("nomor_dokumen", "Tidak ada nomor dokumen/SPM/SP2D", "Isi salah satu nomor agar transaksi tidak tercatat ganda saat file diunggah ulang");
    else if (docNo.length > 100) err("nomor_dokumen", "Nomor terlalu panjang (maks. 100 karakter)", "Periksa kolom nomor");
    if (!docType) docType = !g("doknomor") && sp2dNo ? "sp2d" : "lainnya";
    if (g("catatan").length > 500) err("catatan", "Catatan lebih dari 500 karakter", "Persingkat catatan");

    if (errors.length > before || !kind) continue;
    const spmDate = spmTgl || null, sp2dDate = sp2dTgl || null;
    const ref = referenceDate({ transactionDate: tanggal, spmDate, sp2dDate });
    if (ref.basis !== "transaksi" && ref.date < tanggal) warn(`Tanggal ${ref.basis === "sp2d" ? "SP2D" : "SPM"} (${ref.date}) lebih awal dari tanggal transaksi (${tanggal}); tahapan mengikuti ${BASIS_LABEL[ref.basis].toLowerCase()}`);
    const ver = resolveVersion(lk.versions, lk.year, ref.date);
    if (!ver) { err("tahapan", `Tidak ada tahapan anggaran yang berlaku pada ${ref.date} (${BASIS_LABEL[ref.basis].toLowerCase()})`, "Atur tanggal mulai berlaku tahapan di panel \"Aturan tahapan anggaran\" dan pastikan versi anggarannya sudah disiapkan"); continue; }

    const cands = entriesBy.get(`${ver.id}|${sub}|${acc}`) ?? []; let pick = cands;
    const dana = g("dana").toUpperCase(), ur = norm(g("uraian"));
    if (pick.length > 1 && dana) pick = pick.filter((e) => e.fund.toUpperCase() === dana);
    if (pick.length > 1 && ur) { const exact = pick.filter((e) => norm(e.desc) === ur); pick = exact.length ? exact : pick.filter((e) => norm(e.desc).includes(ur)); }
    if (!pick.length) { err("kode_rekening", `Subkegiatan ${sub} + rekening ${acc} tidak ada pada anggaran ${ver.stageName} (berlaku ${ref.date})`,
      cands.length ? "Sumber dana/uraian tidak cocok dengan rekening yang ada" : `Impor anggaran tahapan ${ver.stageName} lebih dulu, atau periksa tanggal SPM/SP2D dan kodenya`); continue; }
    if (pick.length > 1) { err("kode_rekening", `Ada ${pick.length} rekening dengan subkegiatan + rekening yang sama pada ${ver.stageName}`, `Isi kode_sumber_dana atau uraian. Pilihan: ${pick.slice(0, 3).map((e) => `${e.fund} / ${e.desc.slice(0, 40)}`).join("; ")}`); continue; }
    const entry = pick[0]!;

    let rupId: string | null = null, pkgId: string | null = null, rupCode = g("rup") || null; const pkgCode = g("paket") || null;
    if (rupCode) { rupCode = rupCode.replace(/\.0+$/, ""); rupId = lk.rupByVersion.get(ver.id)?.get(rupCode) ?? null; if (!rupId) { err("kode_rup", `Kode RUP ${rupCode} tidak ada pada ${ver.stageName}`, "Sinkronkan RUP tahapan tersebut (menu Paket RUP), atau kosongkan bila belanja non-pengadaan"); continue; } }
    if (pkgCode) {
      const p = lk.pkgByVersion.get(ver.id)?.get(pkgCode); if (!p) { err("kode_paket", `Kode paket ${pkgCode} tidak ada pada ${ver.stageName}`, "Periksa kode paket di menu Proses pengadaan, atau kosongkan"); continue; }
      if (rupId && p.rupId && p.rupId !== rupId) { err("kode_paket", `Paket ${pkgCode} bertaut ke RUP lain, bukan ${rupCode}`, "Samakan kode_rup dengan RUP paket, atau kosongkan salah satu"); continue; }
      pkgId = p.id; if (!rupId && p.rupId) { rupId = p.rupId; rupCode = lk.rupCodeById?.get(p.rupId) ?? rupCode; }
    }
    if (!rupId && !pkgId) { const al = lk.allocRupByEntry?.get(entry.id); if (al?.length) warn(`Rekening ini dialokasikan ke RUP ${al.slice(0, 3).join(", ")}${al.length > 3 ? ", ..." : ""}; baris tanpa kode RUP dicatat sebagai non-pengadaan`); }

    const key = [ver.id, entry.id, docType, docNo, kind].join("|"), dup = seen.get(key);
    if (dup !== undefined) { err("nomor_dokumen", `Duplikat dengan baris ${dup} (rekening, jenis dokumen, nomor, dan jenis transaksi sama)`, "Gabungkan nilainya dalam satu baris atau bedakan nomor dokumennya"); continue; }
    seen.set(key, r.n);
    valid.push({ row: r.n, version_id: ver.id, stage_code: ver.stageCode, stage_name: ver.stageName, entry_id: entry.id, entry_label: `${entry.sub} / ${entry.acc}: ${entry.desc}`,
      rup_package_id: rupId, rup_code: rupCode, procurement_package_id: pkgId, proses: rupId || pkgId ? "pengadaan" : "non_pengadaan", kind, doc_type: docType, doc_number: docNo!, doc_date: docTgl || null, transaction_date: tanggal,
      spm_number: spmNo, spm_date: spmDate, sp2d_number: sp2dNo, sp2d_date: sp2dDate, ref_date: ref.date, basis: ref.basis, payment_status: paymentStatusOf({ spmDate, sp2dDate }),
      amount: kind === "pembayaran" ? amount : `-${amount}`, notes: g("catatan") || null });
  }
  return { valid, errors, warnings, skipped };
}
