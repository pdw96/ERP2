import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Partner } from "@/db/partners";
import type { PartnerFormState } from "../actions";
import { PartnerForm } from "../partner-form";
import { PartnerList, PartnerSearch, SavedNotice } from "../partner-list";

vi.mock("../actions", () => ({}));
vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const partner = (over: Partial<Partner>): Partner => ({
  id: 1,
  code: "BP-0005",
  name: "(가상) 마루반도체",
  isSupplier: true,
  isCustomer: true,
  bizNo: "000-00-00005",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const none = { q: "", includeInactive: false };
const box = (name: RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("거래처 목록", () => {
  it("행마다 코드(수정 화면 링크) · 거래처명 · 구분 · 사업자등록번호", () => {
    render(<PartnerList rows={[partner({})]} filter={none} />);
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("link", { name: "BP-0005" })).toHaveAttribute("href", "/master/partners/BP-0005");
    for (const text of ["(가상) 마루반도체", "매입처 · 매출처", "000-00-00005"])
      expect(row.getByText(text)).toBeInTheDocument();
  });

  it("휴대폰 폭에서는 사업자등록번호를 숨긴다", () => {
    render(<PartnerList rows={[partner({})]} filter={none} />);
    const hidden = screen.getAllByRole("columnheader").filter((th) => th.className.includes("hidden"));
    expect(hidden.map((th) => th.textContent)).toEqual(["사업자등록번호"]);
  });

  it("사업자등록번호가 없으면 「—」, 「사용 안 함」에는 표시가 붙는다", () => {
    render(
      <PartnerList rows={[partner({ bizNo: null, active: false })]} filter={{ ...none, includeInactive: true }} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
  });

  it("쉼 없이 긴 거래처명도 칸 안에서 접힌다", () => {
    render(<PartnerList rows={[partner({ name: "A".repeat(100) })]} filter={none} />);
    expect(screen.getByText("A".repeat(100)).closest("td")).toHaveClass("wrap-anywhere");
  });

  it("찾은 것이 없으면 그렇게 말한다", () => {
    render(<PartnerList rows={[]} filter={{ ...none, role: "customer" }} />);
    expect(screen.getByText("찾는 거래처가 없습니다.")).toBeInTheDocument();
  });

  it("지금 거르는 값을 칸에 보이고, 받지 않은 값을 알린다", () => {
    render(
      <PartnerSearch
        filter={{ q: "누리", role: "supplier", includeInactive: false }}
        notices={[{ field: "role", message: "없는 구분이라 거르지 않았습니다" }]}
      />,
    );
    const form = within(screen.getByRole("search", { name: "거래처 찾기" }));
    expect(form.getByLabelText("코드 · 거래처명")).toHaveValue("누리");
    expect(form.getByLabelText("구분")).toHaveDisplayValue("매입처");
    expect(form.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/master/partners");
    expect(screen.getByRole("status")).toHaveTextContent("없는 구분이라 거르지 않았습니다");
  });

  it("저장한 거래처를 알린다", () => {
    render(<SavedNotice partner={partner({})} shown />);
    expect(screen.getByRole("status")).toHaveTextContent("BP-0005 (가상) 마루반도체를 저장했습니다.");
  });

  it("같은 사업자등록번호를 쓰는 거래처가 있으면 저장 알림에 경고를 붙인다", () => {
    render(
      <SavedNotice
        partner={partner({ code: "BP-0006", name: "(가상) 바다솔더" })}
        shown
        sharedBizNo={[{ code: "BP-0005", name: "(가상) 마루반도체", active: false }]}
      />,
    );
    const note = within(screen.getByRole("note"));
    expect(note.getByText(/같은 사업자등록번호/)).toHaveTextContent("000-00-00005");
    expect(note.getByRole("link", { name: "BP-0005" })).toHaveAttribute("href", "/master/partners/BP-0005");
    expect(note.getByText("(사용 안 함)")).toBeInTheDocument();
  });

  it("겹치지 않으면 경고가 없다", () => {
    render(<SavedNotice partner={partner({})} shown sharedBizNo={[]} />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("거래처 등록 화면", () => {
  it("붙을 코드를 보이고, 매입처 · 매출처를 둘 다 고를 수 있다", () => {
    render(<PartnerForm mode="create" action={vi.fn()} previewCode="BP-0006" initial={{ name: "", bizNo: "" }} />);
    expect(screen.getByText("BP-0006")).toBeInTheDocument();
    fireEvent.click(box(/매입처/));
    fireEvent.click(box(/매출처/));
    expect(box(/매입처/).checked).toBe(true);
    expect(box(/매출처/).checked).toBe(true);
  });

  it("저장하면 칸을 보내고, 거절되면 「구분」 자리에 까닭을 보이며 넣은 값을 남긴다", async () => {
    const rejected: PartnerFormState = {
      ok: false,
      errors: {
        role: "매입처 · 매출처 가운데 하나 이상을 고르세요",
        bizNo: "사업자등록번호는 000-00-00000 꼴로 넣거나 비우세요",
      },
      values: { name: "(가상) 바다솔더", bizNo: "123" },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<PartnerForm mode="create" action={action} previewCode="BP-0006" initial={{ name: "", bizNo: "" }} />);
    fireEvent.change(screen.getByLabelText(/거래처명/), { target: { value: "(가상) 바다솔더" } });
    fireEvent.change(screen.getByLabelText(/사업자등록번호/), { target: { value: "123" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("name")).toBe("(가상) 바다솔더");
    expect(sent.get("isSupplier")).toBeNull();

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert).toHaveTextContent(/구분 — 매입처 · 매출처 가운데 하나 이상을 고르세요.*사업자등록번호 — /);
    expect(within(alert).getByRole("link", { name: "구분" })).toHaveAttribute("href", "#f-role");
    expect(screen.getByRole("group", { name: /구분/ })).toHaveAccessibleDescription(
      "매입처 · 매출처 가운데 하나 이상을 고르세요",
    );
    expect(screen.getByLabelText(/거래처명/)).toHaveValue("(가상) 바다솔더");
    expect(screen.getByLabelText(/사업자등록번호/)).toHaveValue("123");
  });
});

describe("거래처 수정 화면", () => {
  it("저장된 사업자등록번호를 다른 거래처도 쓰면 그 칸 아래에 경고한다 — 저장은 막지 않는다", () => {
    render(
      <PartnerForm
        mode="edit"
        code="BP-0006"
        action={vi.fn()}
        initial={{ name: "(가상) 바다솔더", isSupplier: "on", bizNo: "000-00-00005", active: "Y" }}
        sharedBizNo={[{ code: "BP-0005", name: "(가상) 마루반도체", active: true }]}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("BP-0005 (가상) 마루반도체");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  });

  const initial = { name: "(가상) 마루반도체", isSupplier: "on", isCustomer: "on", bizNo: "000-00-00005", active: "Y" };

  it("코드는 보이기만 하고 보내지 않는다. 지금의 구분이 켜져 있다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(<PartnerForm mode="edit" code="BP-0005" action={action} initial={initial} />);
    expect(screen.getByText("BP-0005")).toBeInTheDocument();
    expect(box(/매입처/).checked).toBe(true);
    expect(box(/매출처/).checked).toBe(true);
    fireEvent.click(box(/매입처/));
    fireEvent.click(radio("사용 안 함"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("code")).toBe(false);
    expect(sent.get("isSupplier")).toBeNull();
    expect(sent.get("isCustomer")).toBe("on");
    expect(sent.get("active")).toBe("N");
  });
});
