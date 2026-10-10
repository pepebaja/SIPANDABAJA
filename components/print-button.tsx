"use client";
import { Icon } from "@/components/icons";
export function PrintButton({ label = "Cetak / Simpan PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn btn-primary"><Icon name="printer" className="h-4 w-4" />{label}</button>;
}
