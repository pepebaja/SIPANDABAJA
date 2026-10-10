import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "SIPANDABAJA", template: "%s | SIPANDABAJA" },
  description: "SIPANDABAJA: Sistem Informasi Pantau Data Pengadaan Barang dan Jasa.",
};
export const viewport: Viewport = { themeColor: "#0c1a3a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body className="font-sans">{children}</body></html>;
}
