import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Partner } from "@/db/partners";
import { InquiryTable } from "@/components/inquiry-table";
import { partnerInquiryColumns } from "../inquiry/partner-inquiry";
import { PartnerSearch } from "../partner-list";

vi.mock("next/form", () => ({ default: (props: Record<string, unknown>) => <form {...props} /> }));

// 거래처 조회(PR I, 성공 기준 14) — 모든 칸을 넓은 표로 보는, 고칠 수 없는 화면.

const partner = (over: Partial<Partner>): Partner => ({
  id: 1,
  code: "BP-0001",
  name: "(가상) 가람리드프레임",
  isSupplier: true,
  isCustomer: false,
  countryGroup: "COUNTRY",
  country: "KR",
  bizNo: "000-00-00001",
  foreignBizNo: null,
  ceo: "홍길동",
  bizType: "제조업",
  bizItem: "리드프레임",
  address: "가상시 가람구 산단로 101",
  phone: "031-0000-0001",
  email: "sales@garam.example.com",
  contactName: "김철수",
  contactPhone: "010-0000-0001",
  note: "",
  active: true,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-04T03:00:00Z"),
  ...over,
});
const countries = [
  { code: "KR", name: "한국", active: true },
  { code: "US", name: "미국", active: true },
  { code: "TW", name: "대만", active: false },
];
const none = { q: "", includeInactive: false };

const table = (rows: Partner[]) =>
  render(
    <InquiryTable
      rows={rows}
      columns={partnerInquiryColumns(countries)}
      what="거래처"
      nameLabel="거래처명"
      editHref={(code) => `/master/partners/${code}`}
      includeInactive={false}
      narrowed={false}
    />,
  );

describe("거래처 조회의 표", () => {
  it("칸은 한 건 등록 화면의 순서대로, 끝에 사용 여부 · 수정일(저자 판정 2026-11-04)", () => {
    table([partner({})]);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "코드 · 거래처명",
      "구분",
      "국가",
      "사업자번호",
      "대표자",
      "업태",
      "종목",
      "주소",
      "전화",
      "이메일",
      "담당자",
      "담당자 연락처",
      "비고",
      "사용 여부",
      "수정일",
    ]);
  });

  it("모든 칸의 값을 보인다 — 빈 칸은 「—」", () => {
    table([partner({})]);
    const cells = within(screen.getAllByRole("row")[1])
      .getAllByRole("cell")
      .map((td) => td.textContent);
    expect(cells).toEqual([
      "매입처",
      "KR한국",
      "000-00-00001",
      "홍길동",
      "제조업",
      "리드프레임",
      "가상시 가람구 산단로 101",
      "031-0000-0001",
      "sales@garam.example.com",
      "김철수",
      "010-0000-0001",
      "—",
      "사용",
      "2026-11-04",
    ]);
  });

  it("해외 거래처는 해외 사업자번호를 보인다", () => {
    table([partner({ country: "US", bizNo: null, foreignBizNo: "00-0000007", isCustomer: true, isSupplier: false })]);
    const row = within(screen.getAllByRole("row")[1]);
    expect(row.getByText("00-0000007")).toBeInTheDocument();
    expect(row.getByText("US").parentElement).toHaveTextContent("US미국");
  });

  it("코드를 누르면 거래처 등록의 수정 화면으로 간다 — 표 안에는 고치는 칸 · 단추가 없다", () => {
    table([partner({})]);
    const head = within(screen.getAllByRole("row")[1]).getByRole("rowheader");
    expect(within(head).getByRole("link", { name: "BP-0001" })).toHaveAttribute("href", "/master/partners/BP-0001");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("찾은 것이 없으면 그렇게 말한다 — 「거래처가」", () => {
    render(
      <InquiryTable
        rows={[]}
        columns={partnerInquiryColumns(countries)}
        what="거래처"
        nameLabel="거래처명"
        editHref={(code) => code}
        includeInactive={false}
        narrowed
      />,
    );
    expect(screen.getByText("찾는 거래처가 없습니다.")).toBeInTheDocument();
  });
});

describe("거래처 조회의 찾기", () => {
  it("찾기는 조회로 보내고 글 칸 전체를 본다고 알린다 — 거르기는 구분에 국가를 더한다", () => {
    render(
      <PartnerSearch
        filter={{ ...none, q: "김철수", country: "TW" }}
        notices={[{ field: "country", message: "없는 국가라 거르지 않았습니다" }]}
        action="/master/partners/inquiry"
        scope="allText"
        countries={countries}
      />,
    );
    const form = screen.getByRole("search", { name: "거래처 찾기" });
    expect(form).toHaveAttribute("action", "/master/partners/inquiry");
    const f = within(form);
    expect(f.getByLabelText("찾을 글자")).toHaveValue("김철수");
    expect(f.getByLabelText("찾을 글자")).toHaveAccessibleDescription(/사업자번호 · 사업자 정보 · 연락처 · 비고/);
    expect(f.getByLabelText("구분")).toHaveDisplayValue("전체");
    expect(f.getByLabelText("국가")).toHaveDisplayValue("대만 (사용 안 함)");
    expect(f.getByRole("link", { name: "처음대로" })).toHaveAttribute("href", "/master/partners/inquiry");
    expect(f.getByRole("status")).toHaveTextContent("없는 국가라 거르지 않았습니다");
  });

  it("거래처 등록의 찾기에는 국가 거르기가 없다", () => {
    render(<PartnerSearch filter={none} notices={[]} />);
    expect(screen.queryByLabelText("국가")).toBeNull();
    expect(screen.getByLabelText("코드 · 거래처명")).toBeInTheDocument();
  });
});
