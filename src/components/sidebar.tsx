"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AREAS } from "@/lib/areas";

// 넓은 화면에서는 왼쪽에 늘 보이고, 휴대폰 폭에서는 「메뉴」 단추로 펼친다.
// 지금 보는 영역은 바닥 안전선처럼 노란 띠로 표시한다.
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label="업무 영역"
      className="bg-machine text-machine-text md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 md:block md:px-6 md:pt-7 md:pb-8">
        <Link href="/" onClick={() => setOpen(false)} className="block focus-visible:outline-safety">
          <span className="block text-xl leading-tight font-semibold text-white">ERP2</span>
          <span className="block text-sm">제조 통합 관리</span>
        </Link>
        <button
          type="button"
          className="rounded border border-machine-line px-3 py-1.5 text-sm font-semibold text-white focus-visible:outline-safety md:hidden"
          aria-expanded={open}
          aria-controls="area-menu"
          onClick={() => setOpen((v) => !v)}
        >
          메뉴
        </button>
      </div>
      <ul
        id="area-menu"
        className={`${open ? "block" : "hidden"} border-t border-machine-line pb-3 md:block md:border-t-0`}
      >
        {AREAS.map((area) => {
          const active = pathname === area.href || pathname.startsWith(`${area.href}/`);
          return (
            <li key={area.href}>
              <Link
                href={area.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block border-l-4 px-5 py-2.5 focus-visible:-outline-offset-2 focus-visible:outline-safety md:px-6 ${
                  active
                    ? "border-safety bg-machine-deep font-semibold text-white"
                    : "border-transparent hover:bg-machine-deep hover:text-white"
                }`}
              >
                {area.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-auto hidden px-6 pb-6 text-sm md:block">샘플 데이터로 움직이는 포트폴리오 데모입니다.</p>
    </nav>
  );
}
