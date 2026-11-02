"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 설계도의 그림 셋을 고르는 탭 — 그림마다 주소가 따로라 링크로 바로 열 수 있다.
export const DESIGN_TABS = [
  { href: "/design", label: "업무 흐름" },
  { href: "/design/model", label: "데이터 모델" },
  { href: "/design/system", label: "시스템 구성" },
] as const;

export function DesignTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="설계도 그림" className="mt-6 flex gap-1 overflow-x-auto border-b border-rule">
      {DESIGN_TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-4 px-4 py-2 focus-visible:-outline-offset-2 ${
              active ? "border-safety font-semibold" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
