import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Warehouse } from "@/db/warehouses";
import type { WarehouseFormState } from "../actions";
import { WarehouseForm } from "../warehouse-form";
import { SavedNotice, WarehouseList, WarehouseSearch } from "../warehouse-list";

vi.mock("../actions", () => ({}));
vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

const warehouse = (over: Partial<Warehouse>): Warehouse => ({
  id: 1,
  code: "WH-01",
  name: "자재창고",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});
const none = { q: "", includeInactive: false };
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;

describe("창고 목록", () => {
  it("행마다 코드(수정 화면 링크) · 창고명", () => {
    render(
      <WarehouseList rows={[warehouse({}), warehouse({ id: 2, code: "WH-02", name: "생산현장" })]} filter={none} />,
    );
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByRole("link", { name: "WH-01" })).toHaveAttribute("href", "/inventory/warehouses/WH-01");
    expect(row.getByText("자재창고")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
  });

  it("「사용 안 함」 창고에는 표시가 붙는다", () => {
    render(<WarehouseList rows={[warehouse({ active: false })]} filter={{ ...none, includeInactive: true }} />);
    expect(screen.getByText("사용 안 함")).toBeInTheDocument();
    expect(screen.getByText("1개 · 사용 안 함 포함")).toBeInTheDocument();
  });

  it("쉼 없이 긴 창고명도 칸 안에서 접힌다", () => {
    render(<WarehouseList rows={[warehouse({ name: "A".repeat(50) })]} filter={none} />);
    expect(screen.getByText("A".repeat(50)).closest("td")).toHaveClass("wrap-anywhere");
  });

  it("찾은 것이 없으면 그렇게 말한다", () => {
    render(<WarehouseList rows={[]} filter={{ ...none, q: "없음" }} />);
    expect(screen.getByText("찾는 창고가 없습니다.")).toBeInTheDocument();
  });

  it("찾는 글자를 칸에 보이고, 「처음대로」로 돌아간다", () => {
    render(<WarehouseSearch filter={{ q: "자재", includeInactive: true }} notices={[]} />);
    const form = within(screen.getByRole("search", { name: "창고 찾기" }));
    expect(form.getByLabelText("코드 · 창고명")).toHaveValue("자재");
    expect(form.getByLabelText("사용 안 함 포함")).toBeChecked();
    expect(form.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/inventory/warehouses");
  });

  it("저장한 창고를 알리고, 「사용 안 함」으로 빠졌으면 다시 보는 길을 알린다", () => {
    render(<SavedNotice warehouse={warehouse({ name: "불량창고", active: false })} shown={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("WH-01 불량창고를 저장했습니다.");
    expect(screen.getByRole("link", { name: "사용 안 함 포함" })).toHaveAttribute(
      "href",
      "/inventory/warehouses?inactive=1",
    );
  });
});

describe("창고 등록 화면", () => {
  it("붙을 코드를 보이고, 사용 여부 칸은 없다", () => {
    render(<WarehouseForm mode="create" action={vi.fn()} previewCode="WH-05" initial={{ name: "" }} />);
    expect(screen.getByText("WH-05")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "사용 안 함" })).toBeNull();
  });

  it("저장하면 창고명을 보내고, 거절되면 까닭을 보이며 넣은 값을 남긴다", async () => {
    const rejected: WarehouseFormState = {
      ok: false,
      errors: { name: "창고명은 50자까지입니다" },
      values: { name: "가".repeat(51) },
    };
    const action = vi.fn().mockResolvedValue(rejected);
    render(<WarehouseForm mode="create" action={action} previewCode="WH-05" initial={{ name: "" }} />);
    fireEvent.change(screen.getByLabelText(/창고명/), { target: { value: "가".repeat(51) } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    expect((action.mock.calls[0][1] as FormData).get("name")).toBe("가".repeat(51));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("창고명 — 창고명은 50자까지입니다"));
    expect(screen.getByLabelText(/창고명/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/창고명/)).toHaveValue("가".repeat(51));
  });
});

describe("창고 수정 화면", () => {
  it("코드는 보이기만 하고 보내지 않는다. 사용 여부를 「사용 안 함」으로 바꿔 보낸다", async () => {
    const action = vi.fn().mockResolvedValue(null);
    render(
      <WarehouseForm
        mode="edit"
        code="WH-04"
        version="7"
        action={action}
        initial={{ name: "불량창고", active: "Y" }}
      />,
    );
    expect(screen.getByText("WH-04")).toBeInTheDocument();
    expect(radio("사용").checked).toBe(true);
    fireEvent.click(radio("사용 안 함"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "저장" }));
    });
    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.has("code")).toBe(false);
    expect(sent.get("active")).toBe("N");
    expect(sent.get("name")).toBe("불량창고");
    // 화면을 연 때의 버전을 함께 보낸다 — 그 사이 다른 사람이 고쳤으면 서버가 막는다(PR J).
    expect(sent.get("version")).toBe("7");
  });
});
