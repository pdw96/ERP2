"use client";

import { useEffect, useSyncExternalStore } from "react";

// 주소만으로 메뉴를 알 수 없는 화면이 왼쪽 메뉴에 「이 메뉴」를 알린다 — 전표 보기(`/inventory/moves/<전표번호>`)는 주소에 수불구분이 없어,
// 화면이 그 전표의 등록 메뉴를 알린다(설계 「2026-11-09 — PR F 를 열기 전에 정한 것」의 주소). 알림은 그 주소에서만 쓰여, 다른 화면으로 가면 저절로 빠진다.

type Hint = { pathname: string; href: string } | null;

let hint: Hint = null;
const listeners = new Set<() => void>();

function setHint(next: Hint) {
  hint = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 이 주소에서 왼쪽 메뉴가 가리킬 메뉴의 주소 — 알림이 없거나 다른 주소의 것이면 undefined. */
export function useMenuHint(pathname: string): string | undefined {
  const h = useSyncExternalStore(
    subscribe,
    () => hint,
    () => null,
  );
  return h && h.pathname === pathname ? h.href : undefined;
}

/** 화면에 두면 그 주소에서 왼쪽 메뉴가 `href` 를 가리킨다. 그리는 것은 없다. */
export function MenuHint({ pathname, href }: { pathname: string; href: string }) {
  useEffect(() => {
    setHint({ pathname, href });
    return () => setHint(null);
  }, [pathname, href]);
  return null;
}
