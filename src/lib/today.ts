// 한국 시각의 오늘(YYYY-MM-DD) — 수불 일자 · LOT 번호의 날짜가 기댄다(조각 「재고 수불」 설계 ② 「일자」). 서버의 시계는 UTC 다.
export function koreaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}
