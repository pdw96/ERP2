import Form from "next/form";
import Link from "next/link";
import { shownQty } from "@/app/sales/plans/plan-qty";
import type { MrpPegDown, MrpPegOrder, MrpPegUp, MrpPegView } from "@/db/mrp";
import { shortDate } from "./dates";
import { MRP_PATH, mrpPegHref } from "./paths";

// 페깅 탭(메뉴 「MRP」) — 고른 계획오더가 어느 소요를 채우는지(위로 — 완제품이면 MPS 칸까지) · 어떤 소요를 낳았는지(아래로 — 맨 아래까지)를 열을 맞춘 표 한 장의 나무로 보인다(ADR 0038).
// 계획오더 줄은 번호가 그 계획오더의 페깅 링크이고, 「몫」(이 줄이 잇는 수량)과 계획오더 전체 수량(수량 열)을 따로 적는다. 깊이는 첫 열의 들여쓰기로만 보인다. 읽기만 한다.

const KIND: Record<"MAKE" | "BUY", string> = { MAKE: "생산", BUY: "구매" };
const REASON: Record<"SAFETY" | "SURPLUS" | "SHORT", string> = {
  SAFETY: "안전재고 보충",
  SURPLUS: "남는 수량(최소량 · 배수)",
  SHORT: "가용재고 음수 메움",
};

const select = "w-full min-w-0 rounded border border-rule px-3 py-2 text-base";
const cell = "px-2 py-2";
const num = `${cell} text-right tabular-nums`;
const COLS = 9;

/** 첫 열(몫) — 깊이만큼 들여 쓰고 └ 표시를 붙인다. 고른 계획오더 줄(depth null)은 들이지 않는다. */
function ShareCell({ depth, children }: { depth: number | null; children?: React.ReactNode }) {
  return (
    <td className={`${num}`} style={depth === null ? undefined : { paddingLeft: `${0.5 + depth * 1.25}rem` }}>
      {depth !== null && (
        <span aria-hidden className="mr-1 text-muted">
          └
        </span>
      )}
      {children}
    </td>
  );
}

/** 「시작 → 완성」 — 같은 날이면 한 날짜만. */
function span(order: MrpPegOrder): string {
  return order.startDate === order.dueDate
    ? shortDate(order.dueDate)
    : `${shortDate(order.startDate)} → ${shortDate(order.dueDate)}`;
}

/** 계획오더의 열들 — 계획오더(링크) · 품목 · 구분 · 수량 · 단위 · 시작 → 완성 · 늦음. */
function OrderCells({ order }: { order: MrpPegOrder }) {
  return (
    <>
      <td className={`${cell} font-mono`}>
        <Link href={mrpPegHref(order.number)} className="underline underline-offset-4 hover:text-machine">
          {order.number}
        </Link>
      </td>
      <td className={cell}>
        <span className="font-mono">{order.item.code}</span> {order.item.name}
      </td>
      <td className={cell}>{KIND[order.kind]}</td>
      <td className={num}>{shownQty(order.qty)}</td>
      <td className={cell}>{order.unit}</td>
      <td className={`${cell} whitespace-nowrap tabular-nums`}>{span(order)}</td>
      <td className={`${num} whitespace-nowrap text-red-700`}>{order.lateDays > 0 ? `${order.lateDays}일` : null}</td>
    </>
  );
}

const rowLine = "border-b border-rule align-top";

/** 계획오더 한 줄 — 몫(없으면 빈 칸) · 필요일(없으면 빈 칸) 뒤에 계획오더의 열들. */
function OrderRow({
  order,
  depth,
  share,
  needDate,
  selected,
}: {
  order: MrpPegOrder;
  depth: number | null;
  share?: string;
  needDate?: string;
  selected?: boolean;
}) {
  return (
    <tr
      className={`${rowLine} ${selected ? "bg-floor font-semibold" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <ShareCell depth={depth}>
        {share !== undefined && <span className="font-semibold">{shownQty(share)}</span>}
      </ShareCell>
      <td className={`${cell} whitespace-nowrap tabular-nums`}>{needDate ? shortDate(needDate) : null}</td>
      <OrderCells order={order} />
    </tr>
  );
}

/** MPS 칸 줄 — MPS 수량은 그 계획오더의 수량이다. */
function MpsRow({ order, depth }: { order: MrpPegOrder & { mps: NonNullable<MrpPegOrder["mps"]> }; depth: number }) {
  const week = order.mps.week.slice(5, 10);
  const fixed = order.mps.fixed ? "고정" : "안";
  return (
    <tr className={rowLine} aria-label={`MPS · ${order.item.code} · ${week} 주 · ${shownQty(order.qty)} · ${fixed}`}>
      <ShareCell depth={depth} />
      <td className={cell} />
      <td className={`${cell} font-mono`}>MPS</td>
      <td className={cell}>
        {week} 주 · {fixed}
      </td>
      <td className={cell} />
      <td className={num}>{shownQty(order.qty)}</td>
      <td className={cell}>{order.unit}</td>
      <td className={cell} />
      <td className={cell} />
    </tr>
  );
}

function MpsAfter({ order, depth }: { order: MrpPegOrder; depth: number }) {
  return order.mps ? <MpsRow order={{ ...order, mps: order.mps }} depth={depth} /> : null;
}

/** 위로 — 윗 계획오더 · 안전재고 · 남는 수량 줄과 그 윗줄(깊이마다 한 칸 더 들인다). */
function upRows(nodes: MrpPegUp[], depth: number, key: string): React.ReactNode[] {
  return nodes.flatMap((node, i) => {
    const k = `${key}-${i}`;
    if (node.kind !== "ORDER") {
      return [
        <tr key={k} className={rowLine}>
          <ShareCell depth={depth}>
            <span className="font-semibold">{shownQty(node.qty)}</span>
          </ShareCell>
          <td colSpan={COLS - 1} className={cell}>
            {REASON[node.kind]}
          </td>
        </tr>,
      ];
    }
    return [
      <OrderRow key={k} order={node.parent} depth={depth} share={node.qty} needDate={node.needDate} />,
      <MpsAfter key={`${k}-mps`} order={node.parent} depth={depth + 1} />,
      ...upRows(node.up, depth + 1, k),
    ];
  });
}

/** 아래로 — 자품목 소요 줄 → 덮는 재고 · 계획오더 줄(한 칸 더) → 그 계획오더의 아래(또 한 칸 더). */
function downRows(downs: MrpPegDown[], depth: number, key: string): React.ReactNode[] {
  return downs.flatMap((d, i) => {
    const k = `${key}-${i}`;
    const rows: React.ReactNode[] = [
      <tr key={k} className={rowLine}>
        <ShareCell depth={depth}>
          <span className="text-muted">소요</span> <span className="font-semibold">{shownQty(d.need)}</span>
        </ShareCell>
        <td className={cell} />
        <td className={cell}>{d.covers.length === 0 && d.need === "0" ? "0(끝수)" : null}</td>
        <td className={cell}>
          <span className="font-mono">{d.item.code}</span> {d.item.name}
        </td>
        <td className={cell} />
        <td className={cell} />
        <td className={cell}>{d.unit}</td>
        <td className={cell} />
        <td className={cell} />
      </tr>,
    ];
    d.covers.forEach((c, j) => {
      const ck = `${k}-${j}`;
      if (c.stock) {
        rows.push(
          <tr key={ck} className={rowLine}>
            <ShareCell depth={depth + 1}>
              <span className="font-semibold">{shownQty(c.qty)}</span>
            </ShareCell>
            <td className={cell} />
            <td className={cell}>재고</td>
            <td className={cell} />
            <td className={cell} />
            <td className={cell} />
            <td className={cell}>{d.unit}</td>
            <td className={cell} />
            <td className={cell} />
          </tr>,
        );
      } else {
        rows.push(
          <OrderRow key={ck} order={c.order} depth={depth + 1} share={c.qty} />,
          ...downRows(c.down, depth + 2, ck),
        );
      }
    });
    return rows;
  });
}

/** 구역 머리 — 표 전체 너비 한 줄. */
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-rule bg-floor">
      <th scope="colgroup" colSpan={COLS} className="px-2 py-2 text-left font-semibold">
        {children}
      </th>
    </tr>
  );
}

function NoteRow({ children }: { children: React.ReactNode }) {
  return (
    <tr className={rowLine}>
      <td colSpan={COLS} className={`${cell} text-muted`}>
        {children}
      </td>
    </tr>
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
        // 폼 하나 — 번호와 품목이 함께 가면 서버가 품목을 먼저 따른다(품목을 바꾸면 그 품목의 첫 계획오더가 열린다).
        <Form
          key={`${peg.item}|${selected?.number}`}
          action={MRP_PATH}
          replace
          role="search"
          aria-label="페깅 고르기"
          className="mt-4 flex max-w-4xl flex-wrap items-end gap-3 border-y border-rule bg-white px-4 py-4"
        >
          <input type="hidden" name="view" value="peg" />
          <label className="grid min-w-48 flex-1 gap-1 text-sm">
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
          <label className="grid min-w-48 flex-1 gap-1 text-sm">
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
          <button type="submit" className="rounded border border-machine px-5 py-2 font-semibold hover:bg-floor">
            보기
          </button>
        </Form>
      )}
      {notice && (
        <p role="status" className="mt-4 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
          {notice}
        </p>
      )}
      {selected && (
        <>
          {peg.hasPegs && peg.truncated && (
            <p role="status" className="mt-4 max-w-3xl border-l-4 border-safety bg-white px-5 py-3">
              마디가 500개를 넘어 나머지는 줄였습니다
            </p>
          )}
          <p className="mt-4 text-sm text-muted md:hidden">표를 옆으로 밀면 다른 열이 보입니다</p>
          <div
            className="relative mt-2 overflow-x-auto border-x border-rule bg-white"
            tabIndex={0}
            role="region"
            aria-label="페깅 표"
          >
            <table className="w-max min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                페깅 — 몫 · 필요일 · 계획오더 · 품목 · 구분 · 수량 · 단위 · 시작 → 완성 · 늦음. 첫 줄이 고른
                계획오더이고 위로 · 아래로가 들여쓴 나무로 이어집니다
              </caption>
              <thead>
                <tr className="border-b-2 border-machine">
                  <th scope="col" className={`${cell} text-right`}>
                    몫
                  </th>
                  <th scope="col" className={cell}>
                    필요일
                  </th>
                  <th scope="col" className={cell}>
                    계획오더
                  </th>
                  <th scope="col" className={cell}>
                    품목
                  </th>
                  <th scope="col" className={cell}>
                    구분
                  </th>
                  <th scope="col" className={`${cell} text-right`}>
                    수량
                  </th>
                  <th scope="col" className={cell}>
                    단위
                  </th>
                  <th scope="col" className={cell}>
                    시작 → 완성
                  </th>
                  <th scope="col" className={`${cell} text-right`}>
                    늦음
                  </th>
                </tr>
              </thead>
              <tbody aria-label="고른 계획오더">
                <OrderRow order={selected} depth={null} selected />
                {peg.hasPegs && <MpsAfter order={selected} depth={1} />}
              </tbody>
              {peg.hasPegs && (
                <>
                  <tbody aria-label="위로">
                    <SectionHead>▲ 위로 — 이 계획오더가 채우는 소요</SectionHead>
                    {upRows(peg.up, 0, "u")}
                  </tbody>
                  <tbody aria-label="아래로">
                    <SectionHead>▼ 아래로 — 이 계획오더가 낳은 소요</SectionHead>
                    {selected.kind === "BUY" ? (
                      <NoteRow>구매라 아래가 없습니다</NoteRow>
                    ) : selected.noBom ? (
                      <NoteRow>BOM 없음 — 펼칠 BOM 줄이 없습니다</NoteRow>
                    ) : (
                      downRows(peg.down, 0, "d")
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </>
      )}
    </>
  );
}
