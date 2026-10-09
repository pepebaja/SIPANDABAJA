import "./globals.css";
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });
export const metadata = { title: "SIPANDA PBJ" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body className={`${inter.className} bg-slate-50 text-slate-900 text-[15px]`}>{children}</body></html>;
}
