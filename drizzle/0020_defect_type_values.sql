-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 메뉴 「불량 유형」의 데이터 쪽. 표 · 칸은 0019 가 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 값은 src/db/sample.ts 의 DEFECT_CLS 묶음 · 값과 SAMPLE_DEFECT_TYPES 와 같다(시험이 견준다). 순번(n)으로 VALUES 의 차례대로 넣어 id 순서가 샘플 순서와 같다.
-- 다시 돌려도, 방문자가 같은 코드로 먼저 등록해 둔 불량 유형이 있어도 건드리지 않는다(ON CONFLICT DO NOTHING). 발생 공정은 이번에 넣은 불량 유형에만
-- 잇는다(INSERT 의 RETURNING) — 방문자가 먼저 만든 같은 코드의 불량 유형에는 잇기를 더하지 않는다. 공정은 코드로 가리켜 id 로 잇는다(공정은 0016 이 넣었다).
INSERT INTO "code_groups" ("code", "name", "is_system")
SELECT 'DEFECT_CLS', '불량 대분류', false
WHERE EXISTS (SELECT 1 FROM "code_groups")
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "codes" ("group_code", "code", "name", "sort_order")
SELECT v.group_code, v.code, v.name, v.sort_order
FROM (VALUES
  ('DEFECT_CLS', 'APPEAR', '외관', 10), ('DEFECT_CLS', 'DIM', '치수', 20),
  ('DEFECT_CLS', 'BOND', '접합', 30), ('DEFECT_CLS', 'ELEC', '전기 특성', 40)
) AS v(group_code, code, name, sort_order)
WHERE EXISTS (SELECT 1 FROM "code_groups" g WHERE g."code" = v.group_code)
ORDER BY v.sort_order
ON CONFLICT ("group_code", "code") DO NOTHING;--> statement-breakpoint
WITH ins AS (
  INSERT INTO "defect_types" ("code", "name", "cls", "note")
  SELECT v.code, v.name, v.cls, v.note
  FROM (VALUES
    (1, 'CHIP', '칩핑', 'APPEAR', ''),
    (2, 'CRACK', '다이 크랙', 'APPEAR', ''),
    (3, 'SCRATCH', '긁힘', 'APPEAR', ''),
    (4, 'FM', '이물', 'APPEAR', ''),
    (5, 'THK-OUT', '두께 벗어남', 'DIM', ''),
    (6, 'DA-VOID', '접착 보이드', 'BOND', ''),
    (7, 'DA-TILT', '다이 기울어짐', 'DIM', ''),
    (8, 'WIRE-BRK', '와이어 끊어짐', 'BOND', ''),
    (9, 'BALL-LIFT', '볼 들뜸', 'BOND', ''),
    (10, 'WIRE-SWP', '와이어 휨', 'DIM', ''),
    (11, 'MD-VOID', '몰드 기포', 'APPEAR', ''),
    (12, 'MK-ERR', '마킹 불량', 'APPEAR', ''),
    (13, 'OPEN', '오픈', 'ELEC', ''),
    (14, 'SHORT', '쇼트', 'ELEC', '')
  ) AS v(n, code, name, cls, note)
  JOIN "codes" c ON c."group_code" = 'DEFECT_CLS' AND c."code" = v.cls
  WHERE EXISTS (SELECT 1 FROM "code_groups")
  ORDER BY v.n
  ON CONFLICT ("code") DO NOTHING
  RETURNING "id", "code"
)
INSERT INTO "defect_type_processes" ("defect_type_id", "process_id")
SELECT ins.id, p.id
FROM ins
JOIN (VALUES
  ('CHIP', 'SAW'),
  ('CRACK', 'BG'), ('CRACK', 'SAW'), ('CRACK', 'DA'),
  ('THK-OUT', 'BG'),
  ('DA-VOID', 'DA'),
  ('DA-TILT', 'DA'),
  ('WIRE-BRK', 'WB'),
  ('BALL-LIFT', 'WB'),
  ('WIRE-SWP', 'WB'), ('WIRE-SWP', 'MD'),
  ('MD-VOID', 'MD'),
  ('MK-ERR', 'MK'),
  ('OPEN', 'FT'),
  ('SHORT', 'FT')
) AS l(defect_code, process_code) ON l.defect_code = ins.code
JOIN "processes" p ON p."code" = l.process_code
ON CONFLICT DO NOTHING;
