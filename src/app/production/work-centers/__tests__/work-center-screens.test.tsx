import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProcessOption } from "@/db/processes";
import type { WorkCenterRow } from "@/db/work-centers";
import type { WorkCenterFormState } from "../actions";
import { WorkCenterForm } from "../work-center-form";
import { WorkCenterList, WorkCenterSearch, SavedNotice } from "../work-center-list";

vi.mock("../actions", () => ({}));
vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const wc = (over: Partial<WorkCenterRow>): WorkCenterRow => ({
  id: 1,
  code: "DA-1",
  name: "다이 본딩 1라인",
  processId: 3,
  processCode: "DA",
  processName: "다이 본딩",
  note: "칩을 붙인다",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const none = { q: "", process: "", includeInactive: false };
const processes: ProcessOption[] = [
  { code: "DA", name: "다이 본딩", active: true },
  { code: "MK", name: "마킹", active: false },
  { code: "WB", name: "와이어 본딩", active: true },
];
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("작업장 목록", () => {
  it("표 머리는 코드 · 작업장명 · 공정 · 비고, 행마다 코드(수정 화면 링크) · 작업장명 · 공정(코드 이름) · 비고", () => {
    render(
      <WorkCenterList
        rows={[
          wc({}),
          wc({ id: 2, code: "WB-1", name: "와이어 1", processCode: "WB", processName: "와이어 본딩", note: "" }),
        ]}
        filter={none}
      />,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["코드", "작업장명", "공정", "비고"]);
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("link", { name: "DA-1" })).toHaveAttribute("href", "/production/work-centers/DA-1");
    expect(row.getByText("다이 본딩 1라인")).toBeInTheDocument();
    expect(row.getByText("DA 다이 본딩")).toBeInTheDocument();
    expect(row.getByText("칩을 붙인다")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
  });

  it("「사용 안 함」 작업장에는 표시가 붙는다", () => {
    render(<WorkCenterList rows={[wc({ active: false })]} filter={{ ...none, includeInactive: true }} />);
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText("1개 · 사용 안 함 포함")).toBeInTheDocument();
  });

  it("빈 목록은 그렇게 말하고, 찾는 글자가 있으면 찾는 것이 없다고 말한다", () => {
    const { rerender } = render(<WorkCenterList rows={[]} filter={none} />);
    expect(screen.getByText("등록된 작업장이 없습니다.")).toBeInTheDocument();
    rerender(<WorkCenterList rows={[]} filter={{ ...none, q: "없음" }} />);
    expect(screen.getByText("찾는 작업장이 없습니다.")).toBeInTheDocument();
  });

  it("찾기는 글자 칸 · 공정 고르기(모든 공정 + 모든 공정, 사용 안 함은 표시) · 「사용 안 함 포함」", () => {
    render(
      <WorkCenterSearch
        filter={{ q: "라인", process: "WB", includeInactive: true }}
        notices={[]}
        processes={processes}
      />,
    );
    const form = within(screen.getByRole("search", { name: "작업장 찾기" }));
    expect(form.getByLabelText("코드 · 작업장명")).toHaveValue("라인");
    const select = form.getByLabelText("공정") as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["모든 공정", "DA 다이 본딩", "MK 마킹 (사용 안 함)", "WB 와이어 본딩"]);
    expect(select.value).toBe("WB");
    expect(form.getByLabelText("사용 안 함 포함")).toBeChecked();
    expect(form.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/production/work-centers");
  });

  it("거르기 알림을 보인다", () => {
    render(
      <WorkCenterSearch
        filter={none}
        notices={[{ field: "process", message: "받지 않는 공정 값이라 거르지 않았습니다" }]}
        processes={processes}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("받지 않는 공정 값이라 거르지 않았습니다");
  });

  it("저장한 작업장을 알리고, 「사용 안 함」으로 빠졌으면 다시 보는 길을 알린다", () => {
    render(<SavedNotice workCenter={wc({ active: false })} shown={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("DA-1 다이 본딩 1라인을 저장했습니다.");
    expect(screen.getByRole("link", { name: "사용 안 함 포함" })).toHaveAttribute(
      "href",
      "/production/work-centers?inactive=1",
    );
  });
});

describe("작업장 등록 화면", () => {
  it("코드 칸(10자까지, 안내)과 공정 고르기(사용 중 공정만) · 작업장명 · 비고가 있고, 사용 여부 칸은 없다", () => {
    render(<WorkCenterForm mode="create" action={vi.fn()} initial={{}} processes={processes} />);
    const code = screen.getByLabelText(/작업장코드/);
    expect(code).toHaveAttribute("maxlength", "10");
    expect(code).toHaveAttribute("placeholder", "예: DA-1");
    expect(
      screen.getByText("영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자 · 등록한 뒤 바꾸지 못합니다"),
    ).toBeInTheDocument();
    const select = screen.getByLabelText(/공정/) as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["공정을 고르세요", "DA 다이 본딩", "WB 와이어 본딩"]);
    expect(screen.queryByText(/MK/)).toBeNull();
    expect(screen.getByLabelText(/작업장명/)).toBeInTheDocument();
    expect(screen.getByLabelText(/비고/).tagName).toBe("TEXTAREA");
    expect(screen.queryByRole("radio", { name: "사용 안 함" })).toBeNull();
  });

  it("사용 중 공정이 없으면 고르기 대신 안내와 「공정 등록」 링크를 보인다", () => {
    render(
      <WorkCenterForm
        mode="create"
        action={vi.fn()}
        initial={{}}
        processes={[{ code: "MK", name: "마킹", active: false }]}
      />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("link", { name: /공정 등록/ }).closest("p")).toHaveTextContent(
      "사용 중인 공정이 없습니다 — 먼저 「공정 등록」에서 공정을 등록하세요",
    );
    expect(screen.getByRole("link", { name: /공정 등록/ })).toHaveAttribute("href", "/production/processes");
  });

  it("사용 중 공정이 없을 때 공정 거절은 id e-process 로 보이고, 요약 링크 #f-process 가 닿는 곳이 있다", async () => {
    const rejected: WorkCenterFormState = {
      ok: false,
      errors: { process: "공정을 고르세요" },
      values: { code: "DA-1", name: "다이 1" },
    };
    const { container } = render(
      <WorkCenterForm
        mode="create"
        action={vi.fn().mockResolvedValue(rejected)}
        initial={{}}
        processes={[{ code: "MK", name: "마킹", active: false }]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    await waitFor(() => expect(container.querySelector("#e-process")).toHaveTextContent("공정을 고르세요"));
    const target = container.querySelector("#f-process");
    expect(target).not.toBeNull();
    expect(target).toHaveAttribute("tabindex", "-1");
    expect(container.querySelector('a[href="#f-process"]')).not.toBeNull();
  });

  it("저장하면 코드 · 공정 · 작업장명 · 비고를 보내고, 거절되면 요약 · 칸 옆 까닭 · 넣은 값을 남긴다", async () => {
    const rejected: WorkCenterFormState = {
      ok: false,
      errors: { code: "영문 대문자로 시작해 대문자 · 숫자 · - 2 ~ 10자입니다 — 예: DA-1, WB-L2" },
      values: { code: "da-1", name: "다이 1", process: "WB", note: "메모" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<WorkCenterForm mode="create" action={action} initial={{}} processes={processes} />);
    fireEvent.change(screen.getByLabelText(/작업장코드/), { target: { value: "da-1" } });
    fireEvent.change(screen.getByLabelText(/공정/), { target: { value: "WB" } });
    fireEvent.change(screen.getByLabelText(/작업장명/), { target: { value: "다이 1" } });
    fireEvent.change(screen.getByLabelText(/비고/), { target: { value: "메모" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("code")).toBe("da-1");
    expect(sent.get("process")).toBe("WB");
    expect(sent.get("name")).toBe("다이 1");
    expect(sent.get("note")).toBe("메모");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("작업장코드 — 영문 대문자로 시작해"));
    expect(screen.getByLabelText(/작업장코드/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/작업장코드/)).toHaveValue("da-1");
    expect((screen.getByLabelText(/공정/) as HTMLSelectElement).value).toBe("WB");
    expect(screen.getByLabelText(/비고/)).toHaveValue("메모");
  });

  it("공정을 거절하면 공정 칸 옆에 까닭을 보인다", async () => {
    const rejected: WorkCenterFormState = {
      ok: false,
      errors: { process: "「사용 안 함」인 공정입니다 — 다른 공정을 고르세요" },
      values: { code: "DA-1", name: "다이 1", process: "DA" },
    };
    render(
      <WorkCenterForm mode="create" action={vi.fn().mockResolvedValue(rejected)} initial={{}} processes={processes} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    await waitFor(() => expect(screen.getByLabelText(/공정/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText("「사용 안 함」인 공정입니다 — 다른 공정을 고르세요").length).toBeGreaterThan(0);
  });
});

describe("작업장 수정 화면", () => {
  it("코드 · 공정은 읽기 전용으로 보이고 보내지 않는다. 공정 고르기는 없다. 사용 여부를 바꿔 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <WorkCenterForm
        mode="edit"
        code="DA-1"
        process={{ code: "DA", name: "다이 본딩" }}
        version="7"
        action={action}
        initial={{ name: "다이 본딩 1라인", note: "", active: "Y" }}
      />,
    );
    expect(screen.getByText("DA-1")).toBeInTheDocument();
    expect(screen.getByText("DA 다이 본딩")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText(/작업장코드/)).toBeNull();
    expect(radio("사용").checked).toBe(true);
    fireEvent.click(radio("사용 안 함"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("code")).toBe(false);
    expect(sent.has("process")).toBe(false);
    expect(sent.get("active")).toBe("N");
    expect(sent.get("version")).toBe("7");
  });
});
