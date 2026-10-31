import { parseRupiah } from "./parse";
import { parseDateCell } from "./dates";
import { toCents } from "../money";
import type { MatrixRow } from "./xlsx";
import { BASIS_LABEL, paymentStatusOf, referenceDate, resolveVersion, type Basis, type PaymentStatus, type StageVersion } from "../stage-rule";

/** Kolom template (urutan tampil). Kolom lama (jenis transaksi/dokumen, nomor/tanggal dokumen, kode paket) sudah dihapus. */
export const TX_TEMPLATE_COLUMNS = ["tanggal_transaksi", "kode_subkegiatan", "kode_rekening", "kode_sumber_dana", "kode_rup", "metode_pemilihan", "tanggal_spm_sp2d", "no_spm_sp2d", "nilai", "catatan"] as const;
export type TxField = "tanggal" | "sub" | "rek" | "dana" | "uraian" | "rup" | "metode" | "paytgl" | "payno" | "spmtgl" | "spmno" | "sp2dtgl" | "sp2dno" | "jenis" | "nilai" | "catatan";
const alnum = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => String(v ?? "").trim();
const ALIASES: Record<TxField, string[]> = {
  tanggal: ["tanggaltransaksi", "tgltransaksi", "tanggal", "tgl", "tanggalbukti", "tanggalrealisasi"],
  sub: ["kodesubkegiatan", "subkegiatan", "kodesubkeg", "kodesub"],
  rek: ["koderekening", "rekening", "kodeakun", "akun", "koderek", "kodeakunbelanja"],
  dana: ["kodesumberdana", "sumberdana", "dana"],
  uraian: ["uraian", "uraianbelanja", "uraianrekening"],
  rup: ["koderup", "idrup", "kodepaketrup", "rup"],
  metode: ["metodepemilihan", "metode", "metodepengadaan", "carapengadaan"],
  paytgl: ["tanggalspmsp2d", "tglspmsp2d", "tanggalspmdansp2d", "tanggalsp2dspm", "tanggalpencairan", "tglpencairan", "tglcair"],
  payno: ["nospmsp2d", "nomorspmsp2d", "nospmdansp2d", "nosp2dspm", "nomorpencairan"],
  spmtgl: ["tanggalspm", "tglspm"], spmno: ["nospm", "nomorspm", "spm"],           // format lama: tetap terbaca (SP2D diutamakan atas SPM)
  sp2dtgl: ["tanggalsp2d", "tglsp2d"], sp2dno: ["nosp2d", "nomorsp2d", "sp2d"],
  jenis: ["jenistransaksi", "jenis", "sifat"],                                       // format lama: koreksi/pembatalan tetap menjadi nilai minus
  nilai: ["nilai", "jumlah", "nominal", "realisasi", "nilairealisasi", "jumlahrp", "nilairp", "bruto"],
  catatan: ["catatan", "keterangan", "ket"],
};
// Kolom format lama yang sudah tidak dipakai: dikenali agar pengguna diberi tahu, bukan diabaikan diam-diam.
const RETIRED: Record<string, string> = { kodepaket: "kode_paket (gunakan kode_rup)", kodepaketpengadaan: "kode_paket (gunakan kode_rup)", kodepengadaan: "kode_paket (gunakan kode_rup)", nopaket: "kode_paket (gunakan kode_rup)",
  jenisdokumen: "jenis_dokumen", jenisdok: "jenis_dokumen", nomordokumen: "nomor_dokumen", nodokumen: "nomor_dokumen", nomorbukti: "nomor_dokumen", tanggaldokumen: "tanggal_dokumen", tgldokumen: "tanggal_dokumen" };
export const TX_FIELD_LABEL: Record<TxField, string> = { tanggal: "Tanggal transaksi", sub: "Kode subkegiatan", rek: "Kode rekening", dana: "Kode sumber dana", uraian: "Uraian", rup: "Kode RUP", metode: "Metode pemilihan", paytgl: "Tanggal SPM/SP2D",
  payno: "No SPM/SP2D", spmtgl: "Tanggal SPM", spmno: "No SPM", sp2dtgl: "Tanggal SP2D", sp2dno: "No SP2D", jenis: "Jenis transaksi", nilai: "Nilai", catatan: "Catatan" };
export type TxHeaderMap = { headerRow: number; cols: Partial<Record<TxField, number>>; retired: string[] };

/** Mencari baris judul kolom pada 30 baris pertama (berkas ekspor sering memuat judul laporan di atas tabel). */
export function findTxHeader(rows: MatrixRow[]): { map: TxHeaderMap } | { error: string } {
  let best: { map: TxHeaderMap; score: number } | null = null;
  for (const r of rows.slice(0, 30)) {
    const cols: Partial<Record<TxField, number>> = {}, retired = new Set<string>();
    r.cells.forEach((v, i) => { const a = alnum(v); if (!a) return; if (RETIRED[a]) { retired.add(RETIRED[a]!); return; }
      for (const f of Object.keys(ALIASES) as TxField[]) if (cols[f] === undefined && ALIASES[f].includes(a)) { cols[f] = i; break; } });
    const score = Object.keys(cols).length;
    if (cols.tanggal !== undefined && cols.sub !== undefined && cols.rek !== undefined && cols.nilai !== undefined && (!best || score > best.score)) best = { map: { headerRow: r.n, cols, retired: [...retired] }, score };
  }
  if (!best) return { error: "Baris judul kolom tidak ditemukan. File wajib memuat kolom tanggal_transaksi, kode_subkegiatan, kode_rekening, dan nilai. Unduh template bila perlu." };
  return { map: best.map };
}

export type TxEntry = { id: string; versionId: string; sub: string; acc: string; fund: string; desc: string; subId: string; accId: string; fundId: string | null };
export type TxMethod = { id: string; code: string; name: string };
export type TxLookup = {
  year: number; versions: StageVersion[]; entries: TxEntry[]; methods: TxMethod[];
  rupByVersion: Map<string, Map<string, { id: string; methodId: string | null }>>;     // versionId -> kode RUP -> {id, metode rencana}
  allocRupByEntry?: Map<string, string[]>;                                              // entryId -> kode RUP yang dialokasikan ke rekening itu
};
export type StagedTx = {
  row: number; version_id: string; stage_code: string; stage_name: string; entry_id: string; sub_id: string; acc_id: string; fund_id: string | null; entry_label: string;
  rup_package_id: string | null; rup_code: string | null; method_id: string | null; method_name: string | null; proses: "pengadaan" | "non_pengadaan";
  transaction_date: string; payment_date: string | null; payment_number: string | null;
  ref_date: string; basis: Basis; payment_status: PaymentStatus; amount: string; notes: string | null;
};
export type TxRowError = { row: number; field: string; message: string; hint: string };
export type TxRowWarning = { row: number; message: string };   // row 0 = catatan untuk seluruh file

// Alias tambahan per kode master metode (nama resmi tetap dicocokkan langsung dari master).
const METHOD_ALIASES: Record<string, string[]> = { EPURCHASING: ["ekatalog", "ecatalog", "ecatalogue", "katalogelektronik", "epurchase", "inaproc"], PL: ["pembelianlangsung"], PENUNJUKAN: ["penunjukan"],
  TENDER_CEPAT: ["tendercepat"], TENDER: ["tenderumum", "tenderterbuka"], SELEKSI: ["seleksikonsultan"], SWAKELOLA: ["swakelolatipei", "swakelolatipeii", "swakelolatipeiii", "swakelolatipeiv"] };
export function matchMethod(input: string, methods: TxMethod[]): TxMethod | null {
  const k = alnum(input); if (!k || k === "pl") return null;            // "PL" ambigu (Pengadaan Langsung / Penunjukan Langsung): wajib ditulis lengkap
  const exact = methods.find((m) => alnum(m.name) === k || alnum(m.code) === k); if (exact) return exact;
  return methods.find((m) => (METHOD_ALIASES[m.code] ?? []).includes(k)) ?? null;
}
const LEGACY_KIND = new Set(["koreksi", "pembatalan", "batal"]);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function parseTxRows(rows: MatrixRow[], map: TxHeaderMap, lk: TxLookup): { valid: StagedTx[]; errors: TxRowError[]; warnings: TxRowWarning[]; skipped: number } {
  const valid: StagedTx[] = [], errors: TxRowError[] = [], warnings: TxRowWarning[] = [], seen = new Map<string, number>(); let skipped = 0;
  if (map.retired.length) warnings.push({ row: 0, message: `Kolom ${map.retired.join(", ")} sudah tidak dipakai dan diabaikan. Hubungkan pengadaan lewat kode_rup; nomor dokumen tidak lagi diperlukan.` });
  if (map.cols.jenis !== undefined) warnings.push({ row: 0, message: "Kolom jenis_transaksi sudah tidak dipakai: baris bertanda koreksi/pembatalan tetap dicatat sebagai nilai minus. Untuk seterusnya isi koreksi langsung dengan nilai minus." });
  const c = map.cols, at = (r: MatrixRow, f: TxField) => (c[f] === undefined ? undefined : r.cells[c[f]!]);
  const entriesBy = new Map<string, TxEntry[]>(); for (const e of lk.entries) { const k = `${e.versionId}|${e.sub}|${e.acc}`; entriesBy.set(k, [...(entriesBy.get(k) ?? []), e]); }
  for (const r of rows) {
    if (r.n <= map.headerRow) continue;
    const g = (f: TxField) => str(at(r, f));
    if (!g("tanggal") && !g("sub") && !g("rek") && g("nilai") === "") { skipped++; continue; }              // baris kosong / pemisah
    if (ALIASES.tanggal.includes(alnum(g("tanggal"))) || ALIASES.sub.includes(alnum(g("sub")))) { skipped++; continue; } // judul berulang
    const before = errors.length, err = (field: string, message: string, hint: string) => errors.push({ row: r.n, field, message, hint });
    const warn = (message: string) => warnings.push({ row: r.n, message });

    const tgl = parseDateCell(at(r, "tanggal")); let tanggal = "";
    if (!tgl) err("tanggal_transaksi", g("tanggal") ? `Tanggal tidak dapat dibaca: "${g("tanggal")}"` : "Tanggal transaksi kosong", "Gunakan format 15/03/2026, 2026-03-15, atau 15 Maret 2026");
    else if (Number(tgl.slice(0, 4)) !== lk.year) err("tanggal_transaksi", `Tanggal ${tgl} bukan tahun anggaran ${lk.year}`, `Pilih tahun anggaran ${tgl.slice(0, 4)} di bagian atas, lalu unggah ulang baris ini`);
    else tanggal = tgl;
    const sub = g("sub"), acc = g("rek");
    if (!sub) err("kode_subkegiatan", "Kosong", "Isi kode subkegiatan sesuai DPA"); if (!acc) err("kode_rekening", "Kosong", "Isi kode rekening");

    // Nilai minus = koreksi (mengurangi realisasi). Format lama: jenis koreksi/pembatalan dengan nilai positif tetap dijadikan minus.
    const amountRaw = parseRupiah(at(r, "nilai")); let amount = "";
    if (amountRaw === null) err("nilai", g("nilai") ? `Format angka tidak valid: "${g("nilai")}"` : "Nilai kosong", "Gunakan angka, mis. 1500000 atau 1.500.000,00; minus untuk koreksi");
    else if (toCents(amountRaw) === 0n) err("nilai", "Nilai tidak boleh nol", "Isi nilai positif; minus untuk koreksi/pengurangan");
    else amount = LEGACY_KIND.has(alnum(g("jenis"))) && !amountRaw.startsWith("-") ? `-${amountRaw}` : amountRaw;

    // Satu pasangan Tanggal/No SPM-SP2D. Format lama (kolom SPM dan SP2D terpisah) tetap terbaca: SP2D diutamakan.
    const dateParts = [parseDateCell(at(r, "paytgl")), parseDateCell(at(r, "sp2dtgl")), parseDateCell(at(r, "spmtgl"))];
    if (dateParts.some((d) => d === null)) err("tanggal_spm_sp2d", `Tanggal tidak dapat dibaca: "${g("paytgl") || g("sp2dtgl") || g("spmtgl")}"`, "Gunakan format 15/03/2026");
    const payDate = dateParts.find((d) => d) || null, payNo = (g("payno") || g("sp2dno") || g("spmno")) || null;
    if (payDate && Number(payDate.slice(0, 4)) !== lk.year) err("tanggal_spm_sp2d", `Tanggal ${payDate} di luar tahun anggaran ${lk.year}`, "Realisasi dicatat pada tahun anggaran yang sama dengan tanggal SPM/SP2D");
    if (payNo && payNo.length > 100) err("no_spm_sp2d", "Nomor terlalu panjang (maks. 100 karakter)", "Periksa kolom nomor");
    if (g("catatan").length > 500) err("catatan", "Catatan lebih dari 500 karakter", "Persingkat catatan");
    let method: TxMethod | null = null;
    if (g("metode")) { method = matchMethod(g("metode"), lk.methods); if (!method) err("metode_pemilihan", `Metode pemilihan tidak dikenali: "${g("metode")}"`, `Pilihan: ${lk.methods.map((m) => m.name).join(", ")}`); }

    if (errors.length > before) continue;
    if (payNo && !payDate) warn("No SPM/SP2D diisi tanpa tanggal; tahapan mengikuti tanggal transaksi sampai tanggal SPM/SP2D dilengkapi");
    const ref = referenceDate({ transactionDate: tanggal, paymentDate: payDate });
    if (ref.basis === "spm_sp2d" && ref.date < tanggal) warn(`Tanggal SPM/SP2D (${ref.date}) lebih awal dari tanggal transaksi (${tanggal}); tahapan mengikuti tanggal SPM/SP2D`);
    const ver = resolveVersion(lk.versions, lk.year, ref.date);
    if (!ver) { err("tahapan", `Tidak ada tahapan anggaran yang berlaku pada ${ref.date} (${BASIS_LABEL[ref.basis].toLowerCase()})`, "Atur tanggal mulai berlaku tahapan di panel \"Aturan tahapan anggaran\" dan pastikan versi anggarannya sudah disiapkan"); continue; }

    const cands = entriesBy.get(`${ver.id}|${sub}|${acc}`) ?? []; let pick = cands;
    const dana = g("dana").toUpperCase(), ur = norm(g("uraian"));
    if (pick.length > 1 && dana) pick = pick.filter((e) => e.fund.toUpperCase() === dana);
    if (pick.length > 1 && ur) { const exact = pick.filter((e) => norm(e.desc) === ur); pick = exact.length ? exact : pick.filter((e) => norm(e.desc).includes(ur)); }
    if (!pick.length) { err("kode_rekening", `Subkegiatan ${sub} + rekening ${acc} tidak ada pada anggaran ${ver.stageName} (berlaku ${ref.date})`,
      cands.length ? "Sumber dana tidak cocok dengan rekening yang ada" : `Impor anggaran tahapan ${ver.stageName} lebih dulu, atau periksa tanggal SPM/SP2D dan kodenya`); continue; }
    if (pick.length > 1) { err("kode_rekening", `Ada ${pick.length} rekening dengan subkegiatan + rekening yang sama pada ${ver.stageName}`, `Isi kode_sumber_dana. Pilihan: ${pick.slice(0, 3).map((e) => `${e.fund} / ${e.desc.slice(0, 40)}`).join("; ")}`); continue; }
    const entry = pick[0]!;

    let rupId: string | null = null, rupCode = g("rup").replace(/\.0+$/, "") || null, rupMethod: string | null = null;
    if (rupCode) { const rp = lk.rupByVersion.get(ver.id)?.get(rupCode); if (!rp) { err("kode_rup", `Kode RUP ${rupCode} tidak ada pada ${ver.stageName}`, "Sinkronkan RUP tahapan tersebut (menu Paket RUP), atau kosongkan bila belanja non-pengadaan"); continue; } rupId = rp.id; rupMethod = rp.methodId; }
    if (!method && rupMethod) method = lk.methods.find((m) => m.id === rupMethod) ?? null;     // metode kosong: ikuti metode rencana pada RUP
    if (!rupId) { const al = lk.allocRupByEntry?.get(entry.id); if (al?.length) warn(`Rekening ini dialokasikan ke RUP ${al.slice(0, 3).join(", ")}${al.length > 3 ? ", ..." : ""}; baris tanpa kode RUP dicatat sebagai non-pengadaan`); }

    // Identitas baris (dipakai juga database untuk mengenali baris yang sudah tercatat): rekening + tanggal + nilai + RUP; nomor SPM/SP2D menjadi pembeda.
    const key = [ver.id, entry.id, tanggal, amount, rupId ?? "", payNo ?? ""].join("|"), dup = seen.get(key);
    if (dup !== undefined) { err("nilai", `Baris identik dengan baris ${dup} (rekening, tanggal, nilai, RUP, dan nomor SPM/SP2D sama)`, "Bila memang dua transaksi, bedakan No SPM/SP2D-nya; bila salah salin, hapus salah satu"); continue; }
    seen.set(key, r.n);
    valid.push({ row: r.n, version_id: ver.id, stage_code: ver.stageCode, stage_name: ver.stageName, entry_id: entry.id, sub_id: entry.subId, acc_id: entry.accId, fund_id: entry.fundId, entry_label: `${entry.sub} / ${entry.acc}: ${entry.desc}`,
      rup_package_id: rupId, rup_code: rupCode, method_id: method?.id ?? null, method_name: method?.name ?? null, proses: rupId || method ? "pengadaan" : "non_pengadaan",
      transaction_date: tanggal, payment_date: payDate, payment_number: payNo, ref_date: ref.date, basis: ref.basis, payment_status: paymentStatusOf({ paymentDate: payDate }), amount, notes: g("catatan") || null });
  }
  return { valid, errors, warnings, skipped };
}
