/** Kode RUP: hanya isi yang bermakna; spasi dibuang dan akhiran ".0" (hasil Excel) dihapus. */
export const normalizeRupCode = (v: string | null | undefined): string => (v ?? "").replace(/\s+/g, "").replace(/\.0+$/, "");
