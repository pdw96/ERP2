import Link from "next/link";

// 시스템 관리 › 번호 규칙 › … — 화면 맨 위의 길.
export function Crumbs({ here }: { here?: string }) {
  return (
    <p className="text-sm text-muted">
      <Link href="/system" className="underline-offset-4 hover:underline">
        시스템 관리
      </Link>{" "}
      ›{" "}
      {here ? (
        <>
          <Link href="/system/number-rules" className="underline-offset-4 hover:underline">
            번호 규칙
          </Link>{" "}
          › {here}
        </>
      ) : (
        "번호 규칙"
      )}
    </p>
  );
}
