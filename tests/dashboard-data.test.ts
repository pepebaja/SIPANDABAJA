import { describe, expect, it } from "vitest";
import { aggregateLevels, byStage, quarterSeries, type DashIds } from "@/lib/dashboard-data";
const ids = (p: string, a: string, s: string, acc: string): DashIds => ({ progId: `P${p}`, progCode: `4.0${p}`, progName: `Program ${p}`, actId: `A${a}`, actCode: `4.0${p}.${a}`, actName: `Kegiatan ${a}`, subId: `S${s}`, subCode: `S.${s}`, subName: `Sub ${s}`, accCode: acc });
describe("agregasi dashboard", () => {
  const entries = [{ ...ids("1", "1", "1", "5.1.02.01.01.0001"), amount: "1000.00" }, { ...ids("1", "1", "2", "5.2.02.01.01.0001"), amount: "3000.00" }, { ...ids("2", "2", "3", "5.1.02.02.01.0001"), amount: "6000.00" }];
  const txs = [{ ...ids("1", "1", "1", "5.1.02.01.01.0001"), amount: "250.00", stage: "Murni" }, { ...ids("2", "2", "3", "5.1.02.02.01.0001"), amount: "3000.00", stage: "Pergeseran" }, { ...ids("2", "2", "3", "5.1.02.02.01.0001"), amount: "-500.00", stage: "Pergeseran" }];
  const a = aggregateLevels(entries, txs);
  it("program: pagu, realisasi, sisa, persentase, dan tautan drill-down", () => {
    expect(a.program.map((g) => [g.code, g.pagu, g.realized, g.remaining, g.pct])).toEqual([["4.02", "6000.00", "2500.00", "3500.00", 41.6], ["4.01", "4000.00", "250.00", "3750.00", 6.2]]);
    expect(a.program[0]?.href).toBe("/realisasi?tab=daftar&program=P2");
  });
  it("jenis belanja memakai awalan 3 segmen berlabel", () => {
    expect(a.jenis.map((g) => [g.code, g.name, g.pagu])).toEqual([["5.1.02", "Belanja Barang dan Jasa", "7000.00"], ["5.2.02", "Belanja Modal Peralatan dan Mesin", "3000.00"]]);
    expect(a.jenis[0]?.href).toBe("/realisasi?tab=daftar&jenis=5.1.02");
  });
  it("kegiatan dan sub kegiatan; rekening tanpa pagu tidak membagi nol", () => {
    expect(a.kegiatan).toHaveLength(2); expect(a.sub).toHaveLength(3);
    const x = aggregateLevels([], [{ ...ids("9", "9", "9", "5.1.01.01.01.0001"), amount: "10.00", stage: "Murni" }]); expect(x.program[0]).toMatchObject({ pagu: "0.00", realized: "10.00", pct: null });
  });
  it("realisasi per tahapan dan deret triwulan kumulatif", () => {
    expect(byStage(txs)).toEqual([{ name: "Pergeseran", value: "2500.00" }, { name: "Murni", value: "250.00" }]);
    const s = quarterSeries([[1, 100], [3, 300]], [[1, 40], [2, 80]]);
    expect(s.map((x) => [x.kas, x.kasCum, x.real, x.realCum])).toEqual([[100, 100, 40, 40], [0, 100, 80, 120], [300, 400, 0, 120], [0, 400, 0, 120]]);
  });
});
