import { z } from "zod";
const nip = z.string().transform((v) => v.replace(/\s/g, "")).pipe(z.union([z.literal(""), z.string().regex(/^\d{18}$/, "NIP harus 18 digit angka")]));
export const printProfileSchema = z.object({
  org_name: z.string().trim().min(3, "Nama OPD minimal 3 karakter").max(200, "Nama OPD maksimal 200 karakter"),
  address: z.string().trim().max(300, "Alamat maksimal 300 karakter"), city: z.string().trim().max(80, "Kota maksimal 80 karakter"),
  head_title: z.string().trim().max(120, "Jabatan maksimal 120 karakter"), head_name: z.string().trim().max(120, "Nama maksimal 120 karakter"), head_nip: nip,
});
export type PrintProfile = { orgName: string; address: string; city: string; headTitle: string; headName: string; headNip: string };
export const EMPTY_PROFILE: PrintProfile = { orgName: "", address: "", city: "", headTitle: "Kepala", headName: "", headNip: "" };
