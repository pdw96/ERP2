import Link from "next/link";

// 공통코드 화면의 위치 줄 — 「시스템 관리 › 공통코드 › UNIT 단위 › 새 값」.
export function Crumbs({ group, last }: { group?: { code: string; name: string }; last?: string }) {
  const link = "underline-offset-4 hover:underline";
  return (
    <p className="text-sm text-muted">
      <Link href="/system" className={link}>
        시스템 관리
      </Link>{" "}
      ›{" "}
      {group ? (
        <>
          <Link href="/system/codes" className={link}>
            공통코드
          </Link>{" "}
          ›{" "}
          {last ? (
            <>
              <Link href={`/system/codes/${group.code}`} className={link}>
                {group.code} {group.name}
              </Link>{" "}
              › {last}
            </>
          ) : (
            `${group.code} ${group.name}`
          )}
        </>
      ) : (
        "공통코드"
      )}
    </p>
  );
}
