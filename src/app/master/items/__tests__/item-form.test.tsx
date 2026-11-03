import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UnitOption } from "@/db/items";
import type { ItemFormState } from "../actions";
import { ItemForm } from "../item-form";

vi.mock("../actions", () => ({}));

const units: UnitOption[] = [
  { code: "EA", name: "개", active: true },
  { code: "KG", name: "킬로그램", active: true },
];
const blank = { name: "", spec: "", unit: "", leadTimeDays: "0", safetyStock: "0", minLot: "0", lotMultiple: "0" };
const preview = { RM: "RM-0007", SF: "SF-0003", FG: "FG-0003" } as const;

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("품목 등록 화면", () => {
  it("유형을 고르면 조달구분 · 검사 대상의 기본값과 붙을 코드가 보인다", () => {
    render(<ItemForm mode="create" action={vi.fn()} units={units} initial={blank} previewCodes={preview} />);
    expect(screen.getByText(/유형을 고르면 코드/)).toBeInTheDocument();

    fireEvent.click(radio("완제품"));
    expect(radio("생산").checked).toBe(true);
    expect(box("수입검사 대상").checked).toBe(false);
    expect(box("출하검사 대상").checked).toBe(true);
    expect(screen.getByText(/지금 저장하면 FG-0003/)).toBeInTheDocument();
    expect(screen.getByLabelText(/최소 생산량/)).toBeInTheDocument();

    fireEvent.click(radio("원자재"));
    expect(radio("구매").checked).toBe(true);
    expect(box("수입검사 대상").checked).toBe(true);
    expect(box("출하검사 대상").checked).toBe(false);
    expect(screen.getByLabelText(/최소 발주량/)).toBeInTheDocument();
  });

  it("기본값을 바꿀 수 있다 — 원자재를 생산으로, 수입검사를 끔", () => {
    render(<ItemForm mode="create" action={vi.fn()} units={units} initial={blank} previewCodes={preview} />);
    fireEvent.click(radio("원자재"));
    fireEvent.click(radio("생산"));
    fireEvent.click(box("수입검사 대상"));
    expect(radio("생산").checked).toBe(true);
    expect(box("수입검사 대상").checked).toBe(false);
  });

  it("저장하면 칸의 값을 서버로 보내고, 거절되면 칸마다 까닭을 보이며 넣은 값을 남긴다", async () => {
    const rejected: ItemFormState = {
      ok: false,
      errors: { unit: "단위를 고르세요", name: "품명을 넣으세요" },
      values: { itemType: "SF", procurement: "MAKE", name: "", spec: "몰딩 전", unit: "", leadTimeDays: "2" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<ItemForm mode="create" action={action} units={units} initial={blank} previewCodes={preview} />);
    fireEvent.click(radio("반제품"));
    fireEvent.change(screen.getByLabelText(/규격/), { target: { value: "몰딩 전" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });

    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("itemType")).toBe("SF");
    expect(sent.get("procurement")).toBe("MAKE");
    expect(sent.get("spec")).toBe("몰딩 전");
    expect(sent.get("inspectIn")).toBeNull();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("저장하지 않았습니다."));
    // 칸 순서대로 — 품명이 단위보다 앞
    expect(screen.getByRole("alert")).toHaveTextContent(/품명 — 품명을 넣으세요.*단위 — 단위를 고르세요/);
    expect(screen.getByLabelText(/품명/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/품명/)).toHaveAccessibleDescription("품명을 넣으세요");
    expect(screen.getByLabelText(/규격/)).toHaveValue("몰딩 전");
    expect(screen.getByLabelText(/리드타임/)).toHaveValue("2");
    expect(radio("반제품").checked).toBe(true);
  });

  it("서버가 저장 자체를 못 하면 그 까닭을 보인다", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: false, errors: {}, formError: "저장하지 못했습니다", values: blank });
    render(<ItemForm mode="create" action={action} units={units} initial={blank} previewCodes={preview} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했습니다"));
  });
});

describe("품목 수정 화면", () => {
  const initial = { ...blank, procurement: "BUY", name: "다이 접착제", unit: "G", inspectIn: "on", active: "Y" };
  const withInactive: UnitOption[] = [...units, { code: "G", name: "그램", active: false }];

  it("코드 · 유형은 보이기만 하고 보내지 않는다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <ItemForm mode="edit" code="RM-0005" itemType="RM" action={action} units={withInactive} initial={initial} />,
    );
    expect(screen.getByText("RM-0005")).toBeInTheDocument();
    expect(screen.getByText("원자재")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "원자재" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("itemType")).toBe(false);
    expect(sent.has("code")).toBe(false);
    expect(sent.get("active")).toBe("Y");
    expect(sent.get("unit")).toBe("G");
  });

  it("「사용 안 함」 단위는 그 표시와 함께 고른 채로 보인다", () => {
    render(
      <ItemForm mode="edit" code="RM-0005" itemType="RM" action={vi.fn()} units={withInactive} initial={initial} />,
    );
    expect(screen.getByLabelText("단위")).toHaveDisplayValue("G — 그램 (사용 안 함)");
  });

  it("사용 여부를 「사용 안 함」으로 바꾼다", () => {
    render(
      <ItemForm mode="edit" code="RM-0005" itemType="RM" action={vi.fn()} units={withInactive} initial={initial} />,
    );
    expect(radio("사용").checked).toBe(true);
    fireEvent.click(radio("사용 안 함"));
    expect(radio("사용 안 함").checked).toBe(true);
  });
});
