import { bizNoOf, roleNames, type CountryOption, type Partner } from "@/db/partners";
import { dateKst, orDash, type InquiryColumn } from "@/components/inquiry-table";
import { PARTNER_TEXT_FIELDS } from "@/lib/partner-fields";

// 거래처 조회의 칸 — 한 건 등록 화면 · 시트의 순서 그대로, 끝에 사용 여부 · 수정일(저자 판정 2026-11-04).
// 거래처명은 왼쪽에 붙는 칸(코드 · 거래처명)에 있다.

const LONG = new Set(["address", "note"]);
const MONO = new Set(["phone", "contactPhone"]);

export function partnerInquiryColumns(countries: readonly CountryOption[]): InquiryColumn<Partner>[] {
  return [
    { label: "구분", cell: (p) => roleNames(p) },
    {
      label: "국가",
      cell: (p) => {
        const name = countries.find((c) => c.code === p.country)?.name;
        return (
          <>
            <span className="font-mono">{p.country}</span>
            {name && <span className="ml-1">{name}</span>}
          </>
        );
      },
    },
    { label: "사업자번호", cell: (p) => orDash(bizNoOf(p)), mono: true },
    ...PARTNER_TEXT_FIELDS.map(({ field, label }) => ({
      label,
      cell: (p: Partner) => orDash(p[field]),
      long: LONG.has(field),
      mono: MONO.has(field),
    })),
    { label: "사용 여부", cell: (p) => (p.active ? "사용" : "사용 안 함") },
    { label: "수정일", cell: (p) => dateKst(p.updatedAt), mono: true },
  ];
}
