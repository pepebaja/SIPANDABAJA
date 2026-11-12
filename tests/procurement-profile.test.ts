import { describe, expect, it } from "vitest";
import { contractProfile, contractWarnings, methodKind } from "@/lib/procurement-profile";
describe("profil kontrak menurut metode pemilihan", () => {
  it("mengenali metode dari kode atau nama", () => {
    expect(methodKind({ code: "EPURCHASING", name: "E-purchasing" })).toBe("ekatalog");
    expect(methodKind({ name: "E-Katalog" })).toBe("ekatalog");
    expect(methodKind({ code: "PL", name: "Pengadaan Langsung" })).toBe("langsung");
    expect(methodKind({ code: "PENUNJUKAN", name: "Penunjukan Langsung" })).toBe("penunjukan");
    for (const c of ["TENDER", "TENDER_CEPAT", "SELEKSI"]) expect(methodKind({ code: c, name: c })).toBe("kompetitif");
    expect(methodKind({ code: "SWAKELOLA", name: "Swakelola" })).toBe("swakelola");
    expect(methodKind(null)).toBe("lainnya");
  });
  it("e-purchasing memakai Surat Pesanan; pengadaan langsung bukti pembelian; tender kontrak; swakelola tanpa penyedia", () => {
    expect(contractProfile("ekatalog").defaultDoc).toBe("surat_pesanan");
    expect(contractProfile("langsung").defaultDoc).toBe("bukti_pembelian");
    expect(contractProfile("kompetitif").defaultDoc).toBe("kontrak");
    expect(contractProfile("swakelola")).toMatchObject({ defaultDoc: "sk_swakelola", showProvider: false });
  });
  it("peringatan bila bentuk dokumen tidak lazim atau penyedia tidak sesuai", () => {
    expect(contractWarnings("ekatalog", "surat_pesanan", true)).toEqual([]);
    expect(contractWarnings("kompetitif", "bukti_pembelian", true)[0]).toMatch(/kurang lazim/);
    expect(contractWarnings("swakelola", "sk_swakelola", true)[0]).toMatch(/tidak memiliki penyedia/);
    expect(contractWarnings("langsung", "spk", false)[0]).toMatch(/Penyedia belum dipilih/);
    expect(contractWarnings("lainnya", "kontrak", true)).toEqual([]);
  });
});
