import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { withDb } from "@/db/request";
import { listRecentMoves, moveFormOptions } from "@/db/stock";
import type { MoveMenu } from "@/lib/move-menus";
import { koreaToday } from "@/lib/today";
import { MoveEntry } from "./move-entry";
import { MoveList } from "./move-list";

// 재고 › 수불관리 › 등록 메뉴 하나 — 바로 입력이고, 그 아래 그 수불구분의 최근 전표(ADR 0020). 메뉴 넷의 page.tsx 가 이것을 부른다.
// 거르기 · 기간으로 보는 것은 메뉴 「수불 이력」이 든다.
export function MoveEntryPage({ menu }: { menu: MoveMenu }) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/inventory" className="underline-offset-4 hover:underline">
          재고
        </Link>{" "}
        › 수불관리 › {menu.label}
      </p>
      <h1 className="mt-1 text-3xl leading-tight font-semibold">{menu.label}</h1>
      <p className="mt-1 max-w-3xl text-muted">
        {menu.note} 저장하면 바로 재고에 반영되고, 고치거나 지우지 않고 「취소」만 합니다. 전표번호는 일자의 다음 번호로
        붙습니다 — IV-YYYYMMDD-NNN.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <Entry menu={menu} />
      </Suspense>
    </section>
  );
}

async function Entry({ menu }: { menu: MoveMenu }) {
  await connection();
  let options, recent;
  try {
    [options, recent] = await withDb((db) => Promise.all([moveFormOptions(db), listRecentMoves(db, 20, menu.type)]));
  } catch (error) {
    return <LoadFailed what="입력 화면" error={error} />;
  }
  return (
    <>
      <MoveEntry options={options} today={koreaToday()} moveType={menu.type} />
      <div className="mt-10 max-w-5xl">
        <MoveList rows={recent} typeName={menu.label.replace(/ 등록$/, "")} />
      </div>
    </>
  );
}
