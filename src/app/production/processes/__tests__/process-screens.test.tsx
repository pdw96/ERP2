import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Process } from "@/db/processes";
import type { ProcessFormState } from "../actions";
import { ProcessForm } from "../process-form";
import { ProcessList, ProcessSearch, SavedNotice } from "../process-list";

vi.mock("../actions", () => ({}));
vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const proc = (over: Partial<Process>): Process => ({
  id: 1,
  code: "DA",
  name: "다이 본딩",
  note: "칩을 리드프레임에 붙인다",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const none = { q: "", includeInactive: false };
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("공정 목록", () => {
  it("표 머리는 코드 · 공정명 · 비고, 행마다 코드(수정 화면 링크) · 공정명 · 비고", () => {
    render(<ProcessList rows={[proc({}), proc({ id: 2, code: "WB", name: "와이어 본딩", note: "" })]} filter={none} />);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["코드", "공정명", "비고"]);
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("link", { name: "DA" })).toHaveAttribute("href", "/production/processes/DA");
    expect(row.getByText("다이 본딩")).toBeInTheDocument();
    expect(row.getByText("칩을 리드프레임에 붙인다")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
  });

  it("「사용 안 함」 공정에는 표시가 붙는다", () => {
    render(<ProcessList rows={[proc({ active: false })]} filter={{ ...none, includeInactive: true }} />);
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText("1개 · 사용 안 함 포함")).toBeInTheDocument();
  });

  it("빈 목록은 그렇게 말하고, 찾는 글자가 있으면 찾는 것이 없다고 말한다", () => {
    const { rerender } = render(<ProcessList rows={[]} filter={none} />);
    expect(screen.getByText("등록된 공정이 없습니다.")).toBeInTheDocument();
    rerender(<ProcessList rows={[]} filter={{ ...none, q: "없음" }} />);
    expect(screen.getByText("찾는 공정이 없습니다.")).toBeInTheDocument();
  });

  it("찾기 칸은 「코드 · 공정명」, 찾는 글자를 보이고 「처음대로」로 돌아간다", () => {
    render(<ProcessSearch filter={{ q: "본딩", includeInactive: true }} notices={[]} />);
    const form = within(screen.getByRole("search", { name: "공정 찾기" }));
    expect(form.getByLabelText("코드 · 공정명")).toHaveValue("본딩");
    expect(form.getByLabelText("코드 · 공정명")).toHaveAttribute("placeholder", "예: DA, 본딩");
    expect(form.getByLabelText("사용 안 함 포함")).toBeChecked();
    expect(form.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/production/processes");
  });

  it("저장한 공정을 알리고, 「사용 안 함」으로 빠졌으면 다시 보는 길을 알린다", () => {
    render(<SavedNotice process={proc({ active: false })} shown={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("DA 다이 본딩을 저장했습니다.");
    expect(screen.getByRole("link", { name: "사용 안 함 포함" })).toHaveAttribute(
      "href",
      "/production/processes?inactive=1",
    );
  });
});

describe("공정 등록 화면", () => {
  it("공정코드 칸(6자까지, 안내)과 공정명 · 비고 칸이 있고, 사용 여부 칸은 없다", () => {
    render(<ProcessForm mode="create" action={vi.fn()} initial={{}} />);
    const code = screen.getByLabelText(/공정코드/);
    expect(code).toHaveAttribute("maxlength", "6");
    expect(screen.getByText("영문 대문자로 시작해 2 ~ 6자 · 등록한 뒤 바꾸지 못합니다")).toBeInTheDocument();
    expect(screen.getByLabelText(/공정명/)).toBeInTheDocument();
    expect(screen.getByLabelText(/비고/).tagName).toBe("TEXTAREA");
    expect(screen.queryByRole("radio", { name: "사용 안 함" })).toBeNull();
  });

  it("저장하면 코드 · 공정명 · 비고를 보내고, 거절되면 요약 · 칸 옆 까닭 · 넣은 값을 남긴다", async () => {
    const rejected: ProcessFormState = {
      ok: false,
      errors: { code: "영문 대문자로 시작해 대문자 · 숫자 2 ~ 6자입니다 — 예: DA, WB" },
      values: { code: "da", name: "다이 본딩", note: "메모" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<ProcessForm mode="create" action={action} initial={{}} />);
    fireEvent.change(screen.getByLabelText(/공정코드/), { target: { value: "da" } });
    fireEvent.change(screen.getByLabelText(/공정명/), { target: { value: "다이 본딩" } });
    fireEvent.change(screen.getByLabelText(/비고/), { target: { value: "메모" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("code")).toBe("da");
    expect(sent.get("name")).toBe("다이 본딩");
    expect(sent.get("note")).toBe("메모");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("공정코드 — 영문 대문자로 시작해"));
    expect(screen.getByLabelText(/공정코드/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/공정코드/)).toHaveValue("da");
    expect(screen.getByLabelText(/비고/)).toHaveValue("메모");
  });
});

describe("공정 수정 화면", () => {
  it("코드는 읽기 전용으로 보이고 보내지 않는다. 사용 여부를 「사용 안 함」으로 바꿔 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <ProcessForm
        mode="edit"
        code="DA"
        version="7"
        action={action}
        initial={{ name: "다이 본딩", note: "", active: "Y" }}
      />,
    );
    expect(screen.getByText("DA")).toBeInTheDocument();
    expect(screen.queryByLabelText(/공정코드/)).toBeNull();
    expect(radio("사용").checked).toBe(true);
    fireEvent.click(radio("사용 안 함"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("code")).toBe(false);
    expect(sent.get("active")).toBe("N");
    expect(sent.get("version")).toBe("7");
  });
});
