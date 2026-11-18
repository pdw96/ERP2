-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 메뉴 「작업장 등록」(ADR 0032)의 데이터 쪽. 표 · 칸은 0017 이 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 값은 src/db/sample.ts 의 SAMPLE_WORK_CENTERS 와 같다(시험이 견준다). 공정은 코드로 가리켜 id 로 이어 넣고(공정은 0016 이 넣었다),
-- 순번(n)으로 VALUES 의 차례대로 넣어 id 순서가 샘플 순서와 같다. 다시 돌려도, 방문자가 같은 코드로 먼저 등록해 둔 작업장이 있어도
-- 건드리지 않는다(ON CONFLICT DO NOTHING).
INSERT INTO "work_centers" ("code", "name", "process_id", "note")
SELECT v.code, v.name, p.id, v.note
FROM (VALUES
  (1, 'BG-1', '연삭 1호기', 'BG', ''),
  (2, 'SAW-1', '쏘잉 1호기', 'SAW', ''),
  (3, 'DA-1', '다이 본딩 1라인', 'DA', ''),
  (4, 'DA-2', '다이 본딩 2라인', 'DA', ''),
  (5, 'WB-1', '와이어 본딩 1라인', 'WB', ''),
  (6, 'WB-2', '와이어 본딩 2라인', 'WB', ''),
  (7, 'MD-1', '몰딩 1호기', 'MD', ''),
  (8, 'MK-1', '레이저 마킹 1호기', 'MK', ''),
  (9, 'FT-1', '최종 검사 1라인', 'FT', '')
) AS v(n, code, name, process_code, note)
JOIN "processes" p ON p.code = v.process_code
WHERE EXISTS (SELECT 1 FROM "code_groups")
ORDER BY v.n
ON CONFLICT ("code") DO NOTHING;
