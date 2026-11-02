import type { Metadata } from "next";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP2",
  description: "재고 · 생산 · 구매 · 영업 · 회계 · 인사 ERP 포트폴리오 데모",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="bg-blue-900 px-4 py-3 text-white">
          <Link href="/" className="text-lg font-bold">
            ERP2
          </Link>
        </header>
        <div className="flex flex-1 flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
