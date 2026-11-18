import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClsOption, DefectTypeRow } from "@/db/defect-types";
import type { ProcessOption } from "@/db/processes";
import type { DefectTypeFormState } from "../actions";
import { DefectTypeForm } from "../defect-type-form";
import { DefectTypeList, DefectTypeSearch, SavedNotice } from "../defect-type-list";

vi.mock("../actions", () => ({}));
vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const P = (code: string, active = true) => ({ code, name: `${code} 공정`, active });
const dt = (over: Partial<DefectTypeRow>): DefectTypeRow => ({
  id: 1,
  code: "CHIP",
  name: "칩핑",
  clsGroup: "DEFECT_CLS",
  cls: "APPEAR",
  clsName: "외관",
  processes: [P("SAW")],
  note: "",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const SAMPLE: [string, string, string, string, string[]][] = [
  ["CHIP", "칩핑", "APPEAR", "외관", ["SAW"]],
  ["CRACK", "다이 크랙", "APPEAR", "외관", ["BG", "DA", "SAW"]],
  ["SCRATCH", "긁힘", "APPEAR", "외관", []],
  ["FM", "이물", "APPEAR", "외관", []],
  ["THK-OUT", "두께 벗어남", "DIM", "치수", ["BG"]],
  ["DA-VOID", "접착 보이드", "BOND", "접합", ["DA"]],
  ["DA-TILT", "다이 기울어짐", "DIM", "치수", ["DA"]],
  ["WIRE-BRK", "와이어 끊어짐", "BOND", "접합", ["WB"]],
  ["BALL-LIFT", "볼 들뜸", "BOND", "접합", ["WB"]],
  ["WIRE-SWP", "와이어 휨", "DIM", "치수", ["MD", "WB"]],
  ["MD-VOID", "몰드 기포", "APPEAR", "외관", ["MD"]],
  ["MK-ERR", "마킹 불량", "APPEAR", "외관", ["MK"]],
  ["OPEN", "오픈", "ELEC", "전기 특성", ["FT"]],
  ["SHORT", "쇼트", "ELEC", "전기 특성", ["FT"]],
];
const sampleRows = SAMPLE.map(([code, name, cls, clsName, ps], i) =>
  dt({ id: i + 1, code, name, cls, clsName, processes: ps.map((c) => P(c)) }),
);

const none = { q: "", cls: "", process: "", includeInactive: false };
const classes: ClsOption[] = [
  { code: "APPEAR", name: "외관", active: true },
  { code: "DIM", name: "치수", active: true },
  { code: "OLD", name: "옛 분류", active: false },
];
const processes: ProcessOption[] = [
  { code: "DA", name: "다이 본딩", active: true },
  { code: "MK", name: "마킹", active: false },
  { code: "WB", name: "와이어 본딩", active: true },
];
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => o.textContent);

describe("불량 유형 목록", () => {
  it("표 머리는 코드 · 불량유형명 · 대분류 · 발생 공정 · 사용 여부", () => {
    render(<DefectTypeList rows={[dt({})]} filter={none} />);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "코드",
      "불량유형명",
      "대분류",
      "발생 공정",
      "사용 여부",
    ]);
  });

  it("샘플 14 를 보이고, SCRATCH 는 「공통」, WIRE-SWP 는 「MD · WB」(공정코드 순), 코드는 수정 화면 링크", () => {
    render(<DefectTypeList rows={sampleRows} filter={none} />);
    expect(screen.getByText("14개")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(15);
    const scratch = within(screen.getByRole("link", { name: "SCRATCH" }).closest("tr")!);
    expect(scratch.getByText("공통")).toBeInTheDocument();
    expect(scratch.getByText("외관")).toBeInTheDocument();
    const swp = within(screen.getByRole("link", { name: "WIRE-SWP" }).closest("tr")!);
    expect(screen.getByRole("link", { name: "WIRE-SWP" })).toHaveAttribute("href", "/quality/defect-types/WIRE-SWP");
    expect(swp.getByText("MD · WB")).toBeInTheDocument();
    expect(swp.getByText("와이어 휨")).toBeInTheDocument();
    expect(swp.getByText("치수")).toBeInTheDocument();
    expect(swp.getByText("사용")).toBeInTheDocument();
  });

  it("발생 공정이 「사용 안 함」이면 코드 뒤에 표시가 붙는다", () => {
    render(<DefectTypeList rows={[dt({ processes: [P("MD", false), P("WB")] })]} filter={none} />);
    expect(screen.getByText("MD(사용 안 함) · WB")).toBeInTheDocument();
  });

  it("「사용 안 함」 불량 유형에는 표시가 붙는다", () => {
    render(<DefectTypeList rows={[dt({ active: false })]} filter={{ ...none, includeInactive: true }} />);
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText("1개 · 사용 안 함 포함")).toBeInTheDocument();
  });

  it("빈 목록은 그렇게 말하고, 거르는 값이 있으면 찾는 것이 없다고 말한다", () => {
    const { rerender } = render(<DefectTypeList rows={[]} filter={none} />);
    expect(screen.getByText("등록된 불량 유형이 없습니다.")).toBeInTheDocument();
    rerender(<DefectTypeList rows={[]} filter={{ ...none, cls: "DIM" }} />);
    expect(screen.getByText("찾는 불량 유형이 없습니다.")).toBeInTheDocument();
    rerender(<DefectTypeList rows={[]} filter={{ ...none, process: "WB" }} />);
    expect(screen.getByText("찾는 불량 유형이 없습니다.")).toBeInTheDocument();
  });

  it("찾기는 글자 칸 · 대분류 고르기 · 발생 공정 고르기(도움말) · 「사용 안 함 포함」", () => {
    render(
      <DefectTypeSearch
        filter={{ q: "와이어", cls: "DIM", process: "WB", includeInactive: true }}
        notices={[]}
        classes={classes}
        processes={processes}
      />,
    );
    const form = within(screen.getByRole("search", { name: "불량 유형 찾기" }));
    expect(form.getByLabelText("코드 · 불량유형명")).toHaveValue("와이어");
    const cls = form.getByLabelText("대분류") as HTMLSelectElement;
    expect(optionTexts(cls)).toEqual(["모든 대분류", "외관", "치수", "옛 분류 (사용 안 함)"]);
    expect(cls.value).toBe("DIM");
    const process = form.getByLabelText(/발생 공정/) as HTMLSelectElement;
    expect(optionTexts(process)).toEqual(["모든 공정", "DA 다이 본딩", "MK 마킹 (사용 안 함)", "WB 와이어 본딩"]);
    expect(process.value).toBe("WB");
    expect(form.getByText("그 공정에서 고를 수 있는 불량 — 공통 불량도 보입니다")).toBeInTheDocument();
    expect(form.getByLabelText("사용 안 함 포함")).toBeChecked();
    expect(form.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/quality/defect-types");
  });

  it("거르기 알림을 보인다", () => {
    render(
      <DefectTypeSearch
        filter={none}
        notices={[{ field: "cls", message: "받지 않는 대분류 값이라 거르지 않았습니다" }]}
        classes={classes}
        processes={processes}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("받지 않는 대분류 값이라 거르지 않았습니다");
  });

  it("저장한 불량 유형을 알리고, 「사용 안 함」으로 빠졌으면 다시 보는 길을 알린다", () => {
    render(<SavedNotice defectType={dt({ active: false })} shown={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("CHIP 칩핑을 저장했습니다.");
    expect(screen.getByRole("link", { name: "사용 안 함 포함" })).toHaveAttribute(
      "href",
      "/quality/defect-types?inactive=1",
    );
  });
});

describe("불량 유형 등록 화면", () => {
  it("코드 칸 · 불량유형명 · 대분류(사용 중만) · 발생 공정 체크 칸(사용 중 공정만, 도움말) · 비고가 있고, 사용 여부 칸은 없다", () => {
    render(<DefectTypeForm mode="create" action={vi.fn()} initial={{}} classes={classes} processes={processes} />);
    const code = screen.getByLabelText(/불량유형코드/);
    expect(code).toHaveAttribute("maxlength", "10");
    expect(code).toHaveAttribute("placeholder", "예: WIRE-BRK");
    expect(screen.getByLabelText(/불량유형명/)).toHaveAttribute("maxlength", "50");
    expect(optionTexts(screen.getByLabelText(/대분류/))).toEqual(["대분류를 고르세요", "외관", "치수"]);
    expect(screen.getAllByRole("checkbox").map((c) => (c as HTMLInputElement).value)).toEqual(["DA", "WB"]);
    expect(screen.getByRole("checkbox", { name: "DA 다이 본딩" })).toHaveAttribute("name", "processes");
    expect(screen.queryByText(/MK/)).toBeNull();
    expect(screen.getByText("비우면 공통 불량 — 어느 공정에서나 고릅니다")).toBeInTheDocument();
    expect(screen.getByLabelText(/비고/).tagName).toBe("TEXTAREA");
    expect(screen.queryByRole("radio", { name: "사용 안 함" })).toBeNull();
  });

  it("고를 수 있는 대분류가 없으면 공통코드에서 등록하라고 알린다", () => {
    render(
      <DefectTypeForm
        mode="create"
        action={vi.fn()}
        initial={{}}
        classes={[{ code: "OLD", name: "옛 분류", active: false }]}
        processes={processes}
      />,
    );
    expect(screen.getByText(/사용 중인 대분류가 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "「시스템 관리 › 공통코드」" })).toHaveAttribute(
      "href",
      "/system/codes/DEFECT_CLS",
    );
  });

  it("체크한 공정을 모두 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(<DefectTypeForm mode="create" action={action} initial={{}} classes={classes} processes={processes} />);
    fireEvent.change(screen.getByLabelText(/불량유형코드/), { target: { value: "WIRE-SWP" } });
    fireEvent.change(screen.getByLabelText(/불량유형명/), { target: { value: "와이어 휨" } });
    fireEvent.change(screen.getByLabelText(/대분류/), { target: { value: "DIM" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "DA 다이 본딩" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "WB 와이어 본딩" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("code")).toBe("WIRE-SWP");
    expect(sent.get("cls")).toBe("DIM");
    expect(sent.getAll("processes")).toEqual(["DA", "WB"]);
  });

  it("거절되면 요약 · 칸 옆 까닭 · 넣은 값(체크 상태 포함)을 남긴다", async () => {
    const rejected: FormState = {
      ok: false,
      errors: { code: "영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자입니다 — 예: WIRE-BRK" },
      values: { code: "wire", name: "와이어", cls: "DIM", processes: ["WB"], note: "메모" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<DefectTypeForm mode="create" action={action} initial={{}} classes={classes} processes={processes} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("불량유형코드 — 영문 대문자로 시작해"));
    expect(screen.getByLabelText(/불량유형코드/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/불량유형코드/)).toHaveValue("wire");
    expect(screen.getByLabelText(/불량유형명/)).toHaveValue("와이어");
    expect((screen.getByLabelText(/대분류/) as HTMLSelectElement).value).toBe("DIM");
    expect(screen.getByLabelText(/비고/)).toHaveValue("메모");
    expect((screen.getByRole("checkbox", { name: "WB 와이어 본딩" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "DA 다이 본딩" }) as HTMLInputElement).checked).toBe(false);
  });

  it("발생 공정을 거절하면 체크 칸 묶음 옆에 까닭을 보인다", async () => {
    const rejected: FormState = {
      ok: false,
      errors: { processes: "「사용 안 함」인 공정이 있습니다" },
      values: { code: "AB", name: "에이", cls: "DIM", processes: ["DA"] },
    };
    const { container } = render(
      <DefectTypeForm
        mode="create"
        action={vi.fn().mockResolvedValue(rejected)}
        initial={{}}
        classes={classes}
        processes={processes}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    await waitFor(() => expect(container.querySelector("#e-processes")).toHaveTextContent("「사용 안 함」인 공정"));
    expect(container.querySelector("#f-processes")).toHaveAttribute("tabindex", "-1");
  });
});

type FormState = DefectTypeFormState;

describe("불량 유형 수정 화면", () => {
  const base = { mode: "edit" as const, code: "WIRE-SWP", version: "7" };

  it("코드는 글자로만, 대분류는 사용 중 + 지금 값(사용 안 함이면 표시), 공정 체크 칸은 사용 중 + 붙은 것(사용 안 함이면 표시)", () => {
    render(
      <DefectTypeForm
        {...base}
        action={vi.fn()}
        initial={{ name: "와이어 휨", cls: "OLD", processes: ["MK", "WB"], note: "", active: "Y" }}
        classes={classes}
        processes={processes}
      />,
    );
    expect(screen.getByText("WIRE-SWP")).toBeInTheDocument();
    expect(screen.queryByLabelText(/불량유형코드/)).toBeNull();
    const cls = screen.getByLabelText(/대분류/) as HTMLSelectElement;
    expect(optionTexts(cls)).toEqual(["대분류를 고르세요", "외관", "치수", "옛 분류 (사용 안 함)"]);
    expect(cls.value).toBe("OLD");
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((c) => c.value)).toEqual(["DA", "MK", "WB"]);
    expect(boxes.map((c) => c.checked)).toEqual([false, true, true]);
    expect(screen.getByRole("checkbox", { name: "MK 마킹 (사용 안 함)" })).toBeInTheDocument();
    expect(radio("사용").checked).toBe(true);
  });

  it("사용 안 함 공정이 이미 붙어 있지 않으면 그 체크 칸은 보이지 않는다", () => {
    render(
      <DefectTypeForm
        {...base}
        action={vi.fn()}
        initial={{ name: "와이어 휨", cls: "DIM", processes: ["WB"], note: "", active: "Y" }}
        classes={classes}
        processes={processes}
      />,
    );
    expect(screen.queryByRole("checkbox", { name: /MK/ })).toBeNull();
  });

  it("사용 여부를 바꿔 보내고, 체크 · 버전을 함께 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <DefectTypeForm
        {...base}
        action={action}
        initial={{ name: "와이어 휨", cls: "DIM", processes: ["WB"], note: "", active: "Y" }}
        classes={classes}
        processes={processes}
      />,
    );
    fireEvent.click(radio("사용 안 함"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("code")).toBe(false);
    expect(sent.get("active")).toBe("N");
    expect(sent.get("version")).toBe("7");
    expect(sent.get("cls")).toBe("DIM");
    expect(sent.getAll("processes")).toEqual(["WB"]);
  });
});
