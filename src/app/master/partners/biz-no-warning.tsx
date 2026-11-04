import Link from "next/link";
import type { SharedBizNo } from "@/db/partners";

// 같은 번호(한국은 사업자등록번호, 해외는 같은 나라의 해외 사업자번호)를 쓰는 다른 거래처가 있을 때의 경고 —
// 저장을 막지 않는다(저자 판정 2026-11-03). 한 사업자를 지점별로 둘 수도 있어서 거절하지 않고, 같은 거래처를 두 번 등록한 것인지 보게 한다.
export function BizNoWarning({
  bizNo,
  korean = true,
  shared,
}: {
  bizNo: string;
  /** 한국 거래처면 사업자등록번호, 아니면 해외 사업자번호. */
  korean?: boolean;
  shared: SharedBizNo[];
}) {
  if (shared.length === 0) return null;
  return (
    <div role="note" className="mt-2 border-l-4 border-safety bg-white px-4 py-2 text-sm wrap-anywhere">
      <p>
        <span className="font-semibold">확인하세요</span> — 같은 {korean ? "사업자등록번호" : "해외 사업자번호"}(
        <span className="font-mono">{bizNo}</span>
        )를 쓰는 거래처가 있습니다. 같은 거래처를 두 번 등록한 것이 아닌지 보세요.
      </p>
      <ul className="mt-1">
        {shared.map((p) => (
          <li key={p.code}>
            <Link href={`/master/partners/${p.code}`} className="font-mono underline underline-offset-4">
              {p.code}
            </Link>{" "}
            {p.name}
            {!p.active && <span className="ml-1 text-muted">(사용 안 함)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
