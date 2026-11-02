"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AREAS } from "@/lib/areas";

// 넓은 화면에서는 왼쪽에 늘 보이고, 휴대폰 폭에서는 「메뉴」 단추로 펼친다.
export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav
      aria-label="업무 영역"
      className="border-b border-gray-200 bg-gray-50 md:w-48 md:shrink-0 md:border-r md:border-b-0"
    >
      <button
        type="button"
        className="w-full px-4 py-3 text-left font-medium md:hidden"
        aria-expanded={open}
        aria-controls="area-menu"
        onClick={() => setOpen((v) => !v)}
      >
        메뉴
      </button>
      <ul id="area-menu" className={`${open ? "block" : "hidden"} md:block md:py-2`}>
        {AREAS.map((area) => {
          const active = pathname === area.href || pathname.startsWith(`${area.href}/`);
          return (
            <li key={area.href}>
              <Link
                href={area.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 ${active ? "bg-blue-100 font-semibold text-blue-800" : "hover:bg-gray-100"}`}
              >
                {area.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
