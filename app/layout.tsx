import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SIPANDABAJA", template: "%s | SIPANDABAJA" },
  description: "SIPANDABAJA: Sistem Informasi Pantau Data Pengadaan Barang dan Jasa.",
};
export const viewport: Viewport = { themeColor: "#0c1a3a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body className={`${body.variable} ${display.variable} font-sans`}>{children}</body></html>;
}
