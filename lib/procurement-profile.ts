/** Profil dokumen kontrak/SP menurut metode pemilihan (E-purchasing, Pengadaan Langsung, Tender, dst.). Murni: tanpa akses database. */
export type DocType = "kontrak" | "spk" | "surat_pesanan" | "bukti_pembelian" | "sk_swakelola";
export type MethodKind = "ekatalog" | "langsung" | "penunjukan" | "kompetitif" | "swakelola" | "lainnya";
export const DOC_LABEL: Record<DocType, string> = { kontrak: "Kontrak", spk: "SPK", surat_pesanan: "Surat Pesanan", bukti_pembelian: "Bukti pembelian/kuitansi", sk_swakelola: "SK/Surat penugasan swakelola" };
export const JENIS_LABEL: Record<string, string> = { barang: "Barang", konstruksi: "Pekerjaan konstruksi", konsultansi: "Jasa konsultansi", jasa_lainnya: "Jasa lainnya" };
export const ALL_DOCS = Object.keys(DOC_LABEL) as DocType[];
export function methodKind(m: { code?: string | null; name?: string | null } | null | undefined): MethodKind {
  const c = m?.code ?? "", n = m?.name ?? "";
  if (c === "EPURCHASING" || /e[\s-]*purchas|e[\s-]*katalog|katalog\s*elektronik/i.test(n)) return "ekatalog";
  if (c === "SWAKELOLA" || /swakelola/i.test(n)) return "swakelola";
  if (c === "PL" || /pengadaan\s*langsung/i.test(n)) return "langsung";
  if (c === "PENUNJUKAN" || /penunjukan/i.test(n)) return "penunjukan";
  if (/^TENDER|^SELEKSI/.test(c) || /tender|seleksi/i.test(n)) return "kompetitif";
  return "lainnya";
}
export type ContractProfile = { kind: MethodKind; docTypes: DocType[]; defaultDoc: DocType; numberLabel: string; dateLabel: string; selectionLabel: string; valueLabel: string; showProvider: boolean; hint: string };
const P: Record<MethodKind, Omit<ContractProfile, "kind">> = {
  ekatalog: { docTypes: ["surat_pesanan", "kontrak"], defaultDoc: "surat_pesanan", numberLabel: "Nomor paket/pesanan e-katalog", dateLabel: "Tanggal pesanan", selectionLabel: "Nilai hasil negosiasi (bila ada)", valueLabel: "Nilai pesanan (Rp)", showProvider: true,
    hint: "E-purchasing: catat Surat Pesanan (order e-katalog). Penyedia = penyedia pada katalog elektronik. Tiap pesanan dicatat sebagai satu dokumen." },
  langsung: { docTypes: ["bukti_pembelian", "surat_pesanan", "spk"], defaultDoc: "bukti_pembelian", numberLabel: "Nomor bukti/SP/SPK", dateLabel: "Tanggal dokumen", selectionLabel: "Nilai hasil negosiasi (bila ada)", valueLabel: "Nilai pembelian/SP (Rp)", showProvider: true,
    hint: "Pengadaan Langsung: cukup bukti pembelian/kuitansi untuk nilai kecil, atau Surat Pesanan/SPK bila diperlukan." },
  penunjukan: { docTypes: ["kontrak", "spk", "surat_pesanan"], defaultDoc: "spk", numberLabel: "Nomor SPK/kontrak", dateLabel: "Tanggal dokumen", selectionLabel: "Nilai hasil negosiasi (Rp)", valueLabel: "Nilai kontrak/SPK (Rp)", showProvider: true,
    hint: "Penunjukan Langsung: catat SPK atau kontrak dengan penyedia yang ditunjuk beserta hasil negosiasi." },
  kompetitif: { docTypes: ["kontrak", "spk"], defaultDoc: "kontrak", numberLabel: "Nomor kontrak", dateLabel: "Tanggal kontrak", selectionLabel: "Nilai hasil pemilihan (penawaran/harga terkoreksi, Rp)", valueLabel: "Nilai kontrak (Rp)", showProvider: true,
    hint: "Tender/Seleksi: catat kontrak dengan penyedia pemenang; nilai hasil pemilihan = harga penawaran terkoreksi yang disepakati." },
  swakelola: { docTypes: ["sk_swakelola"], defaultDoc: "sk_swakelola", numberLabel: "Nomor SK/surat penugasan", dateLabel: "Tanggal SK/penugasan", selectionLabel: "Nilai RAB swakelola (Rp)", valueLabel: "Nilai swakelola (Rp)", showProvider: false,
    hint: "Swakelola: tidak ada penyedia. Catat SK/surat penugasan dan nilai RAB." },
  lainnya: { docTypes: ALL_DOCS.filter((d) => d !== "sk_swakelola"), defaultDoc: "kontrak", numberLabel: "Nomor dokumen", dateLabel: "Tanggal dokumen", selectionLabel: "Nilai hasil pemilihan (Rp)", valueLabel: "Nilai kontrak/SP (Rp)", showProvider: true,
    hint: "Metode pemilihan paket belum ditentukan. Tentukan metode pada paket agar bentuk dokumen menyesuaikan." },
};
export const contractProfile = (kind: MethodKind): ContractProfile => ({ kind, ...P[kind] });
/** Peringatan (bukan penolakan) bila dokumen yang dicatat kurang lazim untuk metode pemilihan paket. */
export function contractWarnings(kind: MethodKind, docType: DocType, hasProvider: boolean): string[] {
  const p = contractProfile(kind), out: string[] = [];
  if (kind !== "lainnya" && !p.docTypes.includes(docType)) out.push(`Bentuk dokumen ${DOC_LABEL[docType]} kurang lazim untuk metode ini (lazimnya: ${p.docTypes.map((d) => DOC_LABEL[d]).join(", ")}).`);
  if (kind === "swakelola" && hasProvider) out.push("Paket swakelola tidak memiliki penyedia, tetapi penyedia diisi.");
  if (kind !== "swakelola" && !hasProvider) out.push("Penyedia belum dipilih pada dokumen ini.");
  return out;
}
