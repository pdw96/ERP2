import Link from "next/link";
import type { Code, CodeGroup, CodeGroupRow, UnitSpec } from "@/db/codes";
import { factorText } from "@/lib/code-fields";
import { eul } from "@/lib/josa";

// 공통코드 화면의 부품 — 묶음 표, 묶음 고르기, 값 표, 저장 뒤의 알림.

const badge = "rounded border px-1.5 py-0.5 text-xs whitespace-nowrap";

/** 가름 — 시스템 코드는 보이기만, 사용자 코드는 값을 더하고 고친다(ADR 0009). */
export function Kind({ system }: { system: boolean }) {
  return system ? (
    <span className={`${badge} border-machine bg-machine text-white`}>시스템 코드</span>
  ) : (
    <span className={`${badge} border-rule`}>사용자 코드</span>
  );
}

/** 묶음 표 — 공통코드의 첫 화면. 묶음 코드를 누르면 그 값이 보인다. */
export function GroupTable({ groups }: { groups: CodeGroupRow[] }) {
  return (
    <table className="mt-6 w-full border-collapse bg-white text-left">
      <caption className="sr-only">공통코드 묶음 목록</caption>
      <thead className="border-b-2 border-machine text-sm">
        <tr>
          <th scope="col" className="px-3 py-2">
            묶음
          </th>
          <th scope="col" className="px-3 py-2">
            이름
          </th>
          <th scope="col" className="px-3 py-2">
            가름
          </th>
          <th scope="col" className="px-3 py-2 text-right">
            값
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.code} className="border-b border-rule">
            <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
              <Link
                href={`/system/codes/${g.code}`}
                className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
              >
                {g.code}
              </Link>
            </td>
            <td className="px-3 py-2.5 font-semibold wrap-anywhere">{g.name}</td>
            <td className="px-3 py-2.5">
              <Kind system={g.isSystem} />
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{g.values}개</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 묶음 고르기 — 값 화면 위에서 다른 묶음으로 옮긴다. */
export function GroupPicker({ groups, current }: { groups: CodeGroupRow[]; current: string }) {
  return (
    <nav aria-label="공통코드 묶음" className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <li key={g.code}>
            <Link
              href={`/system/codes/${g.code}`}
              aria-current={g.code === current ? "page" : undefined}
              className="block rounded border border-rule bg-white px-3 py-1.5 text-sm hover:border-machine aria-[current=page]:border-machine aria-[current=page]:bg-machine aria-[current=page]:font-semibold aria-[current=page]:text-white"
            >
              <span className="font-mono">{g.code}</span> {g.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 값 표 — 「사용 안 함」까지 모두 보인다. 사용자 코드 묶음이면 코드가 수정 화면으로 가는 링크다.
 * 단위 묶음이면 specs 가 있고, 기준 단위 · 배수 · 소수 자릿수 칸이 더 보인다(ADR 0017).
 */
export function CodeTable({
  group,
  rows,
  savedCode,
  specs,
}: {
  group: CodeGroup;
  rows: Code[];
  savedCode?: string;
  specs?: Record<string, UnitSpec>;
}) {
  if (rows.length === 0) {
    return <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">값이 없습니다.</p>;
  }
  const inactive = rows.filter((r) => !r.active).length;
  return (
    <>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {rows.length}개{inactive ? ` · 사용 안 함 ${inactive}개 포함` : ""}
      </p>
      {/* 단위 묶음은 칸이 여섯이라 휴대폰 폭에서 옆으로 민다. */}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse bg-white text-left">
          <caption className="sr-only">{group.name} 값 목록</caption>
          <thead className="border-b-2 border-machine text-sm">
            <tr>
              <th scope="col" className="w-20 px-3 py-2 text-right">
                정렬 순서
              </th>
              <th scope="col" className="px-3 py-2">
                코드
              </th>
              <th scope="col" className="px-3 py-2">
                이름
              </th>
              {specs && (
                <>
                  <th scope="col" className="px-3 py-2">
                    기준 단위
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    배수
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    소수 자릿수
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className={`border-b border-rule align-top ${c.code === savedCode ? "bg-safety/15" : ""} ${
                  c.active ? "" : "text-muted"
                }`}
              >
                <td className="px-3 py-2.5 text-right tabular-nums">{c.sortOrder}</td>
                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
                  {group.isSystem ? (
                    <span className="font-semibold">{c.code}</span>
                  ) : (
                    <Link
                      href={`/system/codes/${group.code}/${c.code}`}
                      className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
                    >
                      {c.code}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2.5 wrap-anywhere">
                  <span className="font-semibold">{c.name}</span>
                  {!c.active && <span className={`ml-2 ${badge} border-rule`}>사용 안 함</span>}
                </td>
                {specs && <SpecCells spec={specs[c.code]} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 저장한 뒤 — 「BOX 상자를 저장했습니다」. 값 표는 「사용 안 함」까지 늘 보여 다시 보는 길을 알리지 않는다. */
export function SavedNotice({ code }: { code: Code }) {
  return (
    <div role="status" className="mt-6 border-l-4 border-safety bg-white px-5 py-3 wrap-anywhere">
      <p>
        <span className="font-mono font-semibold">{code.code}</span> {eul(code.name)} 저장했습니다.
        {!code.active && " 「사용 안 함」이라 새 입력의 목록에서 빠지고, 이미 쓴 곳에는 그대로 남습니다."}
      </p>
    </div>
  );
}

/** 단위 사양의 칸 셋 — 사양이 없으면(있어서는 안 된다) 비었다고 보인다. */
function SpecCells({ spec }: { spec?: UnitSpec }) {
  if (!spec)
    return (
      <td colSpan={3} className="px-3 py-2.5 text-sm text-muted">
        사양 없음
      </td>
    );
  return (
    <>
      <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">{spec.baseUnit}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{factorText(spec.factor)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{spec.decimals}</td>
    </>
  );
}
