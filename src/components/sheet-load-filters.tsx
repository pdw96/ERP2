// 시트에 기존 데이터를 불러오는 칸(PR J) — 등록의 목록과 같은 찾기 · 거르기다. 칸 이름은 목록 주소의 거르기 이름과 같아
// 서버가 같은 읽기(parseItemFilter · parsePartnerFilter)로 본다. 시트(src/components/sheet-grid.tsx)의 불러오기 폼 안에 들어간다.

type Choice = { code: string; name: string; active?: boolean };
type Select = { name: string; label: string; options: readonly Choice[] };

const FIELD = "w-full min-w-0 rounded border border-rule px-3 py-2 text-base";

export function SheetLoadFilters({ placeholder, selects }: { placeholder: string; selects: readonly Select[] }) {
  return (
    <>
      <label className="grid w-full gap-1 text-sm sm:w-56">
        <span className="font-semibold">찾을 글자</span>
        <input type="search" name="q" maxLength={50} placeholder={placeholder} className={FIELD} />
      </label>
      {selects.map((s) => (
        <label key={s.name} className="grid w-[calc(50%-0.375rem)] gap-1 text-sm sm:w-36">
          <span className="font-semibold">{s.label}</span>
          <select name={s.name} defaultValue="" className={FIELD}>
            <option value="">전체</option>
            {s.options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name}
                {o.active === false ? " (사용 안 함)" : ""}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex items-center gap-2 py-2 text-sm">
        <input type="checkbox" name="inactive" value="1" className="size-5 accent-machine" />
        사용 안 함 포함
      </label>
    </>
  );
}
