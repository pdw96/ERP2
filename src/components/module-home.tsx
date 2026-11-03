import Link from "next/link";
import { areaByHref, isOpen } from "@/lib/areas";

// 모듈의 첫 화면 — 그 모듈의 메뉴를 묶음대로 보인다. 지은 화면은 링크, 아직 짓지 않은 메뉴는 「준비 중」.
export function ModuleHome({ href }: { href: string }) {
  const area = areaByHref(href);
  return (
    <section className="max-w-3xl">
      <h1 className="text-3xl leading-tight font-semibold">{area.label}</h1>
      <p className="mt-2 text-muted">{area.summary}</p>
      {!isOpen(area) && (
        <div className="mt-8 border-l-4 border-safety bg-white px-5 py-4">
          <p className="font-semibold">준비 중입니다.</p>
          <p className="mt-1 text-sm text-muted">이 모듈의 화면과 샘플 데이터는 차례로 열립니다.</p>
        </div>
      )}
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {area.groups.map((group, gi) => (
          <section key={group.label ?? gi} aria-label={group.label ?? `${area.label} 메뉴`}>
            {group.label && <h2 className="mb-2 text-sm font-semibold text-muted">{group.label}</h2>}
            <ul className="divide-y divide-rule border-y border-rule bg-white">
              {group.menus.map((menu) => (
                <li key={menu.label}>
                  {menu.href ? (
                    <Link
                      href={menu.href}
                      className="flex items-baseline justify-between gap-3 px-4 py-3 font-semibold hover:bg-floor focus-visible:-outline-offset-2"
                    >
                      {menu.label}
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </Link>
                  ) : (
                    <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-muted">
                      {menu.label}
                      <span className="text-xs">준비 중 · 조각 「{menu.slice}」</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
