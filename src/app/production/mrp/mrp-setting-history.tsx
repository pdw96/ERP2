import { MRP_SETTING_HISTORY_SHOWN, type MrpSettingChange } from "@/db/mrp";
import { WEEKDAY_NAMES } from "@/lib/mrp-calc";

// 완성일 기준 요일을 바꾼 이력(메뉴 「MRP」) — 최근 것부터 「일시 · 전 → 후」 한 줄씩, 20줄까지. 일시는 한국 시각.
// 이력이 없으면 그리지 않는다. 누가 바꿨는지는 아직 남지 않는다 — 로그인이 생긴 뒤. 읽기만 한다.

const KST_MINUTE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 한국 시각의 「YYYY-MM-DD HH:mm」 — 마지막 실행 일시 · 이력의 일시. */
export function koreaMinute(at: Date): string {
  const part = Object.fromEntries(KST_MINUTE.formatToParts(at).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}

/** 1(월) ~ 7(일) 의 이름. */
const weekdayName = (n: number) => WEEKDAY_NAMES[n - 1] ?? String(n);

export function MrpSettingHistory({ changes, total }: { changes: MrpSettingChange[]; total: number }) {
  if (changes.length === 0) return null;
  return (
    <section className="mt-10 border-t border-rule pt-4" aria-labelledby="mrp-setting-history">
      <h2 id="mrp-setting-history" className="font-semibold">
        완성일 기준 요일을 바꾼 이력
      </h2>
      <p className="text-sm text-muted">바꿀 때마다 한 줄씩 남습니다(최근 것부터). 일시는 한국 시각입니다.</p>
      {total > MRP_SETTING_HISTORY_SHOWN && (
        <p className="mt-1 text-sm">
          최근 {MRP_SETTING_HISTORY_SHOWN}줄만 보입니다(전체 {total.toLocaleString("ko-KR")}줄)
        </p>
      )}
      <ul className="mt-2 grid gap-1 text-sm tabular-nums">
        {changes.map((c, i) => (
          <li key={i}>
            <span className="text-muted">{koreaMinute(c.changedAt)}</span> · {weekdayName(c.before)} →{" "}
            {weekdayName(c.after)}
          </li>
        ))}
      </ul>
    </section>
  );
}
