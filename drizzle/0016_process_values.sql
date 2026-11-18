-- 손으로 쓴 마이그레이션(drizzle-kit generate --custom) — 메뉴 「공정 등록」(ADR 0031)의 데이터 쪽. 표 · 칸은 0015 가 만든다.
-- 데이터가 있는 DB(운영 · 미리보기 분기)에만 넣는다 — 빈 DB 는 배포 빌드가 「묶음 0 행」을 보고 샘플 전체를 넣는다(src/db/deploy.ts).
-- 값은 src/db/sample.ts 의 SAMPLE_PROCESSES 와 같다(시험이 견준다). 다시 돌려도, 방문자가 같은 코드로 먼저 등록해 둔 공정이 있어도
-- 건드리지 않는다(ON CONFLICT DO NOTHING).
INSERT INTO "processes" ("code", "name", "note")
SELECT v.code, v.name, v.note
FROM (VALUES
  ('BG', '웨이퍼 연삭', '웨이퍼 뒷면을 깎아 두께를 맞춘다'),
  ('SAW', '쏘잉', '웨이퍼를 칩 단위로 자른다'),
  ('DA', '다이 본딩', '칩을 리드프레임에 붙인다'),
  ('WB', '와이어 본딩', '칩과 리드를 금 와이어로 잇는다'),
  ('MD', '몰딩', '에폭시 몰딩 컴파운드로 감싼다'),
  ('MK', '마킹', '제품 윗면에 품명 · LOT 를 새긴다'),
  ('FT', '최종 검사', '전기 특성과 겉모양을 검사한다')
) AS v(code, name, note)
WHERE EXISTS (SELECT 1 FROM "code_groups")
ON CONFLICT ("code") DO NOTHING;
