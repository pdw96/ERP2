"use client";

import { startTransition, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Field, inputClass, Section } from "@/components/form-parts";
import type { MoveFormOptions, MoveItemOption, MoveWarehouseOption, OnHand, WarehouseStockRow } from "@/db/stock";
import { isMadeType, type MoveType } from "@/lib/master-codes";
import {
  MOVE_MAX_LINES,
  MOVE_NOTE_MAX,
  type MoveErrors,
  type MoveLineErrors,
  type MoveLineValues,
} from "@/lib/move-input";
import { onHandAction, type MoveFormState } from "./actions";
import { StockPanel } from "./stock-panel";

// 수불 등록의 입력(성공 기준 2 ~ 6 · 12) — 일자 · 비고를 한 번 쓰고 줄을 「줄 더하기」로 한 줄씩 늘린다(설계 「2026-11-09 — PR C 를 열기 전에
// 정한 것」). 수불구분은 메뉴가 정하고(ADR 0020) 그 구분의 칸만 보인다. 기타입고는 품목을 고르면 기본 입고 창고가 미리
// 채워진다(기본 출고 창고는 이 조각의 화면이 쓰지 않는다 — ADR 0022 의 1). 출고 · 이동은 그 창고의 LOT 를 가용 수량과 함께 고른다. 검사는 서버가 하고 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않는다 — 화면은 틀린
// 칸 · 줄과 까닭을 보인다. 저장 상태는 부르는 쪽(move-entry.tsx)이 쥐고, 저장되면 이 입력을 새로 그려 비운다.
// 기타출고 · 재고이동 · 재고조정은 창고를 전표 머리에서 고르고(이동은 출고창고 → 입고창고) 모든 줄이 그 창고이며, 그 창고의 현재고 표에서
// 골라 줄로 넣는다(설계 「2026-11-09 — PR F 검토 중 정한 것」). 기타입고는 줄마다 창고를 고른다. 머리의 창고도 부르는 쪽이 쥐어 저장 뒤에도 남는다.
// 휴대폰 폭에서는 머리 칸이 세로로 쌓이고 줄 표는 옆으로 민다.

/** 전표 머리의 창고 — 기타출고 · 재고조정은 warehouse 하나, 재고이동은 warehouse(출고창고) → toWarehouse(입고창고). */
export type MoveHeader = { warehouse: string; toWarehouse: string };

type Props = {
  options: MoveFormOptions;
  today: string;
  moveType: MoveType;
  state: MoveFormState;
  formAction: (form: FormData) => void;
  pending: boolean;
  head: MoveHeader;
  onHead: (head: MoveHeader) => void;
};

const blankLine = (): MoveLineValues => ({ item: "", lot: "", warehouse: "", toWarehouse: "", qty: "", unit: "" });
const codeOf = (text: string | undefined) => (text ?? "").trim().split(/\s+/)[0] ?? "";
const handKey = (item: string, warehouse: string) => `${item}|${warehouse}`;
/** 줄이는 줄인가 — 출고 · 이동, 그리고 − 를 붙인 조정. */
const reduces = (type: MoveType, qty: string | undefined) =>
  type === "OUT" || type === "XFER" || (type === "ADJ" && (qty ?? "").trim().startsWith("-"));

export function MoveForm({ options, today, moveType, state, formAction, pending, head, onHead }: Props) {
  const rejected = state && !state.ok ? state : null;
  /** 창고를 머리에서 고르는가 — 기타입고만 줄마다 고른다. */
  const fixed = moveType !== "IN";
  /**
   * 줄이 실제로 보내는 값 — 머리에서 고르면 창고 칸은 머리의 창고다. 아무것도 넣지 않은 줄은 창고도 비워 둔다 — 서버는 칸이 모두 빈 줄을 없는 줄로
   * 치므로(src/lib/move-input.ts), 창고만 붙으면 쓰지 않은 줄이 전표를 막는다.
   */
  const effective = (l: MoveLineValues): MoveLineValues => {
    if (!fixed) return l;
    const used = [l.item, l.lot, l.qty, l.unit].some((v) => (v ?? "").trim() !== "");
    if (!used) return { ...l, warehouse: "", toWarehouse: "" };
    return { ...l, warehouse: head.warehouse, toWarehouse: moveType === "XFER" ? head.toWarehouse : "" };
  };
  const [lines, setLines] = useState<MoveLineValues[]>(() => [blankLine()]);
  const [errors, setErrors] = useState<MoveErrors>({ header: {}, lines: {} });
  const [hand, setHand] = useState<Record<string, OnHand[] | "loading" | null>>({});

  // 서버가 거절하면 까닭을 받아 칸 옆에 보인다 — 칸의 값은 화면이 쥐고 있어 그대로 남는다(받은 결과가 바뀔 때 한 번).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setErrors(rejected?.errors ?? { header: {}, lines: {} });
  }

  const itemOf = (text: string | undefined): MoveItemOption | undefined =>
    options.items.find((i) => i.code === codeOf(text));

  // 그 품목 · 창고의 가용 재고를 한 번 읽어 둔다 — 출고 · 이동의 LOT 고르기와 가용 수량, 조정의 LOT 제안.
  const asked = useRef(new Set<string>());
  const ensureHand = (line: MoveLineValues) => {
    const item = itemOf(line.item);
    if (!item || !line.warehouse || moveType === "IN") return;
    const key = handKey(item.code, line.warehouse);
    if (asked.current.has(key)) return;
    asked.current.add(key);
    setHand((h) => ({ ...h, [key]: "loading" }));
    onHandAction(item.code, line.warehouse).then((rows) => setHand((h) => ({ ...h, [key]: rows })));
  };

  const setLine = (index: number, patch: MoveLineValues) => {
    ensureHand(effective({ ...lines[index], ...patch }));
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setErrors((e) => {
      if (!e.lines[index]) return e;
      const next = { ...e.lines };
      delete next[index];
      return { ...e, lines: next };
    });
  };

  /** 품목을 고르면 LOT · 단위를 비운다. 기타입고는 품목의 기본 입고 창고를 채운다 — 다른 구분은 창고가 머리의 것이다. */
  const pickItem = (index: number, text: string) => {
    const item = itemOf(text);
    const patch: MoveLineValues = { item: text };
    if (item && item.code !== codeOf(lines[index].item)) {
      patch.lot = "";
      patch.unit = "";
      if (!fixed) patch.warehouse = item.defaultIn;
    }
    setLine(index, patch);
  };

  /** 머리의 창고를 바꾸면 줄의 LOT 를 비운다 — LOT 는 그 창고의 것에서 고르기 때문이다. */
  const changeHead = (patch: Partial<MoveHeader>) => {
    const next = { ...head, ...patch };
    onHead(next);
    if (patch.warehouse !== undefined && patch.warehouse !== head.warehouse) {
      setLines((ls) => ls.map((l) => ({ ...l, lot: "" })));
      for (const l of lines) ensureHand({ ...l, warehouse: next.warehouse });
    }
    setErrors((e) => ({ ...e, lines: {} }));
  };

  /**
   * 현재고 표에서 고른 품목 · LOT 를 줄로 넣는다 — 품목이 빈 줄은 걷고 그 뒤에 붙인다. 수량은 비워 둔다. 줄은 100줄까지라 남은 자리만큼만 넣고,
   * 넣은 것을 돌려준다 — 현재고 표는 넣지 못한 것을 고른 채로 두고 까닭을 보인다.
   */
  const pickStock = (rows: WarehouseStockRow[]): WarehouseStockRow[] => {
    const filled = lines.filter((l) => (l.item ?? "").trim() !== "");
    const accepted = rows.slice(0, Math.max(0, MOVE_MAX_LINES - filled.length));
    if (accepted.length === 0) return accepted;
    const picked: MoveLineValues[] = accepted.map((r) => ({
      ...blankLine(),
      item: `${r.itemCode} ${r.itemName}`,
      lot: r.lot,
    }));
    for (const l of picked) ensureHand(effective(l));
    setLines([...filled, ...picked]);
    setErrors((e) => ({ ...e, lines: {} }));
    return accepted;
  };

  const addLine = () => setLines((ls) => (ls.length >= MOVE_MAX_LINES ? ls : [...ls, blankLine()]));
  const removeLine = (index: number) => {
    setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((_, i) => i !== index)));
    setErrors((e) => ({ ...e, lines: {} }));
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => formAction(form));
  }

  const header = errors.header;
  const lineErrorCount = Object.keys(errors.lines).length;
  const failed = rejected && (rejected.formError || Object.keys(header).length || lineErrorCount);
  const isXfer = moveType === "XFER";
  const isAdj = moveType === "ADJ";
  // 기타출고 · 재고이동은 불량창고에서 내보내지 못한다(ADR 0015). 재고조정은 불량창고 안의 조정도 받는다.
  const fromChoices = options.warehouses.filter((w) => isAdj || !w.isDefect);
  const toChoices = options.warehouses.filter((w) => w.code !== head.warehouse);
  const inLines = new Set(lines.map((l) => `${codeOf(l.item)}|${l.lot ?? ""}`));

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6">
      {failed && (
        <div role="alert" className="mb-6 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
          <p className="font-semibold">저장하지 않았습니다 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않습니다.</p>
          {rejected.formError && <p className="mt-1 text-sm">{rejected.formError}</p>}
          {lineErrorCount > 0 && (
            <p className="mt-1 text-sm">틀린 줄 {lineErrorCount}개 — 줄 아래의 까닭을 보고 고치세요.</p>
          )}
        </div>
      )}

      <div className="grid max-w-3xl gap-8">
        <Section title="전표">
          {/* 수불구분은 메뉴가 정한다 — 서버는 다른 값도 지금처럼 같은 규칙으로 본다(설계 ③). */}
          <input type="hidden" name="moveType" value={moveType} />
          {header.moveType && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {header.moveType}
            </p>
          )}
          <div className="sm:max-w-48">
            <Field field="moveDate" label="수불일자" error={header.moveDate} hint="오늘이나 지난 날">
              <input
                id="f-moveDate"
                name="moveDate"
                type="date"
                defaultValue={rejected?.values.moveDate ?? today}
                max={today}
                aria-invalid={!!header.moveDate || undefined}
                className={inputClass(!!header.moveDate)}
              />
            </Field>
          </div>
          {fixed && (
            <div className="grid gap-5 sm:grid-cols-2">
              <HeadWarehouse
                id="f-warehouse"
                label={isXfer ? "출고창고" : "창고"}
                hint={isXfer ? "이 창고의 현재고에서 골라 옮깁니다" : "이 창고의 현재고에서 골라 넣습니다"}
                value={head.warehouse}
                choices={fromChoices}
                onChange={(warehouse) => changeHead({ warehouse })}
              />
              {isXfer && (
                <HeadWarehouse
                  id="f-toWarehouse"
                  label="입고창고"
                  hint="모든 줄이 이 창고로 갑니다"
                  value={head.toWarehouse}
                  choices={toChoices}
                  onChange={(toWarehouse) => changeHead({ toWarehouse })}
                />
              )}
            </div>
          )}
          {isAdj && (
            <Field field="reason" label="조정사유" error={header.reason} hint="조정은 꼭 고릅니다">
              <select
                id="f-reason"
                name="reason"
                defaultValue={rejected?.values.reason ?? ""}
                aria-invalid={!!header.reason || undefined}
                className={`${inputClass(!!header.reason)} sm:max-w-64`}
              >
                <option value="">사유를 고르세요</option>
                {options.reasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field field="note" label="비고" error={header.note} hint={`${MOVE_NOTE_MAX}자까지 — 비워도 됩니다`}>
            <input
              id="f-note"
              name="note"
              defaultValue={rejected?.values.note ?? ""}
              maxLength={MOVE_NOTE_MAX}
              autoComplete="off"
              aria-invalid={!!header.note || undefined}
              className={inputClass(!!header.note)}
            />
          </Field>
        </Section>
      </div>

      {fixed && (
        <StockPanel
          warehouse={options.warehouses.find((w) => w.code === head.warehouse)}
          inLines={inLines}
          onPick={pickStock}
        />
      )}

      <section className="mt-8 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t-2 border-machine pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">줄</h2>
            <p className="text-sm text-muted">
              품목은 코드나 이름으로 찾아 고릅니다. 단위를 비우면 품목 단위이고, 기준이 같은 단위로 넣으면 품목 단위로
              바꿔 쌓습니다 (예: KG 품목에 500 G → 0.5 KG). {MOVE_MAX_LINES}줄까지.
            </p>
          </div>
        </div>
        <datalist id="move-items">
          {options.items.map((i) => (
            <option key={i.code} value={`${i.code} ${i.name}`} />
          ))}
        </datalist>
        <div className="relative overflow-x-auto border border-rule bg-white">
          <table className={`w-full ${fixed ? "min-w-[44rem]" : "min-w-[56rem]"} border-collapse text-left text-sm`}>
            <caption className="sr-only">수불 줄</caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-10 px-2 py-2 text-right">
                  #
                </th>
                <th scope="col" className="min-w-56 px-2 py-2">
                  품목
                </th>
                {!fixed && (
                  <th scope="col" className="min-w-44 px-2 py-2">
                    창고
                  </th>
                )}
                <th scope="col" className="min-w-48 px-2 py-2">
                  LOT번호
                </th>
                <th scope="col" className="w-32 px-2 py-2">
                  수량{isAdj ? " (+ · −)" : ""}
                </th>
                <th scope="col" className="w-32 px-2 py-2">
                  단위
                </th>
                <th scope="col" className="w-16 px-2 py-2">
                  <span className="sr-only">줄 지우기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((raw, index) => {
                const line = effective(raw);
                const item = itemOf(line.item);
                return (
                  <LineRow
                    key={index}
                    index={index}
                    line={line}
                    fixed={fixed}
                    errors={errors.lines[index]}
                    moveType={moveType}
                    item={item}
                    options={options}
                    hand={item && line.warehouse ? hand[handKey(item.code, line.warehouse)] : undefined}
                    onChange={(patch) => setLine(index, patch)}
                    onPickItem={(text) => pickItem(index, text)}
                    onRemove={() => removeLine(index)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <button
            type="button"
            onClick={addLine}
            disabled={lines.length >= MOVE_MAX_LINES}
            className="rounded border border-machine bg-white px-4 py-2 font-semibold hover:bg-floor disabled:opacity-60"
          >
            줄 더하기
          </button>
          <span className="ml-3 text-sm text-muted">{lines.length}줄</span>
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-machine px-6 py-2.5 font-semibold text-white hover:bg-machine-deep disabled:opacity-60"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

function LineRow({
  index,
  line,
  fixed,
  errors,
  moveType,
  item,
  options,
  hand,
  onChange,
  onPickItem,
  onRemove,
}: {
  index: number;
  line: MoveLineValues;
  /** 창고를 머리에서 고르는가 — 그러면 창고 칸 대신 머리의 창고를 숨은 값으로 보낸다. */
  fixed: boolean;
  errors?: MoveLineErrors;
  moveType: MoveType;
  item?: MoveItemOption;
  options: MoveFormOptions;
  hand: OnHand[] | "loading" | null | undefined;
  onChange: (patch: MoveLineValues) => void;
  onPickItem: (text: string) => void;
  onRemove: () => void;
}) {
  const name = (field: string) => `lines.${index}.${field}`;
  const n = index + 1;
  const e = errors ?? {};
  const cell = (invalid: boolean) => `${inputClass(invalid)} px-2 py-1.5`;
  const itemUnit = options.units.find((u) => u.code === item?.unit);
  const sameBase = options.units.filter((u) => itemUnit && u.baseUnit === itemUnit.baseUnit);
  const isReducing = reduces(moveType, line.qty);
  const lots = Array.isArray(hand) ? hand : [];
  const total = lots.reduce((s, l) => s + Number(l.qty.replaceAll(",", "")), 0);

  let lotCell: ReactNode;
  if (!item) lotCell = <span className="text-muted">품목을 먼저 고르세요</span>;
  else if (!item.lotManaged)
    lotCell = (
      <span className="text-muted">
        LOT 관리 안 함
        {isReducing && line.warehouse && Array.isArray(hand) && (
          <span className="block text-xs">
            가용 {lots[0]?.qty ?? "0"} {item.unit}
          </span>
        )}
      </span>
    );
  else if (moveType === "OUT" || moveType === "XFER")
    lotCell = (
      <select
        name={name("lot")}
        aria-label={`줄 ${n} LOT번호`}
        value={line.lot}
        onChange={(ev) => onChange({ lot: ev.target.value })}
        aria-invalid={!!e.lot || undefined}
        className={cell(!!e.lot)}
      >
        <option value="">
          {!line.warehouse
            ? "창고를 먼저 고르세요"
            : hand === "loading"
              ? "불러오는 중…"
              : lots.length
                ? "LOT 를 고르세요"
                : "가용 재고 없음"}
        </option>
        {lots.map((l) => (
          <option key={l.lot} value={l.lot}>
            {l.lot} · 가용 {l.qty} {item.unit}
          </option>
        ))}
      </select>
    );
  else
    lotCell = (
      <>
        <input
          name={name("lot")}
          aria-label={`줄 ${n} LOT번호`}
          value={line.lot}
          onChange={(ev) => onChange({ lot: ev.target.value })}
          maxLength={30}
          autoComplete="off"
          list={moveType === "ADJ" && lots.length ? `lots-${index}` : undefined}
          placeholder={isMadeType(item.itemType) && !isReducing ? "비우면 번호 규칙으로" : "거래처 LOT"}
          aria-invalid={!!e.lot || undefined}
          className={cell(!!e.lot)}
        />
        {moveType === "ADJ" && lots.length > 0 && (
          <datalist id={`lots-${index}`}>
            {lots.map((l) => (
              <option key={l.lot} value={l.lot}>{`가용 ${l.qty} ${item.unit}`}</option>
            ))}
          </datalist>
        )}
      </>
    );

  const warehouseSelect = (field: "warehouse" | "toWarehouse", label: string) => (
    <select
      name={name(field)}
      aria-label={`줄 ${n} ${label}`}
      value={line[field] ?? ""}
      onChange={(ev) =>
        onChange(field === "warehouse" ? { warehouse: ev.target.value, lot: "" } : { [field]: ev.target.value })
      }
      aria-invalid={!!e[field] || undefined}
      className={cell(!!e[field])}
    >
      <option value="">고르세요</option>
      {options.warehouses.map((w) => (
        <option key={w.code} value={w.code}>
          {w.code} {w.name}
          {w.isDefect ? " (불량)" : ""}
        </option>
      ))}
    </select>
  );

  const message = (field: keyof MoveLineErrors) =>
    e[field] ? <p className="mt-1 text-xs font-semibold text-red-700">{e[field]}</p> : null;

  return (
    <>
      <tr className={`border-b border-rule align-top ${errors ? "bg-red-50" : ""}`}>
        <td className="px-2 py-2 text-right font-mono text-muted">{n}</td>
        <td className="px-2 py-2">
          <input
            name={name("item")}
            aria-label={`줄 ${n} 품목`}
            list="move-items"
            value={line.item ?? ""}
            onChange={(ev) => onPickItem(ev.target.value)}
            autoComplete="off"
            placeholder="코드 · 이름"
            aria-invalid={!!e.item || undefined}
            className={cell(!!e.item)}
          />
          {message("item")}
          {fixed && (
            <>
              <input type="hidden" name={name("warehouse")} value={line.warehouse ?? ""} />
              <input type="hidden" name={name("toWarehouse")} value={line.toWarehouse ?? ""} />
            </>
          )}
        </td>
        {!fixed && (
          <td className="px-2 py-2">
            {warehouseSelect("warehouse", "창고")}
            {message("warehouse")}
          </td>
        )}
        <td className="px-2 py-2">
          {lotCell}
          {message("lot")}
        </td>
        <td className="px-2 py-2">
          <input
            name={name("qty")}
            aria-label={`줄 ${n} 수량`}
            value={line.qty ?? ""}
            onChange={(ev) => onChange({ qty: ev.target.value })}
            inputMode="decimal"
            autoComplete="off"
            placeholder={moveType === "ADJ" ? "+10 · −10" : undefined}
            aria-invalid={!!e.qty || undefined}
            className={`${cell(!!e.qty)} text-right`}
          />
          {message("qty")}
          {isReducing && item?.lotManaged && line.lot && lots.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              가용 {lots.find((l) => l.lot === line.lot)?.qty ?? "0"} {item.unit}
            </p>
          )}
          {isReducing && item?.lotManaged && !line.lot && lots.length > 1 && (
            <p className="mt-1 text-xs text-muted">
              LOT 합 {total.toLocaleString("ko-KR")} {item.unit}
            </p>
          )}
        </td>
        <td className="px-2 py-2">
          <select
            name={name("unit")}
            aria-label={`줄 ${n} 단위`}
            value={line.unit ?? ""}
            onChange={(ev) => onChange({ unit: ev.target.value })}
            aria-invalid={!!e.unit || undefined}
            className={cell(!!e.unit)}
          >
            <option value="">{item ? `${item.unit} (품목)` : "품목 단위"}</option>
            {sameBase
              .filter((u) => u.code !== item?.unit)
              .map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} {u.name}
                </option>
              ))}
          </select>
          {message("unit")}
        </td>
        <td className="px-2 py-2">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`줄 ${n} 지우기`}
            className="rounded px-2 py-1.5 text-muted underline underline-offset-4 hover:text-ink"
          >
            지우기
          </button>
        </td>
      </tr>
      {(e.row || (fixed && (e.warehouse || e.toWarehouse))) && (
        <tr className="border-b border-rule bg-red-50">
          <td />
          <td colSpan={fixed ? 5 : 6} className="px-2 pb-2 text-sm font-semibold text-red-700" role="status">
            {[e.row, fixed && e.warehouse, fixed && e.toWarehouse]
              .filter(Boolean)
              .map((m) => `줄 ${n} — ${m}`)
              .join(" · ")}
          </td>
        </tr>
      )}
    </>
  );
}

function HeadWarehouse({
  id,
  label,
  hint,
  value,
  choices,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  choices: MoveWarehouseOption[];
  onChange: (code: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label} <span className="text-sm font-normal text-muted">{hint}</span>
      </label>
      <select
        id={id}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className={`${inputClass(false)} mt-1`}
      >
        <option value="">창고를 고르세요</option>
        {choices.map((w) => (
          <option key={w.code} value={w.code}>
            {w.code} {w.name}
            {w.isDefect ? " (불량)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
