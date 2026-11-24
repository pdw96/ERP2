import Form from "next/form";
import Link from "next/link";
import { shownQty } from "@/app/sales/plans/plan-qty";
import type { MrpPegCover, MrpPegDown, MrpPegOrder, MrpPegUp, MrpPegView } from "@/db/mrp";
import { shortDate } from "./dates";
import { MRP_PATH, mrpPegHref } from "./paths";

// 페깅 탭(메뉴 「MRP」) — 고른 계획오더가 어느 소요를 채우는지(위로 — 완제품이면 MPS 칸까지) · 어떤 소요를 낳았는지(아래로 — 맨 아래까지)를 나무로 보인다.
// 계획오더 마디는 번호가 그 계획오더의 페깅 링크이고, 「몫」(이 줄이 잇는 수량)과 계획오더 전체 수량을 함께 적는다. 읽기만 한다.

const KIND: Record<"MAKE" | "BUY", string> = { MAKE: "생산", BUY: "구매" };
const REASON: Record<"SAFETY" | "SURPLUS" | "SHORT", string> = {
  SAFETY: "안전재고 보충",
  SURPLUS: "남는 수량(최소량 · 배수)",
  SHORT: "가용재고 음수 메움",
};

const select = "w-full min-w-0 rounded border border-rule px-3 py-2 text-base";
const tree = "mt-2 grid gap-2 border-l border-rule pl-4";

/** 계획오더 전체 — 번호(링크) · 품목 · 생산/구매 · 수량 단위 · 시작 · 완성 · N일 늦음. */
function OrderLine({ order }: { order: MrpPegOrder }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <Link href={mrpPegHref(order.number)} className="font-mono underline underline-offset-4 hover:text-machine">
        {order.number}
      </Link>
      <span>
        <span className="font-mono">{order.item.code}</span> {order.item.name}
      </span>
      <span>{KIND[order.kind]}</span>
      <span className="tabular-nums">
        {shownQty(order.qty)} {order.unit}
      </span>
      <span className="tabular-nums">
        {shortDate(order.startDate)} → {shortDate(order.dueDate)}
      </span>
      {order.lateDays > 0 && <span className="font-semibold text-red-700">{order.lateDays}일 늦음</span>}
    </span>
  );
}

/** MPS 칸 한 줄 — MPS 수량은 그 계획오더의 수량이다. */
function MpsLine({ order }: { order: MrpPegOrder & { mps: NonNullable<MrpPegOrder["mps"]> } }) {
  return (
    <p>
      MPS · {order.item.code} · {order.mps.week.slice(5, 10)} 주 · {shownQty(order.qty)} ·{" "}
      {order.mps.fixed ? "고정" : "안"}
    </p>
  );
}

function UpNode({ node }: { node: MrpPegUp }) {
  if (node.kind !== "ORDER") {
    return (
      <li>
        <span>{REASON[node.kind]}</span> <span className="font-semibold tabular-nums">{shownQty(node.qty)}</span>
      </li>
    );
  }
  return (
    <li>
      <p>
        <span className="font-semibold tabular-nums">{shownQty(node.qty)}</span> ← {shortDate(node.needDate)} 필요 ·{" "}
        <OrderLine order={node.parent} />
      </p>
      {node.parent.mps && <MpsLine order={{ ...node.parent, mps: node.parent.mps }} />}
      {node.up.length > 0 && (
        <ul className={tree}>
          {node.up.map((child, i) => (
            <UpNode key={i} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function CoverNode({ cover, unit }: { cover: MrpPegCover; unit: string }) {
  if (cover.stock) {
    return (
      <li>
        <span>재고 {shownQty(cover.qty)}</span> <span className="text-muted">{unit}</span>
      </li>
    );
  }
  return (
    <li>
      <p>
        <span className="font-semibold tabular-nums">{shownQty(cover.qty)}</span>{" "}
        <span className="text-muted">{unit}</span> · <OrderLine order={cover.order} />
      </p>
      <DownList downs={cover.down} />
    </li>
  );
}

function DownList({ downs }: { downs: MrpPegDown[] }) {
  if (downs.length === 0) return null;
  return (
    <ul className={tree}>
      {downs.map((d, i) => (
        <li key={i}>
          <p>
            <span className="font-mono">{d.item.code}</span> {d.item.name} · 소요{" "}
            <span className="font-semibold tabular-nums">{shownQty(d.need)}</span> {d.unit}
            {d.covers.length === 0 && d.need === "0" && <span className="ml-2 text-muted">0(끝수)</span>}
          </p>
          {d.covers.length > 0 && (
            <ul className={tree}>
              {d.covers.map((c, j) => (
                <CoverNode key={j} cover={c} unit={d.unit} />
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export function MrpPeg({ peg }: { peg: MrpPegView }) {
  if (!peg.run) return null; // 실행한 적이 없다는 안내는 실행 상자(MrpRun)에만 둔다
  const { selected } = peg;
  const notice = !peg.hasPegs
    ? "이 실행에는 페깅이 없습니다 — [MRP 실행]을 다시 누르면 생깁니다"
    : peg.notice?.kind === "stale"
      ? `${peg.notice.order} 는 지난 실행의 계획오더입니다 — 새 실행에서 다시 고르세요`
      : peg.notice?.kind === "notFound"
        ? "고른 계획오더를 찾지 못했습니다 — 품목을 골라 다시 고르세요"
        : null;

  return (
    <>
      {peg.hasPegs && (
        // 폼 둘 — 품목을 바꾸면 고른 계획오더를 싣지 않아(서버가 그 품목의 첫 계획오더를 연다) 품목 바꿈이 묻히지 않는다.
        <div className="mt-4 grid max-w-4xl gap-3 border-y border-rule bg-white px-4 py-4 sm:grid-cols-2">
          <Form
            key={`item|${peg.item}`}
            action={MRP_PATH}
            replace
            role="search"
            aria-label="페깅 품목 고르기"
            className="grid gap-2"
          >
            <input type="hidden" name="view" value="peg" />
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">품목</span>
              <select name="item" defaultValue={peg.item ?? ""} className={select}>
                {peg.item === null && <option value="">품목을 고르세요</option>}
                {peg.items.map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.code} {i.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
                보기
              </button>
            </div>
          </Form>
          <Form
            key={`order|${selected?.number}`}
            action={MRP_PATH}
            replace
            role="search"
            aria-label="페깅 계획오더 고르기"
            className="grid gap-2"
          >
            <input type="hidden" name="view" value="peg" />
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">계획오더</span>
              <select name="order" defaultValue={selected?.number ?? ""} className={select}>
                {!selected && <option value="">계획오더를 고르세요</option>}
                {peg.orders.map((o) => (
                  <option key={o.number} value={o.number}>
                    {o.number} · {shownQty(o.qty)} {o.unit} · {shortDate(o.dueDate)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
                보기
              </button>
            </div>
          </Form>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-4 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {notice}
        </p>
      )}
      {selected && (
        <>
          <section aria-label="고른 계획오더" className="mt-4 border border-rule bg-white px-4 py-3">
            <OrderLine order={selected} />
          </section>
          {peg.hasPegs && peg.truncated && (
            <p role="status" className="mt-4 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
              마디가 500개를 넘어 나머지는 줄였습니다
            </p>
          )}
          {peg.hasPegs && (
            <>
              <section aria-label="위로" className="mt-4">
                <h2 className="font-semibold">▲ 위로 — 이 계획오더가 채우는 소요</h2>
                <ul className={tree}>
                  {selected.mps && (
                    <li>
                      <MpsLine order={{ ...selected, mps: selected.mps }} />
                    </li>
                  )}
                  {peg.up.map((node, i) => (
                    <UpNode key={i} node={node} />
                  ))}
                </ul>
              </section>
              <section aria-label="아래로" className="mt-4">
                <h2 className="font-semibold">▼ 아래로 — 이 계획오더가 낳은 소요</h2>
                {selected.kind === "BUY" ? (
                  <p className="mt-2 text-muted">구매라 아래가 없습니다</p>
                ) : selected.noBom ? (
                  <p className="mt-2 text-muted">BOM 없음 — 펼칠 BOM 줄이 없습니다</p>
                ) : (
                  <DownList downs={peg.down} />
                )}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
