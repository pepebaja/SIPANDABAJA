/** API Supabase membatasi 1000 baris per permintaan; helper ini membaca per halaman sampai habis. */
export async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 50000): Promise<T[]> {
  const out: T[] = [], size = 1000;
  for (let from = 0; from < max; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error("Gagal memuat data dari database.");
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < size) break;
  }
  return out;
}
