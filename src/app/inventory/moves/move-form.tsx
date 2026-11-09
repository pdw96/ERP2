"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Choice, Field, inputClass, Section } from "@/components/form-parts";
import type { MoveFormOptions, MoveItemOption, OnHand } from "@/db/stock";
import { MOVE_TYPES, isMadeType, type MoveType } from "@/lib/master-codes";
import {
  MOVE_MAX_LINES,
  MOVE_NOTE_MAX,
  type MoveErrors,
  type MoveLineErrors,
  type MoveLineValues,
} from "@/lib/move-input";
import { onHandAction, saveMoveAction, type MoveFormState } from "./actions";

// 수불 등록 화면(성공 기준 2 ~ 6 · 12) — 일자 · 유형 · 비고를 한 번 쓰고 줄을 「줄 더하기」로 한 줄씩 늘린다(설계 「2026-11-09 — PR C 를 열기 전에
// 정한 것」). 유형을 고르면 그 유형의 칸만 보인다. 품목을 고르면 기본 창고가 미리 채워지고(이동은 입고 창고 → 출고 창고), 출고 · 이동은 그 창고의
// LOT 를 가용 수량과 함께 고른다. 검사는 서버가 하고 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않는다 — 화면은 틀린 칸 · 줄과 까닭을 보인다.
// 휴대폰 폭에서는 머리 칸이 세로로 쌓이고 줄 표는 옆으로 민다.

type Props = { options: MoveFormOptions; today: string };

const blankLine = (): MoveLineValues => ({ item: "", lot: "", warehouse: "", toWarehouse: "", qty: "", unit: "" });
const codeOf = (text: string | undefined) => (text ?? "").trim().split(/\s+/)[0] ?? "";
const handKey = (item: string, warehouse: string) => `${item}|${warehouse}`;
/** 줄이는 줄인가 — 출고 · 이동, 그리고 − 를 붙인 조정. */
const reduces = (type: MoveType, qty: string | undefined) =>
  type === "OUT" || type === "XFER" || (type === "ADJ" && (qty ?? "").trim().startsWith("-"));

const TYPE_NOTE: Record<MoveType, string> = {
  IN: "창고로 들어온 것 — 구매 · 생산이 아닌 입고(기초 재고 따위)",
  OUT: "창고에서 나간 것 — 판매 · 생산 투입이 아닌 출고(소모 · 견본 따위)",
  XFER: "보내는 창고에서 받는 창고로 옮긴 것 — 재고의 합은 그대로",
  ADJ: "장부를 실물에 맞춘 것 — 늘리면 +, 줄이면 − 를 붙입니다",
};

export function MoveForm({ options, today }: Props) {
  const [state, formAction, pending] = useActionState<MoveFormState, FormData>(saveMoveAction, null);
  const [moveType, setMoveType] = useState<MoveType>((state?.values.moveType as MoveType) ?? "IN");
  const [lines, setLines] = useState<MoveLineValues[]>(() => [blankLine()]);
  const [errors, setErrors] = useState<MoveErrors>({ header: {}, lines: {} });
  const [hand, setHand] = useState<Record<string, OnHand[] | "loading" | null>>({});

  // 서버가 거절하면 까닭을 받아 칸 옆에 보인다 — 칸의 값은 화면이 쥐고 있어 그대로 남는다(받은 결과가 바뀔 때 한 번).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setErrors(state?.errors ?? { header: {}, lines: {} });
  }

  const itemOf = (text: string | undefined): MoveItemOption | undefined =>
    options.items.find((i) => i.code === codeOf(text));

  // 그 품목 · 창고의 가용 재고를 한 번 읽어 둔다 — 출고 · 이동의 LOT 고르기와 가용 수량, 조정의 LOT 제안.
  const asked = useRef(new Set<string>());
  const ensureHand = (line: MoveLineValues, type: MoveType = moveType) => {
    const item = itemOf(line.item);
    if (!item || !line.warehouse || type === "IN") return;
    const key = handKey(item.code, line.warehouse);
    if (asked.current.has(key)) return;
    asked.current.add(key);
    setHand((h) => ({ ...h, [key]: "loading" }));
    onHandAction(item.code, line.warehouse).then((rows) => setHand((h) => ({ ...h, [key]: rows })));
  };

  const setLine = (index: number, patch: MoveLineValues) => {
    ensureHand({ ...lines[index], ...patch });
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setErrors((e) => {
      if (!e.lines[index]) return e;
      const next = { ...e.lines };
      delete next[index];
      return { ...e, lines: next };
    });
  };

  /** 품목을 고르면 기본 창고를 채운다 — 입고 · 조정은 입고 창고, 출고는 출고 창고, 이동은 입고 창고 → 출고 창고(같으면 받는 쪽은 비움). */
  const pickItem = (index: number, text: string) => {
    const item = itemOf(text);
    const patch: MoveLineValues = { item: text };
    if (item && item.code !== codeOf(lines[index].item)) {
      patch.lot = "";
      patch.unit = "";
      if (moveType === "OUT") patch.warehouse = item.defaultOut;
      else if (moveType === "XFER") {
        patch.warehouse = item.defaultIn;
        patch.toWarehouse = item.defaultOut !== item.defaultIn ? item.defaultOut : "";
      } else patch.warehouse = item.defaultIn;
    }
    setLine(index, patch);
  };

  const changeType = (type: MoveType) => {
    setMoveType(type);
    for (const l of lines) ensureHand(l, type);
    setLines((ls) => ls.map((l) => ({ ...l, toWarehouse: type === "XFER" ? l.toWarehouse : "", lot: "" })));
    setErrors({ header: {}, lines: {} });
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
  const failed = state && (state.formError || Object.keys(header).length || lineErrorCount);
  const isXfer = moveType === "XFER";
  const isAdj = moveType === "ADJ";

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="mt-6">
      {failed && (
        <div role="alert" className="mb-6 max-w-3xl border-l-4 border-red-700 bg-white px-5 py-4">
          <p className="font-semibold">저장하지 않았습니다 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않습니다.</p>
          {state.formError && <p className="mt-1 text-sm">{state.formError}</p>}
          {lineErrorCount > 0 && (
            <p className="mt-1 text-sm">틀린 줄 {lineErrorCount}개 — 줄 아래의 까닭을 보고 고치세요.</p>
          )}
        </div>
      )}

      <div className="grid max-w-3xl gap-8">
        <Section title="전표">
          <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
            <Field field="moveDate" label="일자" error={header.moveDate} hint="오늘이나 지난 날">
              <input
                id="f-moveDate"
                name="moveDate"
                type="date"
                defaultValue={state?.values.moveDate ?? today}
                max={today}
                aria-invalid={!!header.moveDate || undefined}
                className={inputClass(!!header.moveDate)}
              />
            </Field>
            <Field field="moveType" label="유형" error={header.moveType} as="fieldset">
              <div className="flex flex-wrap gap-2">
                {MOVE_TYPES.map((t) => (
                  <Choice
                    key={t.code}
                    name="moveType"
                    value={t.code}
                    checked={moveType === t.code}
                    onChange={() => changeType(t.code)}
                  >
                    {t.name}
                  </Choice>
                ))}
              </div>
              <p className="mt-1 text-sm text-muted">{TYPE_NOTE[moveType]}</p>
            </Field>
          </div>
          {isAdj && (
            <Field field="reason" label="사유" error={header.reason} hint="조정은 꼭 고릅니다">
              <select
                id="f-reason"
                name="reason"
                defaultValue={state?.values.reason ?? ""}
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
              defaultValue={state?.values.note ?? ""}
              maxLength={MOVE_NOTE_MAX}
              autoComplete="off"
              aria-invalid={!!header.note || undefined}
              className={inputClass(!!header.note)}
            />
          </Field>
        </Section>
      </div>

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
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <caption className="sr-only">수불 줄</caption>
            <thead className="border-b-2 border-machine">
              <tr>
                <th scope="col" className="w-10 px-2 py-2 text-right">
                  #
                </th>
                <th scope="col" className="min-w-56 px-2 py-2">
                  품목
                </th>
                <th scope="col" className="min-w-44 px-2 py-2">
                  {isXfer ? "보내는 창고" : "창고"}
                </th>
                {isXfer && (
                  <th scope="col" className="min-w-44 px-2 py-2">
                    받는 창고
                  </th>
                )}
                <th scope="col" className="min-w-48 px-2 py-2">
                  LOT
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
              {lines.map((line, index) => (
                <LineRow
                  key={index}
                  index={index}
                  line={line}
                  errors={errors.lines[index]}
                  moveType={moveType}
                  item={itemOf(line.item)}
                  options={options}
                  hand={(() => {
                    const item = itemOf(line.item);
                    return item && line.warehouse ? hand[handKey(item.code, line.warehouse)] : undefined;
                  })()}
                  onChange={(patch) => setLine(index, patch)}
                  onPickItem={(text) => pickItem(index, text)}
                  onRemove={() => removeLine(index)}
                />
              ))}
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
        <Link href="/inventory/moves" className="px-3 py-2.5 text-muted underline underline-offset-4 hover:text-ink">
          취소
        </Link>
      </div>
    </form>
  );
}

function LineRow({
  index,
  line,
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
  const isXfer = moveType === "XFER";
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
        aria-label={`줄 ${n} LOT`}
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
          aria-label={`줄 ${n} LOT`}
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
        </td>
        <td className="px-2 py-2">
          {warehouseSelect("warehouse", isXfer ? "보내는 창고" : "창고")}
          {message("warehouse")}
        </td>
        {isXfer && (
          <td className="px-2 py-2">
            {warehouseSelect("toWarehouse", "받는 창고")}
            {message("toWarehouse")}
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
      {e.row && (
        <tr className="border-b border-rule bg-red-50">
          <td />
          <td colSpan={isXfer ? 7 : 6} className="px-2 pb-2 text-sm font-semibold text-red-700" role="status">
            줄 {n} — {e.row}
          </td>
        </tr>
      )}
    </>
  );
}
