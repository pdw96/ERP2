import Link from "next/link";
import type { ReactNode } from "react";
import { eul } from "@/lib/josa";

// 저장한 뒤 목록 맨 위의 알림 — 「RM-0007 솔더 볼을 저장했습니다」. 「사용 안 함」으로 바꿔 목록에서 빠졌으면 다시 보는 길을 알린다.
export function SavedNotice({
  code,
  name,
  active,
  shown,
  listHref,
  children,
}: {
  code: string;
  name: string;
  active: boolean;
  shown: boolean;
  listHref: string;
  /** 알림 아래에 덧붙이는 것(예: 거래처의 사업자등록번호 겹침 경고). */
  children?: ReactNode;
}) {
  return (
    <div role="status" className="mt-6 border-l-4 border-safety bg-white px-5 py-3 wrap-anywhere">
      <p>
        <span className="font-semibold">{code}</span> {eul(name)} 저장했습니다.
      </p>
      {!shown && !active && (
        <p className="mt-1 text-sm text-muted">
          「사용 안 함」이라 목록에서 빠졌습니다 —{" "}
          <Link href={`${listHref}?inactive=1`} className="underline underline-offset-4">
            사용 안 함 포함
          </Link>
          을 켜면 보입니다.
        </p>
      )}
      {children}
    </div>
  );
}
