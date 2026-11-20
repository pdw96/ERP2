-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 메뉴 「MPS」의 데이터 쪽. 표 · 칸은 0026 이 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 품목은 샘플 품목에 기댄다 — 품목이 「사용」 완제품일 때만 넣는다.
-- 그 품목의 고정 칸이 이미 하나라도 있으면(방문자가 먼저 고정한 것 · 이미 이 SQL 이 넣은 것) 그 줄은 건너뛴다. 그래서 다시 돌려도 바뀌지 않는다.
-- 값은 src/db/sample.ts 의 SAMPLE_MPS_FIXED 와 같다(시험이 견준다). 주는 SQL 을 돌린 날의 한국 시각이 든 주의 월요일에서 offset 주를 센다
-- (date_trunc('week', …) 는 월요일 시작이다). 고정한 일시는 돌린 때다. 고친 이력은 넣지 않는다(샘플의 시작점이다).
INSERT INTO "mps_fixed" ("item_id", "week_start", "qty", "fixed_at")
SELECT i."id", (date_trunc('week', now() AT TIME ZONE 'Asia/Seoul'))::date + v.week_offset * 7, v.qty, now()
FROM (
  VALUES
    ('FG-0001', 0, 1000),
    ('FG-0001', 1, 1000)
) AS v(item_code, week_offset, qty)
JOIN "items" i ON i."code" = v.item_code AND i."item_type" = 'FG' AND i."active"
WHERE EXISTS (SELECT 1 FROM "code_groups")
  AND NOT EXISTS (SELECT 1 FROM "mps_fixed" x WHERE x."item_id" = i."id")
ORDER BY i."id", v.week_offset
ON CONFLICT ("item_id", "week_start") DO NOTHING;
