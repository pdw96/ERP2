-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 메뉴 「라우팅」의 데이터 쪽. 표 · 칸은 0021 이 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 품목 · 공정 · 작업장은 0016 · 0018 과 샘플 품목에 기댄다 — 라우팅은 품목이 있고 반제품 · 완제품이며 「사용」이고, 그 품목의 샘플 줄이 하나도 빠짐없이
-- 맞는(공정 코드가 있고, 작업장 코드가 있으며 그 작업장이 그 줄 공정의 것인) 품목에만 넣는다. 한 줄이라도 안 맞으면 그 품목은 머리부터 넣지 않는다
-- (줄이 빠진 라우팅이 남지 않게).
-- 값은 src/db/sample.ts 의 SAMPLE_ROUTINGS 와 같다(시험이 견준다). 순번(seq)은 줄 순서대로 10 · 20 · 30 …, 개당 작업시간은 정수 밀리초(0.300 초 → 300)다.
-- 라우팅이 이미 있는 품목(방문자가 먼저 만든 것 · 이미 이 SQL 이 넣은 것)은 건너뛴다 — 머리를 이번에 넣은 품목에만 줄 · 자재를 잇는다(INSERT 의 RETURNING).
-- 그래서 다시 돌려도 아무것도 바뀌지 않는다. 자재는 품목이 있고 그 순번의 줄이 선 것만 넣는다. 고친 이력은 넣지 않는다(샘플의 시작점이다).
WITH v(item_code, seq, process_code, work_center_code, setup_min, run_ms, note) AS (
  VALUES
    ('SF-0001', 10, 'BG', 'BG-1', 30, 300, ''),
    ('SF-0001', 20, 'SAW', 'SAW-1', 20, 450, ''),
    ('SF-0001', 30, 'DA', 'DA-1', 15, 600, ''),
    ('SF-0002', 10, 'WB', 'WB-1', 20, 2400, ''),
    ('SF-0002', 20, 'MD', 'MD-1', 30, 120, ''),
    ('FG-0001', 10, 'MK', 'MK-1', 10, 80, ''),
    ('FG-0001', 20, 'FT', 'FT-1', 15, 250, '테이핑 · 포장 포함'),
    ('FG-0002', 10, 'BG', 'BG-1', 30, 300, ''),
    ('FG-0002', 20, 'SAW', 'SAW-1', 20, 450, ''),
    ('FG-0002', 30, 'DA', 'DA-2', 15, 700, ''),
    ('FG-0002', 40, 'WB', 'WB-2', 25, 4800, ''),
    ('FG-0002', 50, 'MD', 'MD-1', 30, 150, ''),
    ('FG-0002', 60, 'MK', 'MK-1', 10, 80, ''),
    ('FG-0002', 70, 'FT', 'FT-1', 20, 400, '')
), resolved AS (
  SELECT v.item_code, v.seq, p."id" AS process_id, w."id" AS work_center_id, v.setup_min, v.run_ms, v.note
  FROM v
  LEFT JOIN "processes" p ON p."code" = v.process_code
  LEFT JOIN "work_centers" w ON w."code" = v.work_center_code AND w."process_id" = p."id"
), ready AS (
  SELECT item_code FROM resolved GROUP BY item_code HAVING bool_and(work_center_id IS NOT NULL)
), heads AS (
  INSERT INTO "routings" ("item_id")
  SELECT i."id"
  FROM "items" i
  JOIN ready r ON r.item_code = i."code"
  WHERE i."item_type" IN ('SF', 'FG')
    AND i."active"
    AND EXISTS (SELECT 1 FROM "code_groups")
    AND NOT EXISTS (SELECT 1 FROM "routings" x WHERE x."item_id" = i."id")
  ORDER BY i."id"
  ON CONFLICT ("item_id") DO NOTHING
  RETURNING "id", "item_id"
), steps AS (
  INSERT INTO "routing_steps" ("routing_id", "seq", "process_id", "work_center_id", "setup_min", "run_ms", "note")
  SELECT h."id", r.seq, r.process_id, r.work_center_id, r.setup_min, r.run_ms, r.note
  FROM resolved r
  JOIN "items" i ON i."code" = r.item_code
  JOIN heads h ON h."item_id" = i."id"
  ORDER BY h."id", r.seq
  RETURNING "routing_id", "seq"
)
INSERT INTO "routing_materials" ("routing_id", "seq", "item_id")
SELECT h."id", s."seq", m."id"
FROM (VALUES
    (1, 'SF-0001', 10, 'RM-0001'),
    (2, 'SF-0001', 30, 'RM-0002'),
    (3, 'SF-0001', 30, 'RM-0005'),
    (4, 'SF-0002', 10, 'SF-0001'),
    (5, 'SF-0002', 10, 'RM-0003'),
    (6, 'SF-0002', 20, 'RM-0004'),
    (7, 'FG-0001', 10, 'SF-0002'),
    (8, 'FG-0001', 20, 'SM-0001'),
    (9, 'FG-0001', 20, 'SM-0002'),
    (10, 'FG-0002', 30, 'RM-0006'),
    (11, 'FG-0002', 30, 'RM-0005'),
    (12, 'FG-0002', 40, 'RM-0003'),
    (13, 'FG-0002', 50, 'RM-0004'),
    (14, 'FG-0002', 70, 'SM-0002')
) AS v(n, item_code, seq, material_code)
JOIN "items" i ON i."code" = v.item_code
JOIN heads h ON h."item_id" = i."id"
JOIN steps s ON s."routing_id" = h."id" AND s."seq" = v.seq
JOIN "items" m ON m."code" = v.material_code
ORDER BY h."id", v.n
ON CONFLICT ("routing_id", "item_id") DO NOTHING;
