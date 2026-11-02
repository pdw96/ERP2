import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP2",
  description: "재고 · 생산을 중심으로 구매 · 영업 · 회계 · 인사를 잇는 ERP 포트폴리오 데모",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full md:flex">
        <Sidebar />
        <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-12">{children}</main>
      </body>
    </html>
  );
}
