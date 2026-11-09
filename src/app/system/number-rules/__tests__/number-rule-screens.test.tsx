import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NumberRule } from "@/db/number-rules";
import type { NumberRuleFormState } from "../actions";
import { NumberRuleTable } from "../number-rule-list";
import { NumberRuleForm } from "../number-rule-form";

vi.mock("../actions", () => ({}));

// 시스템 관리 › 번호 규칙(조각 「재고 수불」 PR B, 성공 기준 10 · ADR 0016) — 목록과 등록 · 수정 화면.

const rule = (over: Partial<NumberRule>): NumberRule => ({
  id: 1,
  code: "LOT_FG",
  name: "완제품 LOT",
  prefix: "FG",
  separator: "-",
  dateFormat: "YYMMDD",
  seqDigits: 3,
  defaultFor: "FG",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const blank = { code: "", name: "", prefix: "", separator: "-", dateFormat: "YYMMDD", seqDigits: "3", defaultFor: "" };
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const example = () => screen.getByRole("status").textContent;

describe("번호 규칙 목록", () => {
  it("꼴과 오늘의 첫 번호, 기본으로 쓰는 유형을 보인다 — 코드는 수정 화면 링크", () => {
    render(
      <NumberRuleTable
        rules={[
          rule({}),
          rule({ id: 2, code: "LOT_NUM", name: "숫자형 LOT", prefix: "", separator: "", defaultFor: null }),
          rule({ id: 3, code: "LOT_OLD", name: "옛 규칙", defaultFor: null, active: false }),
        ]}
        today="2026-11-06"
      />,
    );
    const cells = (i: number) =>
      within(screen.getAllByRole("row")[i])
        .getAllByRole("cell")
        .map((td) => td.textContent);
    expect(cells(1)).toEqual([
      "LOT_FG",
      "완제품 LOT",
      "FG",
      "붙임표 -",
      "YYMMDD",
      "3자리",
      "FG-261106-001",
      "완제품의 기본",
    ]);
    expect(cells(2)).toEqual(["LOT_NUM", "숫자형 LOT", "없음", "없음", "YYMMDD", "3자리", "261106001", ""]);
    expect(cells(3)[1]).toBe("옛 규칙사용 안 함");
    expect(screen.getByRole("link", { name: "LOT_FG" })).toHaveAttribute("href", "/system/number-rules/LOT_FG");
    expect(screen.getByText(/3개 · 번호의 예는 오늘\(2026-11-06\) 첫 번호입니다/)).toBeInTheDocument();
  });

  it("넓은 표는 옆으로 민다(휴대폰 폭)", () => {
    render(<NumberRuleTable rules={[rule({})]} today="2026-11-06" />);
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
  });
});

describe("번호 규칙 등록 화면", () => {
  it("칸을 바꾸면 오늘의 첫 번호가 바로 바뀐다 — 머리 · 날짜 꼴이 없으면 그 조각과 구분자가 빠진다", () => {
    render(<NumberRuleForm mode="create" action={vi.fn()} initial={blank} today="2026-11-06" />);
    expect(example()).toContain("261106-001");
    fireEvent.change(screen.getByLabelText(/머리/), { target: { value: "FG" } });
    expect(example()).toContain("FG-261106-001");
    fireEvent.click(radio("밑줄 _"));
    expect(example()).toContain("FG_261106_001");
    fireEvent.click(radio("YYMM"));
    expect(screen.getByText(/일련은 매달 1 부터/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/일련 자릿수/), { target: { value: "5" } });
    expect(example()).toContain("FG_2611_00001");
    fireEvent.change(screen.getByLabelText(/머리/), { target: { value: "" } });
    fireEvent.click(within(screen.getByRole("group", { name: /구분자/ })).getByRole("radio", { name: "없음" }));
    expect(example()).toContain("261100001");
  });

  it("저장하면 칸을 보내고(「없음」은 NONE), 거절되면 까닭을 보이며 넣은 값을 남긴다", async () => {
    const rejected: NumberRuleFormState = {
      ok: false,
      errors: { code: "같은 코드의 규칙이 있습니다 — 다른 코드를 넣으세요" },
      values: { ...blank, code: "LOT_FG", name: "겹침", separator: "NONE", defaultFor: "FG" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<NumberRuleForm mode="create" action={action} initial={blank} today="2026-11-06" />);
    fireEvent.change(screen.getByLabelText(/코드/), { target: { value: "LOT_FG" } });
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: "겹침" } });
    const separators = within(screen.getByRole("group", { name: /구분자/ }));
    fireEvent.click(separators.getByRole("radio", { name: "없음" }));
    fireEvent.click(radio("완제품"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const sent = action.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(sent)).toMatchObject({
      code: "LOT_FG",
      name: "겹침",
      separator: "NONE",
      dateFormat: "YYMMDD",
      seqDigits: "3",
      defaultFor: "FG",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("같은 코드의 규칙이 있습니다");
    expect(screen.getByLabelText(/코드/)).toHaveValue("LOT_FG");
    expect(radio("완제품").checked).toBe(true);
  });
});

describe("번호 규칙 수정 화면", () => {
  it("코드는 보이기만 하고, 유형의 기본 규칙이면 기본을 고르는 칸 대신 그 까닭을 보인다", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(
      <NumberRuleForm
        mode="edit"
        code="LOT_FG"
        version="1"
        defaultFor="FG"
        action={action}
        today="2026-11-06"
        initial={{
          name: "완제품 LOT",
          prefix: "FG",
          separator: "-",
          dateFormat: "YYMMDD",
          seqDigits: "3",
          defaultFor: "FG",
          active: "Y",
        }}
      />,
    );
    expect(screen.queryByRole("textbox", { name: /코드/ })).toBeNull();
    expect(screen.getByText(/완제품의 기본 규칙입니다/)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "반제품" })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "저장" })));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("defaultFor")).toBe("FG");
    expect(sent.get("version")).toBe("1");
    expect(sent.get("active")).toBe("Y");
  });

  it("기본이 아닌 규칙은 기본으로 쓰는 유형을 고를 수 있다", () => {
    render(
      <NumberRuleForm
        mode="edit"
        code="LOT_NUM"
        version="1"
        defaultFor={null}
        action={vi.fn()}
        today="2026-11-06"
        initial={{
          name: "숫자형 LOT",
          prefix: "",
          separator: "",
          dateFormat: "YYMMDD",
          seqDigits: "3",
          defaultFor: "",
          active: "Y",
        }}
      />,
    );
    expect(example()).toContain("261106001");
    expect(radio("반제품")).toBeInTheDocument();
    expect(radio("완제품")).toBeInTheDocument();
  });
});
