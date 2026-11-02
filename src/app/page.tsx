import Link from "next/link";

// 자재가 들어와 제품으로 나가는 순서. 실제 순서라 번호를 붙인다.
const FLOW = [
  { href: "/purchasing", area: "구매", step: "발주한 자재가 들어온다" },
  { href: "/inventory", area: "재고", step: "자재를 창고에 둔다" },
  { href: "/production", area: "생산", step: "작업지시대로 자재를 써서 만든다" },
  { href: "/inventory", area: "재고", step: "완제품이 창고에 들어온다" },
  { href: "/sales", area: "영업", step: "수주한 제품을 내보낸다" },
] as const;

export default function Home() {
  return (
    <section className="max-w-5xl">
      <h1 className="max-w-xl text-3xl leading-tight font-semibold md:text-4xl">자재가 들어와 제품으로 나가기까지</h1>
      <p className="mt-4 max-w-xl text-muted">
        ERP2는 재고와 생산을 중심으로 구매, 영업, 회계, 인사를 하나로 잇는 ERP입니다. 영역마다 화면이 차례로 열립니다.
      </p>

      <ol className="relative mt-12 grid gap-8 md:grid-cols-5 md:gap-4">
        {FLOW.map((item, i) => (
          <li key={i} className="relative flex gap-4 md:flex-col md:items-center md:gap-3 md:text-center">
            {i < FLOW.length - 1 && (
              // 다음 단계로 잇는 선 — 휴대폰에서는 아래로, 넓은 화면에서는 오른쪽으로
              <span
                aria-hidden
                className="absolute top-8 left-[15px] h-full w-0.5 bg-machine md:top-[15px] md:left-[calc(50%+1rem)] md:h-0.5 md:w-[calc(100%-1rem)]"
              />
            )}
            <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-machine text-sm font-semibold text-white ring-4 ring-floor">
              {i + 1}
            </span>
            <div>
              <Link href={item.href} className="text-lg font-semibold underline-offset-4 hover:underline">
                {item.area}
              </Link>
              <p className="mt-1 text-sm text-muted">{item.step}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 border-t-2 border-machine pt-4 md:flex md:items-baseline md:gap-6">
        <Link href="/accounting" className="text-lg font-semibold underline-offset-4 hover:underline">
          회계
        </Link>
        <p className="text-sm text-muted">단계마다 생긴 거래가 전표로 쌓여 채권, 채무, 시산표가 됩니다.</p>
      </div>
      <div className="mt-4 md:flex md:items-baseline md:gap-6">
        <Link href="/hr" className="text-lg font-semibold underline-offset-4 hover:underline">
          인사
        </Link>
        <p className="text-sm text-muted">부서와 사원을 두고, 누가 ERP를 쓰는지 정합니다.</p>
      </div>
    </section>
  );
}
