import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Code, CodeGroup, CodeGroupRow } from "@/db/codes";
import type { CodeFormState } from "../actions";
import { CodeForm } from "../code-form";
import { CodeTable, GroupPicker, GroupTable, SavedNotice } from "../code-list";

vi.mock("../actions", () => ({}));

const groups: CodeGroupRow[] = [
  { code: "ITEM_TYPE", name: "품목 유형", isSystem: true, values: 3 },
  { code: "PROC_TYPE", name: "조달구분", isSystem: true, values: 2 },
  { code: "UNIT", name: "단위", isSystem: false, values: 4 },
];
const group = (over: Partial<CodeGroup>): CodeGroup => ({
  id: 3,
  code: "UNIT",
  name: "단위",
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const code = (over: Partial<Code>): Code => ({
  id: 1,
  groupCode: "UNIT",
  code: "EA",
  name: "개",
  sortOrder: 10,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const unit = { code: "UNIT", name: "단위" };
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("묶음 목록", () => {
  it("묶음마다 코드(값 화면 링크) · 이름 · 가름 · 값의 수", () => {
    render(<GroupTable groups={groups} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    const first = within(rows[0]);
    expect(first.getByRole("link", { name: "ITEM_TYPE" })).toHaveAttribute("href", "/system/codes/ITEM_TYPE");
    expect(first.getByText("시스템 코드")).toBeInTheDocument();
    expect(first.getByText("3개")).toBeInTheDocument();
    expect(within(rows[2]).getByText("사용자 코드")).toBeInTheDocument();
  });

  it("값 화면 위의 묶음 고르기는 지금 묶음을 표시한다", () => {
    render(<GroupPicker groups={groups} current="UNIT" />);
    const nav = within(screen.getByRole("navigation", { name: "공통코드 묶음" }));
    expect(nav.getByRole("link", { name: /UNIT/ })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: /ITEM_TYPE/ })).not.toHaveAttribute("aria-current");
  });
});

describe("값 목록", () => {
  it("사용자 코드 — 코드가 수정 화면으로 가는 링크, 「사용 안 함」에도 표시가 붙어 보인다", () => {
    render(<CodeTable group={group({})} rows={[code({}), code({ id: 2, code: "G", name: "그램", active: false })]} />);
    expect(screen.getByRole("link", { name: "EA" })).toHaveAttribute("href", "/system/codes/UNIT/EA");
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText("2개 · 사용 안 함 1개 포함")).toBeInTheDocument();
  });

  it("시스템 코드 — 값은 보이기만 하고 링크가 없다", () => {
    render(
      <CodeTable
        group={group({ code: "ITEM_TYPE", name: "품목 유형", isSystem: true })}
        rows={[code({ groupCode: "ITEM_TYPE", code: "RM", name: "원자재" })]}
      />,
    );
    expect(screen.getByText("RM")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("값이 없으면 그렇게 말한다", () => {
    render(<CodeTable group={group({})} rows={[]} />);
    expect(screen.getByText("값이 없습니다.")).toBeInTheDocument();
  });

  it("저장한 값을 칠하고 알린다 — 「사용 안 함」이면 새 입력에서 빠진다고 알린다", () => {
    const saved = code({ code: "BOX", name: "상자", active: false });
    render(
      <>
        <SavedNotice code={saved} />
        <CodeTable group={group({})} rows={[saved]} savedCode="BOX" />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("BOX 상자를 저장했습니다.");
    expect(screen.getByRole("status")).toHaveTextContent("새 입력의 목록에서 빠지고");
    expect(screen.getAllByRole("row")[1]).toHaveClass("bg-safety/15");
  });
});

describe("값 추가 화면", () => {
  it("묶음은 보이기만 하고, 정렬 순서의 기본값이 칸에 들어 있다. 사용 여부 칸은 없다", () => {
    render(<CodeForm mode="create" group={unit} action={vi.fn()} initial={{ code: "", name: "", sortOrder: "50" }} />);
    expect(screen.getByText("UNIT 단위")).toBeInTheDocument();
    expect(screen.getByLabelText(/정렬 순서/)).toHaveValue("50");
    expect(screen.queryByRole("radio", { name: "사용 안 함" })).toBeNull();
  });

  it("저장하면 코드 · 이름 · 정렬 순서를 보내고, 거절되면 까닭을 보이며 넣은 값을 남긴다", async () => {
    const rejected: CodeFormState = {
      ok: false,
      errors: { code: "영문 대문자 · 숫자 · 밑줄(_) 20자까지이고, 대문자나 숫자로 시작합니다 — 예: BOX" },
      values: { code: "box", name: "상자", sortOrder: "50" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<CodeForm mode="create" group={unit} action={action} initial={{ code: "", name: "", sortOrder: "50" }} />);
    fireEvent.change(screen.getByLabelText(/^코드/), { target: { value: "box" } });
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: "상자" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect([sent.get("code"), sent.get("name"), sent.get("sortOrder")]).toEqual(["box", "상자", "50"]);
    expect(sent.has("groupCode")).toBe(false);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("코드 — 영문 대문자"));
    expect(screen.getByLabelText(/^코드/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^코드/)).toHaveValue("box");
  });

  it("취소는 그 묶음의 값 목록으로 간다", () => {
    render(<CodeForm mode="create" group={unit} action={vi.fn()} initial={{}} />);
    expect(screen.getByRole("link", { name: "취소" })).toHaveAttribute("href", "/system/codes/UNIT");
  });
});

describe("값 수정 화면", () => {
  it("프로그램이 기대는 값(국가 KR)은 「사용 안 함」 칸이 없고, 늘 「사용」으로 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <CodeForm
        mode="edit"
        version="7"
        group={{ code: "COUNTRY", name: "국가" }}
        code="KR"
        alwaysActive
        action={action}
        initial={{ name: "한국", sortOrder: "10", active: "Y" }}
      />,
    );
    expect(screen.queryByRole("radio", { name: "사용 안 함" })).toBeNull();
    expect(screen.getByText(/늘 「사용」입니다/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    expect((action.mock.calls[0][1] as FormData).get("active")).toBe("Y");
  });

  it("코드는 보이기만 하고 보내지 않는다. 사용 여부를 「사용 안 함」으로 바꿔 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <CodeForm
        mode="edit"
        version="7"
        group={unit}
        code="G"
        action={action}
        initial={{ name: "그램", sortOrder: "40", active: "Y" }}
      />,
    );
    expect(screen.getByText("G")).toBeInTheDocument();
    expect(screen.getByText(/이미 그 값을 쓴 곳에는 그대로 남습니다/)).toBeInTheDocument();
    expect(radio("사용").checked).toBe(true);
    fireEvent.click(radio("사용 안 함"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("code")).toBe(false);
    expect([sent.get("name"), sent.get("sortOrder"), sent.get("active")]).toEqual(["그램", "40", "N"]);
    // 화면을 연 때의 버전을 함께 보낸다 — 그 사이 다른 사람이 고쳤으면 서버가 막는다(PR J).
    expect(sent.get("version")).toBe("7");
  });
});

describe("단위 사양(조각 「재고 수불」 PR A, ADR 0017)", () => {
  const specs = {
    EA: { unit: "EA", baseUnit: "EA", factor: 1, decimals: 0 },
    KG: { unit: "KG", baseUnit: "G", factor: 1000, decimals: 3 },
    MG: { unit: "MG", baseUnit: "G", factor: 0.001, decimals: 0 },
  };

  it("단위 목록 — 기준 단위(자신이면 「자신」) · 배수 · 소수 자릿수 칸이 더 있다", () => {
    render(
      <CodeTable
        group={group({})}
        rows={[code({}), code({ id: 2, code: "KG", name: "킬로그램" }), code({ id: 3, code: "MG", name: "밀리그램" })]}
        specs={specs}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "기준 단위" })).toBeInTheDocument();
    const [ea, kg, mg] = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r));
    expect(ea.getByText("자신")).toBeInTheDocument();
    expect(kg.getByText("G")).toBeInTheDocument();
    expect(kg.getByText("1000")).toBeInTheDocument();
    expect(kg.getByText("3")).toBeInTheDocument();
    expect(mg.getByText("0.001")).toBeInTheDocument();
  });

  it("다른 묶음의 목록에는 사양 칸이 없다", () => {
    render(<CodeTable group={group({ code: "COUNTRY", name: "국가" })} rows={[code({ groupCode: "COUNTRY" })]} />);
    expect(screen.queryByRole("columnheader", { name: "기준 단위" })).toBeNull();
  });

  it("새 단위 — 기준 단위(기본은 「이 단위 자신」) · 배수 · 자릿수를 넣어 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <CodeForm
        mode="create"
        group={unit}
        action={action}
        initial={{ code: "", name: "", sortOrder: "90", baseUnit: "", factor: "", decimals: "0" }}
        unit={{
          mode: "create",
          bases: [
            { code: "EA", name: "개" },
            { code: "G", name: "그램" },
          ],
        }}
      />,
    );
    const base = screen.getByLabelText(/^기준 단위/) as HTMLSelectElement;
    expect(base.value).toBe("");
    expect(
      within(base)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["이 단위 자신", "EA 개", "G 그램"]);
    fireEvent.change(screen.getByLabelText(/^코드/), { target: { value: "TON" } });
    fireEvent.change(base, { target: { value: "G" } });
    fireEvent.change(screen.getByLabelText(/^배수/), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText(/^소수 자릿수/), { target: { value: "3" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect([sent.get("baseUnit"), sent.get("factor"), sent.get("decimals")]).toEqual(["G", "1000000", "3"]);
  });

  it("단위 수정 — 기준 · 배수는 보이기만 하고 보내지 않는다. 자릿수만 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <CodeForm
        mode="edit"
        version="7"
        group={unit}
        code="KG"
        action={action}
        initial={{ name: "킬로그램", sortOrder: "30", active: "Y", decimals: "3" }}
        unit={{ mode: "edit", baseUnit: "G", factor: 1000 }}
      />,
    );
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^기준 단위/)).toBeNull();
    expect(screen.queryByLabelText(/^배수/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^소수 자릿수/), { target: { value: "1" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("baseUnit") || sent.has("factor")).toBe(false);
    expect(sent.get("decimals")).toBe("1");
  });

  it("다른 묶음의 화면에는 사양 칸이 없다", () => {
    render(<CodeForm mode="create" group={{ code: "COUNTRY", name: "국가" }} action={vi.fn()} initial={{}} />);
    expect(screen.queryByLabelText(/^소수 자릿수/)).toBeNull();
  });
});
