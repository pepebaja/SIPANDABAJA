/** Kelengkapan satu transaksi untuk kontrol/monitoring di Daftar transaksi. Daftar kosong = lengkap. */
export type RowIssueInput = { paymentDate: string | null; paymentNumber: string | null; rupCode: string | null; methodName: string | null; providerName: string | null };
export function rowIssues(r: RowIssueInput): string[] {
  const out: string[] = [], pengadaan = !!r.rupCode || !!r.methodName;
  if (!r.paymentDate) out.push("Tanggal SPM/SP2D belum diisi"); else if (!r.paymentNumber) out.push("No SPM/SP2D belum diisi");
  if (pengadaan && !r.rupCode) out.push("Kode RUP belum diisi");
  if (r.rupCode && !r.methodName) out.push("Metode pemilihan belum diisi");
  if (pengadaan && !r.providerName) out.push("Penyedia belum diisi");
  return out;
}
