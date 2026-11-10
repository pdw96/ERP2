# 감사 브리핑

- 만든 시각: 2026-11-10 06:01:46 UTC
- 기준: `3e7977a` = `3e7977a` (2026-11-05 Merge pull request #23 from pdw96/claude/great-gauss-pciga8), 머지 베이스 `3e7977a5002269b4216d776a9d7d38b98204d156`
- 대상: `6469405` (브랜치 `claude/compassionate-keller-lu068h`). origin/main `26e3a9a` 위에 감사 브리핑 · 회차 기록 · 대장 커밋만 더한 것이라 코드는 `26e3a9a` 와 같다
- 커밋 안 된 변경: 없음
- 추적 안 된 파일: 없음
- 자름: 있음 — diff 전체 31189줄 중 3745줄. 담은 것은 **고친(M) 파일 가운데 시험 · `drizzle/meta/` 를 뺀 41개**의 diff 를 통째로. 새로 생긴(A) 파일과 고친 시험 · drizzle meta 는 본문을 담지 않았다 — 대상이 지금 HEAD 라 감사자가 작업트리에서 그대로 읽으면 된다(새 파일은 diff 가 곧 지금 내용이다). 목록은 「이 브리핑이 담지 않은 것」
- 대장: `docs/audit/nc-ledger.md` · `docs/audit/nc-ledger-history.md` 는 diff 에서 뺐다(지난 기록으로 따로 읽는다)
- 검사: PASS (verify-brief.py, --exclude docs/audit/nc-ledger.md --exclude docs/audit/nc-ledger-history.md)

## 변경 파일

```
 INTENT.md                                                                        |    2 +-
 docs/adr/0015-stock-calculation-rules.md                                         |  102 +++++
 docs/adr/0016-stock-numbers-and-codes.md                                         |   72 ++++
 docs/adr/0017-unit-base-factor-decimals.md                                       |   45 +++
 docs/adr/0018-stock-storage.md                                                   |   39 ++
 docs/adr/0019-item-types-sub-material-consumable.md                              |   45 +++
 docs/adr/0020-stock-move-entry-menus.md                                          |   60 +++
 docs/adr/0021-stock-count-rules.md                                               |   50 +++
 docs/architecture.md                                                             |   21 +-
 docs/deploy.md                                                                   |    2 +-
 docs/master-plan.md                                                              |   22 +-
 docs/schema.md                                                                   |   81 +++-
 "docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md"       |  589 +++++++++++++++++++++++++++
 "docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/requirements.md" |   94 +++++
 drizzle/0005_unit_specs.sql                                                      |   19 +
 drizzle/0006_unit_spec_values.sql                                                |   24 ++
 drizzle/0007_number_rules.sql                                                    |   48 +++
 drizzle/0008_number_rule_values.sql                                              |   55 +++
 drizzle/0009_default_warehouse_not_defect.sql                                    |   16 +
 drizzle/0010_stock_move_codes.sql                                                |   20 +
 drizzle/0011_stock_moves.sql                                                     |   81 ++++
 drizzle/0012_stock_counts.sql                                                    |   48 +++
 drizzle/meta/0005_snapshot.json                                                  | 1030 ++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0006_snapshot.json                                                  | 1030 ++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0007_snapshot.json                                                  | 1344 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0008_snapshot.json                                                  | 1344 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0009_snapshot.json                                                  | 1367 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0010_snapshot.json                                                  | 1367 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0011_snapshot.json                                                  | 2041 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/0012_snapshot.json                                                  | 2379 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 drizzle/meta/_journal.json                                                       |   56 +++
 src/app/design/model/page.tsx                                                    |    4 +-
 src/app/inventory/adjustments/page.tsx                                           |   12 +
 src/app/inventory/counts/[code]/page.tsx                                         |  198 ++++++++++
 src/app/inventory/counts/__tests__/count-entry.test.tsx                          |  106 +++++
 src/app/inventory/counts/actions.ts                                              |   78 ++++
 src/app/inventory/counts/confirm-panel.tsx                                       |  177 +++++++++
 src/app/inventory/counts/count-entry.tsx                                         |   98 +++++
 src/app/inventory/counts/count-form.tsx                                          |  412 +++++++++++++++++++
 src/app/inventory/counts/count-list.tsx                                          |  100 +++++
 src/app/inventory/counts/page.tsx                                                |   65 +++
 src/app/inventory/history/page.tsx                                               |  239 +++++++++++
 src/app/inventory/issues/page.tsx                                                |   12 +
 src/app/inventory/ledger/[code]/page.tsx                                         |  185 +++++++++
 src/app/inventory/ledger/page.tsx                                                |  201 ++++++++++
 src/app/inventory/moves/[code]/page.tsx                                          |  183 +++++++++
 src/app/inventory/moves/__tests__/actions.test.ts                                |   76 ++++
 src/app/inventory/moves/__tests__/menus.test.ts                                  |   34 ++
 src/app/inventory/moves/__tests__/move-form.test.tsx                             |  273 +++++++++++++
 src/app/inventory/moves/actions.ts                                               |   75 ++++
 src/app/inventory/moves/cancel-move.tsx                                          |   53 +++
 src/app/inventory/moves/move-entry-page.tsx                                      |   51 +++
 src/app/inventory/moves/move-entry.tsx                                           |   58 +++
 src/app/inventory/moves/move-form.tsx                                            |  616 +++++++++++++++++++++++++++++
 src/app/inventory/moves/move-list.tsx                                            |   75 ++++
 src/app/inventory/moves/new/page.tsx                                             |    7 +
 src/app/inventory/moves/page.tsx                                                 |    7 +
 src/app/inventory/moves/stock-panel.tsx                                          |  219 +++++++++++
 src/app/inventory/receipts/page.tsx                                              |   12 +
 src/app/inventory/transfers/page.tsx                                             |   12 +
 src/app/inventory/warehouses/[code]/page.tsx                                     |    6 +-
 src/app/inventory/warehouses/__tests__/warehouse-screens.test.tsx                |   44 +++
 src/app/inventory/warehouses/new/page.tsx                                        |    7 +-
 src/app/inventory/warehouses/warehouse-form.tsx                                  |   28 +-
 src/app/inventory/warehouses/warehouse-list.tsx                                  |    5 +
 src/app/master/items/[code]/page.tsx                                             |   27 +-
 src/app/master/items/__tests__/item-form.test.tsx                                |  175 ++++++++-
 src/app/master/items/__tests__/item-inquiry.test.tsx                             |   37 +-
 src/app/master/items/__tests__/item-list.test.tsx                                |    5 +
 src/app/master/items/inquiry/item-inquiry.tsx                                    |   20 +-
 src/app/master/items/inquiry/page.tsx                                            |    6 +-
 src/app/master/items/item-form.tsx                                               |  148 +++++--
 src/app/master/items/new/page.tsx                                                |   14 +-
 src/app/master/items/sheet/page.tsx                                              |    8 +-
 src/app/system/codes/[group]/[code]/page.tsx                                     |   16 +-
 src/app/system/codes/[group]/new/page.tsx                                        |   16 +-
 src/app/system/codes/[group]/page.tsx                                            |   21 +-
 src/app/system/codes/__tests__/code-screens.test.tsx                             |   99 +++++
 src/app/system/codes/code-form.tsx                                               |  105 ++++-
 src/app/system/codes/code-list.tsx                                               |  140 ++++---
 src/app/system/number-rules/[code]/page.tsx                                      |   61 +++
 src/app/system/number-rules/__tests__/number-rule-screens.test.tsx               |  172 ++++++++
 src/app/system/number-rules/actions.ts                                           |   50 +++
 src/app/system/number-rules/crumbs.tsx                                           |   23 ++
 src/app/system/number-rules/new/page.tsx                                         |   29 ++
 src/app/system/number-rules/not-found.tsx                                        |   13 +
 src/app/system/number-rules/number-rule-form.tsx                                 |  250 ++++++++++++
 src/app/system/number-rules/number-rule-list.tsx                                 |   95 +++++
 src/app/system/number-rules/page.tsx                                             |   62 +++
 src/components/__tests__/module-home.test.tsx                                    |   17 +-
 src/components/__tests__/sheet-grid.test.tsx                                     |    6 +-
 src/components/__tests__/sidebar.test.tsx                                        |   65 ++-
 src/components/__tests__/sort-pager.test.tsx                                     |   71 ++++
 src/components/form-parts.tsx                                                    |   26 ++
 src/components/menu-hint.tsx                                                     |   40 ++
 src/components/sidebar.tsx                                                       |    6 +-
 src/components/sort-pager.tsx                                                    |  199 ++++++++++
 src/content/__tests__/diagrams.test.ts                                           |   30 +-
 src/content/diagrams.ts                                                          |  177 ++++++---
 src/db/__tests__/codes.test.ts                                                   |   41 +-
 src/db/__tests__/deploy.test.ts                                                  |  381 +++++++++++++++++-
 src/db/__tests__/descriptive.test.ts                                             |   24 +-
 src/db/__tests__/inquiry.test.ts                                                 |    3 +-
 src/db/__tests__/item-stock.test.ts                                              |  409 +++++++++++++++++++
 src/db/__tests__/items.test.ts                                                   |   36 +-
 src/db/__tests__/number-rules.test.ts                                            |  344 ++++++++++++++++
 src/db/__tests__/pglite.ts                                                       |   13 +
 src/db/__tests__/reset.test.ts                                                   |   84 +++-
 src/db/__tests__/sample.test.ts                                                  |   67 +++-
 src/db/__tests__/schema.test.ts                                                  |   18 +-
 src/db/__tests__/sheet-edit.test.ts                                              |   10 +-
 src/db/__tests__/sheet.test.ts                                                   |   13 +-
 src/db/__tests__/stock-counts.test.ts                                            |  677 ++++++++++++++++++++++++++++++++
 src/db/__tests__/stock-history.test.ts                                           |  424 ++++++++++++++++++++
 src/db/__tests__/stock.test.ts                                                   |  707 +++++++++++++++++++++++++++++++++
 src/db/__tests__/units.test.ts                                                   |  215 ++++++++++
 src/db/__tests__/warehouses.test.ts                                              |   11 +-
 src/db/codes.ts                                                                  |  129 +++++-
 src/db/items.ts                                                                  |  221 +++++++++--
 src/db/master-shared.ts                                                          |    3 +
 src/db/number-rules.ts                                                           |  224 +++++++++++
 src/db/numbering.ts                                                              |    2 +
 src/db/reset.ts                                                                  |  180 ++++++++-
 src/db/sample.ts                                                                 |  245 +++++++++++-
 src/db/schema.ts                                                                 |  384 +++++++++++++++++-
 src/db/stock-counts.ts                                                           |  837 +++++++++++++++++++++++++++++++++++++++
 src/db/stock-history.ts                                                          |  415 ++++++++++++++++++++
 src/db/stock.ts                                                                  | 1005 +++++++++++++++++++++++++++++++++++++++++++++++
 src/db/warehouses.ts                                                             |   58 ++-
 src/lib/__tests__/count-input.test.ts                                            |  109 +++++
 src/lib/__tests__/item-input.test.ts                                             |    4 +
 src/lib/__tests__/move-input.test.ts                                             |   89 +++++
 src/lib/__tests__/number-rule.test.ts                                            |  223 +++++++++++
 src/lib/__tests__/sheet-input.test.ts                                            |   27 +-
 src/lib/__tests__/sheet.test.ts                                                  |   10 +-
 src/lib/__tests__/unit-input.test.ts                                             |   72 ++++
 src/lib/__tests__/warehouse-input.test.ts                                        |   12 +-
 src/lib/areas.ts                                                                 |   15 +-
 src/lib/code-fields.ts                                                           |    9 +-
 src/lib/count-input.ts                                                           |  137 +++++++
 src/lib/item-fields.ts                                                           |    5 +
 src/lib/item-input.ts                                                            |   41 +-
 src/lib/item-stock.ts                                                            |   69 ++++
 src/lib/master-codes.ts                                                          |   54 ++-
 src/lib/move-input.ts                                                            |  204 ++++++++++
 src/lib/move-menus.ts                                                            |   44 +++
 src/lib/number-rule-fields.ts                                                    |   69 ++++
 src/lib/number-rule-input.ts                                                     |  134 +++++++
 src/lib/sheet-columns.ts                                                         |   36 +-
 src/lib/sheet-input.ts                                                           |   88 +++--
 src/lib/stock-query.ts                                                           |  206 ++++++++++
 src/lib/today.ts                                                                 |    4 +
 src/lib/unit-input.ts                                                            |   89 +++++
 src/lib/warehouse-fields.ts                                                      |    2 +-
 src/lib/warehouse-input.ts                                                       |   16 +-
 155 files changed, 27926 insertions(+), 472 deletions(-)
```

## 커밋

```
6469405 감사 회차 23(audit-data) — 조각 「재고 수불」 닫기 전, NC-18 · NC-19 등록(저자 판정 대기)
1294727 감사 브리핑 — 조각 「재고 수불」 닫기 전 감사 회차(3e7977a…26e3a9a)
26e3a9a Merge pull request #35 from pdw96/claude/compassionate-keller-lu068h
16c00d4 리뷰 1회차 — 창고를 바꾸면 확정 화면을 새로, 작성 중 실사의 수량을 기준정보의 고침이 지킨다, 확정의 LOT 저절로가 실사의 다른 줄 LOT 를 건너뜀, 더한 줄의 장부
1204661 조각 「재고 수불」 PR E — 재고 실사(열기 · 작성 중 저장 · 취소 · 확정 · 실사 차이 전표)
53ae030 Merge pull request #34 from pdw96/claude/compassionate-keller-lu068h
ef32944 조각 「재고 수불」 PR E 를 열기 전에 정한 것 — 줄 상한 · 장부 보임 · 빈 실물 수량 · 줄 밖 재고 · 취소 · 첫 화면 · 실사 차이 · 샘플 실사
06d391a Merge pull request #33 from pdw96/claude/compassionate-keller-lu068h
13cfb10 리뷰 1회차 — 쓰지 않은 빈 줄에 머리의 창고를 붙이지 않고, 100줄을 넘게 고르면 남은 자리만 넣는다
a8c271d ADR 0020 · 설계 — 메뉴 넷을 다시 따져 보고 지킨 것은 저자 판정(PR 검토)
07b2771 출고 · 이동 · 조정은 머리에서 창고를 고르고 그 창고의 현재고를 보며 줄로 넣는다(저자 판정, PR 검토)
ad631ec 조각 「재고 수불」 PR F — 등록 메뉴 넷(기타입고 · 기타출고 · 재고이동 · 재고조정 등록)
8630015 Merge pull request #32 from pdw96/claude/compassionate-keller-lu068h
91c1794 조각 「재고 수불」 PR F 를 열기 전에 정한 것 — 메뉴 차례 · 첫 화면 · 최근 전표
5fedc80 Merge pull request #31 from pdw96/claude/epic-noether-530m2f
a17bc7a 설계 — 수불 이력의 취소 전표를 원래 칸의 마이너스로 보이는 것은 저자 판정(PR 검토)
7551d71 수불 이력의 「수량」을 입고수량 · 출고수량으로(저자 판정, PR 검토)
e8d6dd6 수불 화면의 업무 용어를 ERP 말로 — 수불일자 · 전표번호 · 수불구분 · 출고창고 · 입고창고 · 기초재고 · 기말재고 따위(저자 판정, PR 검토)
7d945be 수불 이력 · 수불부 — 줄이 없어도 표 머리 · 화살표를 보이고, 다른 칸에 흐린 ↕(저자 판정, PR 검토)
6c28aba 수불부의 「어떻게 셌는지」 글을 표 위 「모두 N품목」 줄로(저자 판정, PR 검토)
1b8d3f6 PR D 문서 — architecture.md · deploy.md · 설계 「PR D 에서 정한 것」
f9269d3 조각 「재고 수불」 PR D — 수불 이력 · 수불부, 칸 머리로 세우기 · 100줄씩
36ed2d2 Merge pull request #30 from pdw96/claude/epic-noether-530m2f
3acfef9 수불부의 품목별 목록에도 칸 머리 정렬(저자 판정, PR 검토)
119ea25 수불 이력의 차례 바꾸기를 칸 머리 누르기로 — 어느 칸이든 ▲ · ▼(저자 판정, PR 검토)
d7b8ce4 수불 이력의 차례 바꾸기 — 「오래된 것부터 / 최신부터」(저자 판정, PR 검토)
c9a6102 조각 「재고 수불」 PR D 를 열기 전에 정한 것 — 기간 기본값 · 이력의 줄 차례 · 칸 순서 · 수불부의 모양
e087994 Merge pull request #29 from pdw96/claude/cool-cori-st30iq
ff68fcb 리뷰 2회차 — 단위 수정도 재고 잠금을 표보다 먼저 쥔다
4667215 리뷰 1회차 — 취소 전표의 줄을 거꾸로 된 차례로 남긴다
f65350e 리뷰 1회차 — 매일 밤 되돌림이 재고 잠금을 먼저 쥔다(수불 저장과 같은 차례)
5a3a71c PR C 문서 — schema.md · architecture.md · deploy.md · 설계도(이 조각의 테이블 · 모듈별 지도) · 설계 「PR C 에서 정한 것」
c06b65f PR C 시험 — 재고 계산(R1 ~ R3) · 꼴 검사 · 입구 로그 · 수불 등록 화면, 기존 시험을 새 표 · 막음에 맞춤
43f51bb 조각 「재고 수불」 PR C — 수불 등록 · 취소, 재고 계산, 샘플 수불
89f53fa Merge pull request #28 from pdw96/claude/cool-cori-st30iq
7b5cac0 조각 「재고 수불」 PR C 를 열기 전에 정한 것 — 샘플 수불 · 이동의 미리 채움 · 줄 입력 · 음수 검사 · 등록 상한
5ac428b Merge pull request #27 from pdw96/claude/blissful-bohr-hse4zy
8378403 마이그레이션 0007 을 되돌리고 0009 로 덧붙임 — 이미 0007 이 적용된 DB(미리보기)에서 빌드가 멈췄다
7be4075 리뷰 1회차 — 불량창고 표시와 품목 기본 창고를 DB 가 막고, 기본 규칙 옮기기를 잠금 안에서
e9d3c56 PR B 문서 — schema.md · architecture.md · 설계도(번호 규칙 · 품목의 재고 칸) · 설계 「PR B 에서 정한 것」
e642ddf PR B 시험 — 번호 규칙 · LOT 번호 · 품목의 재고 칸 · 부자재 · 소모품 · 불량창고 · 마이그레이션 0007 · 0008
976a0e5 조각 「재고 수불」 PR B (진행) — 번호 규칙 · 품목의 재고 칸 · 불량창고 · 부자재 · 소모품
e22b720 Merge pull request #26 from pdw96/claude/blissful-bohr-hse4zy
03f3234 조각 「재고 수불」 PR B 를 열기 전에 정한 것 — 기본 창고 · 샘플 부자재 · 소모품 · 대분류 · 번호 규칙 셋
36f4c83 Merge pull request #25 from pdw96/claude/zealous-bell-se4a0l
47e97f0 단위 사양 — 배수는 정수 아홉 자리 · 소수 여섯째 자리까지(리뷰 1회차)
47dddc6 단위 사양 — 기준 단위를 「자신」 대신 같은 단위 코드로 보인다(저자 요청)
c5dd916 조각 「재고 수불」 PR A — 단위 사양(기준 단위 · 배수 · 소수 자릿수)
14e4b23 Merge pull request #24 from pdw96/claude/zealous-bell-se4a0l
d51cc78 사 오는 품목은 거래처 LOT 를 반드시, 품목 유형에 부자재 · 소모품 — ADR 0019 (저자 판정, 착공 PR 검토)
5ab86fe LOT 번호 규칙에 구분자 칸 — 없음 · - · _ · . (저자 판정, 착공 PR 검토)
3352442 조각 「재고 수불」 착공 — 요구사항 · 설계 · ADR 0015 ~ 0018
```

## diff

```diff
diff --git a/INTENT.md b/INTENT.md
index 996432b..a299f3a 100644
--- a/INTENT.md
+++ b/INTENT.md
@@ -16,7 +16,7 @@
 - 재고 · 생산은 저자가 잘 아는 영역이라 가장 깊게 만든다 — 품목 · 창고 기준정보, 재고 수불과 현황, BOM, MPS(주생산계획) ·
   MRP(자재소요계획), 라우팅 · 능력계획(CRP), 작업지시, 생산실적, LOT 추적.
 - 회계 · 인사는 일반적인 ERP 의 흐름을 추천안으로 받아 저자가 정한다.
-- 영역을 받치는 「시스템 관리」 — 공통코드(Major · Minor), 회사 · 조직, 사용자 · 권한.
+- 영역을 받치는 「시스템 관리」 — 공통코드(Major · Minor) · 번호 규칙, 회사 · 조직, 사용자 · 권한.
 - 보는 사람(채용 담당자)이 샘플 데이터로 써 볼 수 있는 배포된 데모와, 코드 · 문서를 보는 레포.
 - 업무 조각이 끝날 때마다 그 영역의 샘플 데이터가 데모에 들어가, 영역 사이로 데이터가 흘러가는 것이 데모에서 보인다.
 - 구축 과정을 AI 도구로 하고, 그 과정(조각 문서 · PR · 리뷰 · 감사 기록)이 레포에 남아 사람이 무엇을 정했는지 보인다.
diff --git a/docs/architecture.md b/docs/architecture.md
index 36d6fdd..04cc5ab 100644
--- a/docs/architecture.md
+++ b/docs/architecture.md
@@ -12,18 +12,24 @@
 | 색 · 글꼴 | 색 이름(`machine` · `safety` · `floor` 등)과 IBM Plex Sans KR | `src/app/globals.css` |
 | 모듈과 메뉴 | 메뉴와 모듈 화면이 함께 읽는 모듈 아홉(기준정보 · 영업 · 구매 · 재고 · 생산 · 품질 · 회계 · 인사 · 시스템 관리, 마스터플랜 순서)과 그 메뉴 · 짓는 조각. 지은 메뉴만 주소를 갖는다 | `src/lib/areas.ts` |
 | 모듈 화면 | 모듈마다 한 주소(`/master` · `/sales` · `/purchasing` · `/inventory` · `/production` · `/quality` · `/accounting` · `/hr` · `/system`) — 그 모듈의 메뉴를 묶음대로 보인다 | `src/app/<모듈>/` · `src/components/module-home.tsx` |
-| 품목 화면 | 기준정보 › 품목 등록 — 고칠 품목을 찾는 목록(찾기 · 유형 · 조달구분 · 분류 거르기 · 「사용 안 함 포함」) · 등록 · 수정. 저장은 서버 액션이 받고, 입력 검사(`zod`)와 단위 · 등록 상한 · 코드 번호는 서버가 본다. 실패 로그는 오류 코드만 | `src/app/master/items/` · `src/lib/item-input.ts` · `src/db/items.ts` · `src/db/request.ts` |
+| 품목 화면 | 기준정보 › 품목 등록 — 고칠 품목을 찾는 목록(찾기 · 유형 · 조달구분 · 분류 거르기 · 「사용 안 함 포함」) · 등록 · 수정. 저장은 서버 액션이 받고, 입력 검사(`zod`)와 단위 · 등록 상한 · 코드 번호는 서버가 본다. 실패 로그는 오류 코드만. 재고 칸(LOT 관리 · LOT 번호 규칙 · 기본 입고 · 출고 창고)은 한 건 등록 · 수정 · 시트가 같은 검사로 DB 의 규칙 · 창고 목록에 대어 본다 | `src/app/master/items/` · `src/lib/item-input.ts` · `src/lib/item-stock.ts` · `src/db/items.ts` · `src/db/request.ts` |
 | 거래처 · 창고 화면 | 기준정보 › 거래처 등록(찾기 · 매입처 · 매출처 거르기, 국가 — 한국이면 사업자등록번호, 아니면 해외 사업자번호)와 재고 › 재고 기준정보 › 창고(찾기)의 목록 · 등록 · 수정 — 품목 화면과 같은 틀이다. 입력 칸 부품 · 저장 알림, 찾기 · DB 거절 읽기 · 잠금 안의 등록은 세 화면이 같이 쓴다 | `src/app/master/partners/` · `src/app/inventory/warehouses/` · `src/lib/partner-input.ts` · `src/lib/warehouse-input.ts` · `src/lib/input-common.ts` · `src/db/partners.ts` · `src/db/warehouses.ts` · `src/db/master-shared.ts` · `src/components/form-parts.tsx` |
 | 시트형 등록 | 기준정보 › 품목 · 거래처의 「시트형 등록」 — 칸 · 줄로 된 시트에 넣거나 엑셀에서 붙여넣어 한 번에 등록한다(100줄까지). 칸의 규칙은 한 건 등록의 검사를 그대로 쓰고, 고르는 값은 이름 · 코드 둘 다, 빈 칸은 한 건 등록의 기본값. 맞는 줄은 한 트랜잭션에서 잠금을 쥐고 줄 차례로 코드를 받아 저장하고(줄마다 저장점), 틀린 줄은 까닭과 함께 시트에 남는다 | `src/components/sheet-grid.tsx` · `src/app/master/items/sheet/` · `src/app/master/partners/sheet/` · `src/lib/sheet.ts` · `src/lib/sheet-columns.ts` · `src/lib/sheet-input.ts` · `src/db/master-shared.ts` |
 | 조회 화면 | 기준정보 › 품목 조회 · 거래처 조회 — 모든 칸을 넓은 표로 보는, 고칠 수 없는 화면(ADR 0013). 휴대폰 폭에서는 표를 옆으로 밀고 코드 · 이름 칸이 왼쪽에 남는다. 찾기는 글 칸 전체, 거르기는 등록과 같고 거래처에 국가. 코드를 누르면 등록의 수정 화면 | `src/components/inquiry-table.tsx` · `src/app/master/items/inquiry/` · `src/app/master/partners/inquiry/` · `src/db/items.ts` · `src/db/partners.ts` |
-| 공통코드 화면 | 시스템 관리 › 공통코드 — 묶음(Major) 목록과 한 묶음의 값(Minor) 목록, 사용자 코드 묶음의 값 추가 · 수정. 시스템 코드 묶음은 보이기만 하고, 서버도 바꾸는 요청을 거절한다. 프로그램이 기대는 사용자 코드 값(국가 `KR`)은 「사용 안 함」으로 바꾸지 못한다. 묶음 안의 겹침 · 등록 상한은 서버가 본다(ADR 0009) | `src/app/system/codes/` · `src/lib/code-input.ts` · `src/db/codes.ts` |
+| 번호 규칙 화면 | 시스템 관리 › 번호 규칙 — LOT 번호 규칙의 목록(꼴과 오늘의 첫 번호) · 등록 · 수정(ADR 0016). 칸을 바꾸면 번호의 예가 바로 바뀐다. 유형(반제품 · 완제품)마다 기본 규칙이 하나이고, 다른 규칙을 기본으로 고르면 옮겨 간다 — 기본 규칙은 「사용 안 함」으로 바꾸지 못한다. 겹침 · 등록 상한(50)은 서버가 본다. LOT 번호를 내는 함수(`issueLotNumber`)는 수불관리의 등록 화면이 부른다 | `src/app/system/number-rules/` · `src/lib/number-rule-fields.ts` · `src/lib/number-rule-input.ts` · `src/db/number-rules.ts` |
+| 재고 계산 | 수불을 남기는 한 곳(설계 ②) — 전표 저장 · 취소, 재고 실사의 「실사 차이」 조정(`recordCountAdjustment` — 사유 `COUNT` 는 이 길만 쓴다), 단위 환산(같은 기준의 단위만, 반올림 없이), 만드는 품목의 LOT 저절로(번호 규칙), 음수 검사(줄을 넣은 뒤 나가는 쪽 키마다 (일자, 줄 번호) 차례의 누계에서 그 일자부터의 가장 작은 누계), 잔액 고치기를 한 트랜잭션에서 한 DB 잠금을 쥐고 한다(ADR 0015 · 0016 · 0018). 품목의 LOT 관리 · 단위, 창고의 불량창고 표시, 단위의 자릿수를 고칠 때도 같은 잠금을 쥐고 재고를 센다. 화면 · 샘플 · 뒤 조각은 이 함수를 불러 수불을 남긴다 | `src/db/stock.ts` · `src/lib/move-input.ts` |
+| 수불 등록 화면 | 재고 › 수불관리의 등록 메뉴 넷 — 기타입고 · 기타출고 · 재고이동 · 재고조정 등록(ADR 0020). 메뉴가 수불구분을 정하고, 누르면 바로 입력(일자 · 비고, 조정은 사유와 「줄 더하기」로 늘리는 줄 표)이며, 기타출고 · 재고이동 · 재고조정은 머리에서 창고(이동은 출고창고 → 입고창고)를 고르면 그 창고의 현재고 표가 보이고 골라 줄로 넣는다(`stock-panel.tsx`, 서버에서 `warehouseStock` 을 읽음). 기타입고는 줄마다 창고를 고른다. 그 아래에 그 구분의 최근 전표 20장이 있다. 저장하면 같은 화면에 남아 전표번호를 보이고 입력을 비운다. 전표 보기 · 취소는 `/inventory/moves/<전표번호>` 이고 왼쪽 메뉴는 그 전표의 등록 메뉴를 가리킨다(화면이 알림, `src/components/menu-hint.tsx`). 옛 주소 `/inventory/moves` 는 기타입고 등록으로 넘긴다. 구분마다 칸이 바뀌고, 기타입고는 품목을 고르면 기본 입고 창고가 채워진다. 출고 · 이동의 LOT 는 그 창고의 가용 재고를 서버에서 읽어 수량과 함께 고른다. 줄이 하나라도 틀리면 아무 줄도 저장되지 않고 틀린 칸 · 줄과 까닭(모자란 수량)이 보인다. 휴대폰 폭에서는 줄 표를 옆으로 민다 | `src/app/inventory/{receipts,issues,transfers,adjustments}/` · `src/app/inventory/moves/` · `src/lib/move-menus.ts` · `src/db/stock.ts` |
+| 수불 이력 · 수불부 화면 | 재고 › 수불관리 › 수불 이력 · 수불부 — 수불 줄을 읽기만 한다(재고를 바꾸는 길은 재고 계산 하나). 수불 이력은 수불 줄 한 건마다, 조회기간 · 품목 · 창고(출고창고 · 입고창고 어느 쪽이든) · LOT번호 · 수불구분으로 거른다. 수불부는 품목마다 기초재고 · 입고(수불구분마다 · 입고계) · 출고(수불구분마다 · 출고계) · 기말재고 — 창고를 고르면 그 창고의 몫(이동이 들고 남), 고르지 않으면 모든 창고의 합(이동이 빠진다). 취소 줄은 창고를 원래 쪽으로 되돌려 원래 유형의 칸에서 뺀다. 품목을 누르면 그 기간의 거래와 재고수량(기초재고에서 기말재고까지). 처음 기간은 한국 시각의 최근 30일, 칸 머리를 누르면 거른 줄 전체를 그 칸으로 세우고(다시 누르면 거꾸로), 100줄씩 쪽을 넘긴다 — 거르기 · 칸 · 차례 · 쪽은 화면 주소에 남는다 | `src/app/inventory/history/` · `src/app/inventory/ledger/` · `src/db/stock-history.ts` · `src/lib/stock-query.ts` · `src/components/sort-pager.tsx` |
+| 재고 실사 화면 | 재고 › 수불관리 › 재고 실사 — 누르면 바로 입력이다. 창고를 고르면(주소의 `?warehouse=`) 그 창고의 작성 중 실사가, 없으면 장부(잔액이 0 보다 큰 품목 · LOT · 상태)를 불러온 새 실사가 열린다 — 읽기만 하고, 처음 저장할 때 번호가 붙는다. 줄마다 장부 · 실물 · 차이, 장부에 없는 것은 「줄 더하기」(늘 가용). 「작성 중으로 저장」 · 「확정…」(저장한 뒤 지금의 장부로 다시 센 차이 · 연 뒤의 수불 · 줄 밖의 재고 · 비운 줄을 보이고, 한 번 더 「확정」) · 「실사 취소」. 확정은 재고 계산의 `recordCountAdjustment` 를 같은 트랜잭션에서 불러 「실사 차이」 조정 전표 한 장(확정한 날)을 남긴다(ADR 0021). 아래에 최근 실사 20건(모든 창고 · 상태). 실사 보기는 `/inventory/counts/<실사 번호>` | `src/app/inventory/counts/` · `src/lib/count-input.ts` · `src/db/stock-counts.ts` |
+| 공통코드 화면 | 시스템 관리 › 공통코드 — 묶음(Major) 목록과 한 묶음의 값(Minor) 목록, 사용자 코드 묶음의 값 추가 · 수정. 시스템 코드 묶음은 보이기만 하고, 서버도 바꾸는 요청을 거절한다. 프로그램이 기대는 사용자 코드 값(국가 `KR` · 조정 사유 `COUNT`)은 「사용 안 함」으로 바꾸지 못한다. 묶음 안의 겹침 · 등록 상한은 서버가 본다(ADR 0009). 단위(`UNIT`) 묶음은 값마다 기준 단위 · 배수 · 소수 자릿수(단위 사양)를 함께 보이고, 새 단위는 셋을 함께 넣고 수정은 자릿수만 고친다(ADR 0017) — 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만 | `src/app/system/codes/` · `src/lib/code-input.ts` · `src/lib/unit-input.ts` · `src/db/codes.ts` |
 | 설계도 화면 | 업무 흐름(스윔레인 · Overview) · 데이터 모델(모듈별 전체 지도 · 이 조각의 테이블) · 시스템 구성 그림. 메뉴 판 아래 「설계도」. 그림의 글과 스윔레인 데이터는 한 파일에 있고, 테이블 · 부품 · 흐름을 바꾸는 PR 이 함께 고친다(ADR 0006). 스윔레인은 서버에서 SVG 로, 모듈별 지도는 서버에서 카드로, 나머지는 브라우저의 Mermaid 가 그린다 | `src/app/design/` · `src/content/diagrams.ts` · `src/lib/swimlane.ts` · `src/components/swimlane.tsx` · `src/components/module-map.tsx` · `src/components/mermaid-diagram.tsx` |
 | 상태 화면 | DB 에 닿는지 묻고 「연결됨」(DB 시각) 또는 「연결 안 됨」을 보인다. 「마지막 되돌림」(샘플을 마지막으로 넣은 시각 — 공통코드 묶음의 가장 이른 등록 시각)도 보인다. 결과를 1분 재사용하고 검색 로봇을 막는다. 떠 있는 배포의 커밋도 보인다 | `src/app/health/` · `src/db/status.ts` |
 | DB 접속 | 환경변수 `DATABASE_URL` 하나로 PostgreSQL 에 닿는다 — Drizzle ORM · postgres 드라이버. 내 컴퓨터의 DB 말고는 암호화하고 인증서를 확인한다 | `src/db/client.ts` |
-| 테이블 | 기준정보 다섯(품목 · 창고 · 거래처 · 공통코드 묶음 · 값)과 코드의 꼴 · 참조 제약, 마이그레이션 SQL(`docs/schema.md`) | `src/db/schema.ts` · `drizzle/` |
+| 테이블 | 기준정보 다섯(품목 · 창고 · 거래처 · 공통코드 묶음 · 값)과 재고 수불의 단위 사양 · 번호 규칙 · 번호 규칙의 일련 · 수불 전표 · 수불 줄 · 잔액 · 실사 · 실사 줄, 코드의 꼴 · 참조 제약, 마이그레이션 SQL(`docs/schema.md`) | `src/db/schema.ts` · `drizzle/` |
 | DB 준비(배포 빌드) | 빌드의 첫 단계 — 마이그레이션을 적용하고, 빈 DB 면 샘플 데이터를 넣는다. 실패하면 빌드가 멈춰 배포가 나가지 않는다(ADR 0005) | `scripts/migrate.ts` · `src/db/deploy.ts` |
-| 샘플 데이터 · 되돌림 | 가상 반도체 후공정 회사의 샘플과, 테이블을 비우고 샘플로 다시 채우는 되돌림. 매일 밤 Vercel Cron 이 `CRON_SECRET` 을 붙여 입구를 부른다 — 비밀값이 틀리면 DB 에 닿지 않는다(ADR 0004) | `src/db/sample.ts` · `src/db/reset.ts` · `src/db/reset-request.ts` · `src/app/api/cron/reset/` · `vercel.json` |
+| 샘플 데이터 · 되돌림 | 가상 반도체 후공정 회사의 샘플과, 테이블을 비우고 샘플로 다시 채우는 되돌림. 샘플 수불 · 실사는 재고 계산 · 실사의 저장을 불러 되돌린 날에서 센 며칠 앞 날짜로 넣는다. 매일 밤 Vercel Cron 이 `CRON_SECRET` 을 붙여 입구를 부른다 — 비밀값이 틀리면 DB 에 닿지 않는다(ADR 0004) | `src/db/sample.ts` · `src/db/reset.ts` · `src/db/reset-request.ts` · `src/app/api/cron/reset/` · `vercel.json` |
 | 코드 번호 | 같은 머리의 가장 큰 번호 + 1 | `src/db/numbering.ts` · 공통코드의 시스템 값 `src/lib/master-codes.ts` |
+| 한국 날짜 | 서버의 시계(UTC)로 한국 시각의 오늘을 낸다 — 번호의 예와 수불 일자가 기댄다 | `src/lib/today.ts` |
 | 정기 확인 | 하루 4번 데모의 `/health` 가 「연결됨」이고 `main` 의 최신 커밋이며 「마지막 되돌림」이 30시간 안인지 보고, 아니면 GitHub 가 메일로 알린다 | `.github/workflows/health-check.yml` |
 | 자동 검사 | PR 과 `main` 에서 형식 · 린트 · 타입 · 시험 · 문서 모양과, 데모에 실리는 의존성의 알려진 약점(높음 이상)을 본다 | `.github/workflows/ci.yml` |
 | 미리보기 DB 가지 지우기 | PR 이 머지되거나 닫히면 그 PR 의 미리보기 DB 가지(Neon `preview/<가지>`)를 지운다 — 무료 요금제의 가지 10개 한도가 차지 않게. 열쇠는 이 Neon 프로젝트 하나로 좁힌 API 키(GitHub 비밀값) | `.github/workflows/preview-db-cleanup.yml` |
@@ -32,7 +38,10 @@
 
 ```
 브라우저 ── 웹 앱(Vercel) ── PostgreSQL(Neon 운영 DB)
-         └─ 품목 · 거래처 · 창고 · 공통코드 등록 · 수정, 품목 · 거래처 시트형 등록(서버 액션) ── 입력 검사 ── 운영 DB
+         └─ 품목 · 거래처 · 창고 · 공통코드 · 번호 규칙 등록 · 수정, 품목 · 거래처 시트형 등록(서버 액션) ── 입력 검사 ── 운영 DB
+         └─ 등록 메뉴 넷 · 취소(서버 액션) ── 꼴 검사 ── 재고 계산(잠금 · 수불 줄 · 음수 검사 · 잔액, 한 트랜잭션) ── 운영 DB
+         └─ 재고 실사 저장 · 취소 · 확정(서버 액션) ── 꼴 검사 ── 실사 · 확정이면 재고 계산(같은 잠금 · 실사 차이 전표, 한 트랜잭션) ── 운영 DB
+         └─ 수불 이력 · 수불부(주소의 거르기 · 칸 · 쪽) ── 수불 줄 읽기 ── 운영 DB
 PR ── 자동 검사(GitHub Actions)
    └─ 미리보기 배포(Vercel) ── Neon 미리보기 분기 DB
    └─ 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 미리보기 분기 DB
@@ -44,7 +53,7 @@ main 머지 ── 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 운영
 ```
 
 고정 화면(첫 화면 · 모듈 화면 · 설계도)은 빌드 때 만들어 Vercel 이 가까운 곳에서 내보낸다. 상태 화면의 DB 확인, 되돌림 입구, 품목 · 거래처 · 창고 · 공통코드
-화면의 DB 읽기 · 쓰기는 요청이 올 때 돈다(상태 확인은 1분 재사용, 기준정보 화면은 늘 새로 읽는다). 기준정보 화면의 틀(머리 · 메뉴)은 빌드 때 만들고 목록 · 입력 칸만 요청 때 채운다.
+· 번호 규칙 · 수불 화면의 DB 읽기 · 쓰기는 요청이 올 때 돈다(상태 확인은 1분 재사용, 기준정보 화면은 늘 새로 읽는다). 기준정보 화면의 틀(머리 · 메뉴)은 빌드 때 만들고 목록 · 입력 칸만 요청 때 채운다.
 스택과 배포처를 고른 까닭은 ADR 0001 · 0002, 테이블과 마이그레이션은 `docs/schema.md`, 배포와 되돌리기는 `docs/deploy.md`.
 
 ## 시험
diff --git a/docs/deploy.md b/docs/deploy.md
index 05b6232..68f61e5 100644
--- a/docs/deploy.md
+++ b/docs/deploy.md
@@ -62,7 +62,7 @@
 
 | 무엇 | 어디서 | 맞으면 |
 |---|---|---|
-| 화면 | 데모 주소 | 왼쪽에 모듈 아홉(기준정보부터 시스템 관리까지), 가운데 자재 흐름도. 「기준정보 › 품목」에 샘플 품목 10개, 「기준정보 › 거래처」에 7개(해외 2 — 데이터가 있던 DB 는 첫 매일 밤 되돌림 뒤부터, 그 전에는 5개가 모두 KR), 「재고 › 재고 기준정보 › 창고」에 4개, 「시스템 관리 › 공통코드」에 묶음 4개(단위 4개 · 국가 5개) |
+| 화면 | 데모 주소 | 왼쪽에 모듈 아홉(기준정보부터 시스템 관리까지), 가운데 자재 흐름도. 「기준정보 › 품목」에 샘플 품목 14개, 「기준정보 › 거래처」에 7개(해외 2 — 데이터가 있던 DB 는 첫 매일 밤 되돌림 뒤부터, 그 전에는 5개가 모두 KR), 「재고 › 재고 기준정보 › 창고」에 4개, 「재고 › 수불관리」의 등록 메뉴 넷(기타입고 · 기타출고 · 재고이동 · 재고조정 등록)의 최근 전표에 샘플 수불 11장(구분마다 나뉘어 — 재고조정 등록에 「실사 차이」 한 장이 든다)(되돌린 날의 7일 앞부터 — 데이터가 있던 DB 는 첫 매일 밤 되돌림 뒤부터, 그 전에는 비어 있다. 바로 채우려면 아래 「Cron Jobs」의 **Run**), 「재고 실사」의 최근 실사에 2건(생산현장 확정 · 제품창고 작성 중 — 같은 때부터), 같은 샘플이 「수불 이력」에 줄 32건 · 「수불부」에 품목 14개(최근 30일), 「시스템 관리 › 공통코드」에 묶음 9개(단위 8개 · 국가 5개 · 수불 유형 4개 · 조정 사유 5개) |
 | DB | 데모 주소 뒤에 `/health` | 「연결됨」과 한국 시각, 「마지막 되돌림」 시각. 결과는 1분마다 새로 확인한다 |
 | 버전 | 같은 화면의 「배포 버전」 | 지금 떠 있는 배포의 커밋 앞 일곱 자리 — Deployments 탭의 커밋과 같다 |
 | 자동 배포 | PR 을 머지하고 몇 분 뒤 데모 주소 | 머지한 변경이 보인다 |
diff --git a/docs/master-plan.md b/docs/master-plan.md
index 1b7b42f..c6afa4c 100644
--- a/docs/master-plan.md
+++ b/docs/master-plan.md
@@ -39,8 +39,9 @@
    - 후보: 구매요청
 4. **재고**
    - 재고 기준정보 — 창고 「기준정보」
-   - 수불관리 — 수불 등록 · 재고 실사 · 수불 이력 · 수불부 「재고 수불」
-   - 재고관리 — 품목별 · 창고별 · LOT별 재고 · 예상재고 · 할당 현황 「재고 현황」
+   - 수불관리 — 기타입고 등록 · 기타출고 등록 · 재고이동 등록 · 재고조정 등록 · 재고 실사 · 수불 이력 · 수불부 「재고 수불」(ADR 0020)
+   - 재고관리 — 품목별 · 창고별 · LOT별 재고 · 예상재고 「재고 현황」, 할당 현황 「작업지시」
+   - 후보: LOT 라벨 · 바코드
 5. **생산**
    - 생산 기준정보 — BOM 「BOM」, 공정 · 작업장 · 라우팅 「라우팅」, 근무 캘린더 · 작업장 능력 「능력계획(CRP)」
    - 생산계획 — MPS 「MPS」, MRP 「MRP」, 능력계획 「능력계획(CRP)」
@@ -61,9 +62,9 @@
    - 사원 「인사」
    - 후보: 근태, 급여 「급여」
 10. **시스템 관리**
-    - 공통코드 「기준정보」
+    - 공통코드 「기준정보」, 번호 규칙(LOT 번호) 「재고 수불」
     - 회사 정보 · 사용자 · 메뉴 관리 · 권한 「인사」
-    - 후보: 번호 규칙 · 결재선
+    - 후보: 결재선
 
 모듈 밖 — 상태 화면 「기반」, 설계도 「기준정보」, README 의 데모 안내 「포트폴리오 정리」.
 
@@ -76,18 +77,18 @@
 |---|---|---|---|---|---|
 | 1 | 기반 | 스택 · 배포를 정하고, 빈 화면 하나가 배포된 데모 주소에서 보인다 | — | 닫힘 | `docs/slices/1-기반/` |
 | 2 | 기준정보 | 품목 · 거래처, 재고의 창고, 「시스템 관리」의 공통코드를 등록 · 조회 · 수정한다 | 기반 | 닫힘 | `docs/slices/2-기준정보/` |
-| 3 | 재고 수불 | 「재고 › 수불관리」에서 입고 · 출고 · 이동 · 실사 · 조정을 LOT 와 함께 기록하고, 재고 상태 · 할당을 남긴다 | 기준정보 | 예정 | — |
-| 4 | 재고 현황 | 「재고 › 재고관리」에서 품목별 · 창고별 · LOT별 재고, 예상재고, 할당 현황을 본다 | 재고 수불 | 예정 | — |
+| 3 | 재고 수불 | 「재고 › 수불관리」에서 입고 · 출고 · 이동 · 실사 · 조정을 LOT 와 함께 기록하고, 재고 상태(검사대기 · 불량)를 남긴다. LOT 번호 규칙과 단위의 기준 · 배수 · 자릿수를 둔다 | 기준정보 | 진행 | `docs/slices/3-재고수불/` |
+| 4 | 재고 현황 | 「재고 › 재고관리」에서 품목별 · 창고별 · LOT별 재고와 예상재고를 본다 | 재고 수불 | 예정 | — |
 | 5 | BOM | 완제품의 자재 구성을 등록하고 펼쳐 본다 | 기준정보 | 예정 | — |
 | 6 | 라우팅 | 공정 · 작업장 · 불량 유형과, 품목마다 공정 순서 · 표준시간을 등록한다 | 기준정보 | 예정 | — |
 | 7 | MPS | 수주 · 판매계획으로 완제품의 주별 생산계획을 세운다 | 기준정보 · 재고 현황 | 예정 | — |
 | 8 | MRP | MPS 를 BOM 으로 펼쳐 주별 계획오더(만들 것 · 살 것)를 낸다 | MPS · BOM | 예정 | — |
 | 9 | 능력계획(CRP) | 계획오더가 작업장에 주는 주별 부하를 작업장 능력과 견준다 | MRP · 라우팅 | 예정 | — |
-| 10 | 작업지시 | 생산 계획오더를 확정하거나 긴급 · 시생산으로 직접 넣어, 공정별 작업지시를 낸다 | MRP · 라우팅 | 예정 | — |
+| 10 | 작업지시 | 생산 계획오더를 확정하거나 긴급 · 시생산으로 직접 넣어, 공정별 작업지시를 낸다. 확정하면 들어갈 자재에 할당이 생기고, 「재고 › 재고관리 › 할당 현황」에서 본다 | MRP · 라우팅 | 예정 | — |
 | 11 | 생산실적 | 공정마다 실적 · 불량을 넣으면 자재가 출고되고 제품이 입고되며, 투입 · 생산 LOT 가 이어진다 | 작업지시 · 재고 수불 | 예정 | — |
 | 12 | LOT 추적 | 제품 LOT 에서 자재 LOT 로, 자재 LOT 에서 제품으로 찾아본다 | 생산실적 | 예정 | — |
 | 13 | 구매 | 구매 계획오더를 확정하거나 긴급으로 직접 넣어 발주하고, 입고하면 재고와 매입이 남는다. 불합격 자재는 공급처로 반품한다 | 재고 수불 · MRP | 예정 | — |
-| 14 | 영업 | 수주를 받아 MPS 의 수요로 넘기고, 출고하면 재고가 줄고 매출이 남는다. 고객 반품은 검사대기로 입고한다 | 재고 수불 · MPS | 예정 | — |
+| 14 | 영업 | 수주를 받아 MPS 의 수요로 넘기고, 출하요청을 확정하면 제품에 할당이 생기며, 출고하면 재고가 줄고 매출이 남는다. 고객 반품은 검사대기로 입고한다 | 재고 수불 · MPS · 작업지시 | 예정 | — |
 | 15 | 품질 | 수입 · 공정 · 출하 검사와 고객 반품의 판정을 남기고, 불합격품을 불량창고에 격리해 반품 · 재작업 · 폐기로 처분한다 | 구매 · 생산실적 · 영업 | 예정 | — |
 | 16 | 회계 | 매입 · 매출이 전표로 만들어지고, 채권 · 채무와 시산표를 조회한다 | 구매 · 영업 | 예정 | — |
 | 17 | 인사 | 부서 · 직급 · 사원을 등록하고, 「시스템 관리」에서 회사 정보와 ERP 사용자 · 메뉴 관리 · 메뉴 권한을 둔다. 권한은 상위 메뉴에 주면 하위 메뉴가 다 열리고, 하위 메뉴를 일부만 골라 줄 수도 있다 | 기반 | 예정 | — |
@@ -115,3 +116,8 @@
 | 2026-11-04 | 품목 · 거래처에 설명용 칸을 더했다 — 품목은 대 · 중 · 소 분류(공통코드) · 비고, 거래처는 대표자 · 업태 · 종목 · 주소 · 전화 · 이메일 · 담당자 · 비고. 요구사항 성공 기준 13 · 하지 않을 일 9 를 더했다. 짓는 것은 설계 ⑥ 의 PR H(PR F 뒤). 규칙이 걸린 칸은 그 칸을 읽는 조각의 착공에서 정한다 — LOT 관리 여부 · 기본 입고 · 출고 창고는 「재고 수불」, 과세구분은 「회계」, 단가 · 원가는 「구매」 · 「영업」 · 「생산 원가」, 결제조건 · 거래 통화 · 여신한도 · 세금계산서 받을 이메일은 「구매」 · 「영업」 · 「회계」. 도면번호 · 재질 · 바코드는 품목에 두지 않는다 — 생산 모듈에 후보 메뉴 「설계 BOM」(도면 · 리비전 · 재질) · 「설비 관리」를 적고, 바코드는 LOT 라벨과 함께 「재고 수불」 착공에서 묻는다(ADR 0012) | 보통의 ERP 처럼 품목의 분류와 거래처의 사업자 · 연락 정보를 둔다. 도면 · 재질은 설계 쪽이 주인이다 — 저자 질문 · 판정(PR F 검토) | 기준정보 |
 | 2026-11-04 | 품목 · 거래처의 메뉴를 등록 · 조회로 나누고, 시트형 등록에서 기존 데이터를 고치게 했다 — 「품목 등록」 · 「거래처 등록」은 지금의 목록 · 한 건 등록 · 수정 · 시트, 「품목 조회」 · 「거래처 조회」는 모든 칸을 넓은 표로 보는 읽기 전용 화면이다. 시트는 찾기 · 거르기로 기존 데이터를 불러와 고치면 바뀐 줄만 저장한다(코드 · 품목 유형은 못 고침). 요구사항 성공 기준 14 · 15 를 더했다. 짓는 것은 설계 ⑥ 의 PR I(조회) · PR J(시트 수정), PR H 뒤(ADR 0013) | 목록이 조회를 겸해 칸을 줄여 두어 분류 · 연락처가 조회에서 보이지 않았고, 시트는 새 줄만 받아 여러 건을 한꺼번에 고칠 길이 없었다 — 보통의 국내 ERP 처럼 등록과 조회를 가른다(저자 질문 · 판정, PR H 검토) | 기준정보 |
 | 2026-11-05 | 「시스템 관리 › 메뉴 관리」를 후보에서 조각 「인사」로 옮겼다 — 메뉴를 DB 의 표(상위 메뉴 · 순서 · 화면 주소 · 사용 여부)로 두어, 메뉴 권한이 메뉴를 가리킨다. 권한은 상위 메뉴(모듈 · 묶음)에 주면 그 아래 하위 메뉴가 다 열리고, 하위 메뉴를 일부만 골라 줄 수도 있다(그때 상위는 「일부」). 메뉴마다 조회 · 등록 · 수정을 따로 줄지는 「인사」 착공에서 정한다. 그때까지 메뉴는 프로그램 안 목록(`src/lib/areas.ts`)에 두고, 표의 처음 값은 그 목록을 옮긴다. 공통코드(Major · Minor)에는 두지 않는다 — 두 단이라 모듈 › 묶음 › 메뉴 세 단을 담지 못하고 화면 주소를 둘 칸이 없다(ADR 0009) | 현업 ERP 에서 상위 메뉴 · 하위 메뉴 권한을 주고, 하위 메뉴를 일부만 골라 주기도 했다 — 저자 질문(PR I 검토). 메뉴를 읽는 것은 권한뿐이라 권한과 함께 짓는다(저자 판정) | 기준정보 |
+| 2026-11-05 | 할당을 조각 「재고 수불」에서 「작업지시」로 옮겼다 — 할당의 자리와 메뉴 「재고 › 재고관리 › 할당 현황」은 「작업지시」가 짓고, 「영업」의 출하요청이 같은 자리를 쓴다(「영업」의 의존에 「작업지시」를 더함). 그때까지 가용재고는 실재고 − 검사대기 − 불량이다(ADR 0015) | 할당은 어느 작업지시 · 출하요청의 줄에 잡혔는지를 가리켜야 해서 그 문서와 함께 짓는다(저자 판정, 앵커볼트 「재고 계산 규칙」) | 재고 수불 |
+| 2026-11-05 | 「시스템 관리 › 번호 규칙」을 후보에서 조각 「재고 수불」로 옮겼다 — LOT 번호의 규칙(머리 · 구분자 · 날짜 꼴 · 일련 자릿수)만 들고, 반제품 · 완제품마다 기본 규칙 · 품목마다 다른 규칙을 고른다(원자재 · 부자재 · 소모품은 거래처 LOT 를 반드시 넣는다). 전표 · 발주 · 작업지시 번호를 얹을지는 그 조각의 착공에서 정한다. 의도 What 의 「시스템 관리」에 번호 규칙을 더했다(ADR 0016) | 저자가 LOT 번호를 「규칙을 설정해 자동 부여」하자고 했다 — 저자 판정(착공 인터뷰) | 재고 수불 |
+| 2026-11-05 | 단위에 기준 단위 · 배수 · 소수 자릿수를 더했다 — 같은 기준의 단위 사이(1 KG = 1000 G)는 수불 등록에서 바꿔 넣고, `EA` 처럼 자릿수 0 인 단위는 정수만 받는다. 조각 「기준정보」 하지 않을 일 4 의 단위 환산 가운데 같은 기준의 것만 연다. 품목마다 다른 환산(1 BOX = 100 EA)은 조각 「구매」의 착공에서 발주 단위와 함께 정한다(ADR 0017) | 단위와 상관없이 소수 셋째 자리까지 받아 `EA` 에 0.5 가 들어갔다 — 저자가 현업 ERP 의 「기준 단위 대비 배수」를 들었다(저자 판정, 착공 인터뷰) | 재고 수불 |
+| 2026-11-05 | 재고 모듈에 후보 메뉴 「LOT 라벨 · 바코드」를 적었다 — 품목 바코드는 조각 「기준정보」가 이 조각으로 넘겼고, 이 조각은 하지 않는다(ADR 0016) | 데모는 스캐너 없이 보는 것이라 보일 것이 적다(저자 판정, 착공 인터뷰) | 재고 수불 |
+| 2026-11-05 | 품목 유형에 부자재(`SM-0001`) · 소모품(`CS-0001`)을 더했다 — 기본값은 조달구분 구매 · LOT 관리 끔 · 검사 끔. 짓는 것은 조각 「재고 수불」 설계 ⑥ 의 PR B. ADR 0003 의 「부자재는 원자재로 넣는다」를 고친다. BOM · MRP 에서 어떻게 다룰지는 조각 「BOM」 · 「MRP」의 착공에서 정한다(ADR 0019) | 원자재는 늘 거래처 LOT 가 붙어 들어오고, 부자재 · 소모품은 LOT 가 없어도 된다 — 저자 판정(착공 PR 검토) | 재고 수불 |
diff --git a/docs/schema.md b/docs/schema.md
index daf3855..5eae02a 100644
--- a/docs/schema.md
+++ b/docs/schema.md
@@ -8,17 +8,25 @@
 
 | 테이블 | 화면의 이름 | 무엇 | 조각 |
 |---|---|---|---|
-| `items` | 품목 | 코드(`RM-0001` · `SF-0001` · `FG-0001`) · 품명 · 규격 · 유형 · 조달구분 · 단위 · 수입 · 출하검사 대상 · 계획 정보(리드타임 · 안전재고 · 최소 발주 · 생산량 · 배수) · 대 · 중 · 소 분류 · 비고 · 사용 여부 | 기준정보 |
-| `warehouses` | 창고 | 코드(`WH-01`) · 창고명 · 사용 여부 | 기준정보 |
+| `items` | 품목 | 코드(`RM-0001` · `SF-0001` · `FG-0001` · `SM-0001` · `CS-0001`) · 품명 · 규격 · 유형 · 조달구분 · 단위 · 수입 · 출하검사 대상 · 계획 정보(리드타임 · 안전재고 · 최소 발주 · 생산량 · 배수) · 대 · 중 · 소 분류 · 비고 · 사용 여부. 재고 수불 PR B 부터 LOT 관리 · LOT 번호 규칙(반제품 · 완제품만, 비우면 유형의 기본) · 기본 입고 · 출고 창고(창고 번호) | 기준정보 · 재고 수불 |
+| `warehouses` | 창고 | 코드(`WH-01`) · 창고명 · 사용 여부. 재고 수불 PR B 부터 불량창고 표시 | 기준정보 · 재고 수불 |
 | `partners` | 거래처 | 코드(`BP-0001`) · 거래처명 · 매입처 · 매출처 · 국가 · 사업자등록번호(한국) · 해외 사업자번호(한국 밖) · 대표자 · 업태 · 종목 · 주소 · 전화 · 이메일 · 담당자 · 담당자 연락처 · 비고 · 사용 여부 | 기준정보 |
 | `code_groups` | 공통코드 묶음(Major) | 코드(`UNIT`) · 이름 · 시스템 코드 여부 | 기준정보 |
 | `codes` | 공통코드 값(Minor) | 묶음 · 코드(`EA`) · 이름 · 정렬 순서 · 사용 여부. 묶음 + 코드가 겹치지 않는다 | 기준정보 |
+| `unit_specs` | 단위 사양 | 단위(공통코드 `UNIT` 의 값)마다 기준 단위 · 배수 · 소수 자릿수 — `KG` 은 기준 `G` 의 1000 배, 소수 셋째 자리(ADR 0017) | 재고 수불 |
+| `number_rules` | 번호 규칙 | LOT 번호의 규칙 — 코드(`LOT_FG`) · 이름 · 머리 · 구분자 · 날짜 꼴 · 일련 자릿수 · 기본으로 쓰는 유형(반제품 · 완제품마다 하나) · 사용 여부(ADR 0016) | 재고 수불 |
+| `number_rule_seqs` | (화면 없음) | 규칙 · 기간(날짜 꼴로 쓴 날짜 — `261105` · `2611`, 날짜 꼴이 없으면 빈 글자)마다 마지막으로 낸 일련. LOT 번호를 저절로 붙일 때만 행이 생긴다 | 재고 수불 |
+| `stock_moves` | 수불 전표 | 등록 화면의 저장 한 번 — 번호(`IV-20261109-001`, 수불 일자 · 그날의 일련) · 일자 · 유형(공통코드 `MOVE_TYPE`) · 사유(조정만, `ADJ_REASON`) · 비고 · 취소한 전표(취소 전표만)(ADR 0015 · 0016) | 재고 수불 |
+| `stock_move_lines` | 수불 줄 | 전표의 줄 — 품목 · LOT(끈 품목은 빈 글자) · 상태(가용 · 검사대기) · 출고창고 · 입고창고 · 품목 단위의 수량(늘 0 보다 큼) · 넣은 수량 · 넣은 단위 · 일자(전표의 일자를 옮김). 고치거나 지우지 않는다 — 취소는 출고창고 · 입고창고를 바꾼 새 줄이다(ADR 0018) | 재고 수불 |
+| `stock_balances` | 잔액 | 품목 · 창고 · LOT · 상태마다 지금 수량 — 수불 줄을 쓰는 같은 트랜잭션에서 고친다. 재고 계산(`src/db/stock.ts`) 말고는 고치지 않는다(ADR 0018) | 재고 수불 |
+| `stock_counts` | 재고 실사 | 창고 하나의 실사 — 번호(`PI-20261109-001`, 처음 저장한 날 · 그날의 일련) · 창고 · 상태(작성 중 `DRAFT` · 확정 `CONFIRMED` · 취소 `CANCELED`) · 장부를 불러온 때의 마지막 수불 줄 번호(연 뒤의 수불 경고) · 확정한 날 · 실사 차이의 조정 전표(차이가 있었을 때)(ADR 0015 · 0021) | 재고 수불 |
+| `stock_count_lines` | 실사 줄 | 실사의 줄 1 ~ 100 — 품목 · LOT · 상태 · 장부에 없어 더한 줄인가(늘 가용) · 실물 수량(작성 중에만 비울 수 있음) · 확정하는 순간의 장부. 작성 중에는 저장할 때마다 통째로 바뀐다 | 재고 수불 |
 
 ### DB 가 막는 것
 
 화면 · 서버의 검사를 건너뛴 값도 DB 의 제약이 거절한다 — 제약 이름이 `<테이블>_<무엇>` 꼴이라 거절된 칸을 가를 수 있다.
 
-- **코드의 꼴**(ADR 0003 · 0009) — 품목 `^(RM|SF|FG)-[0-9]{4,}$` 이고 머리가 유형과 같다, 창고 `^WH-[0-9]{2,}$`, 거래처
+- **코드의 꼴**(ADR 0003 · 0009 · 0019) — 품목 `^(RM|SF|FG|SM|CS)-[0-9]{4,}$` 이고 머리가 유형과 같다, 번호 규칙 `^[A-Z][A-Z0-9_]{1,19}$`, 창고 `^WH-[0-9]{2,}$`, 거래처
   `^BP-[0-9]{4,}$`, 공통코드 묶음 `^[A-Z][A-Z0-9_]{1,19}$`, 값 `^[A-Z0-9][A-Z0-9_]{0,19}$`. 코드는 테이블(값은 묶음) 안에서 겹치지 않는다.
 - **공통코드 참조** — 품목의 유형 · 조달구분 · 단위는 공통코드에 있는 값만 받는다. 품목에는 늘 같은 묶음 칸(`item_type_group` =
   `ITEM_TYPE` · `procurement_group` = `PROC_TYPE` · `unit_group` = `UNIT`)이 있어, 묶음 + 코드로 `codes` 를 가리킨다. 거래처의 국가도
@@ -30,10 +38,42 @@
 - **전화 · 이메일의 꼴**(PR H) — 거래처의 전화 · 담당자 연락처는 비우거나 숫자 · 붙임표 · `+` · 괄호 · 빈칸만 20자까지(숫자가 하나 이상),
   이메일은 비우거나 `@` 하나를 사이에 두고 앞뒤가 비지 않고 뒤에 점이 있으며 빈칸이 없는 100자까지.
 - **국가에 따른 번호** — 국가가 `KR` 이면 해외 사업자번호가 비고, 아니면 사업자등록번호가 빈다.
+- **단위 사양**(ADR 0017) — 단위는 공통코드 `UNIT` 의 값이고 한 단위에 사양은 하나다. 기준 단위는 그 자신이 기준인 단위다 —
+  (기준 단위, 기준 단위)가 이 표의 (단위, 기준 단위)를 가리키게 해 막는다(`unit_specs_base_fk`). 배수는 0 보다 크고, 자신이 기준이면 1,
+  소수 자릿수는 0 ~ 3. 다른 단위의 기준인 단위의 사양은 지울 수 없다.
+- **번호 규칙**(ADR 0016) — 머리는 영문 대문자 · 숫자 0 ~ 6자, 구분자는 없음 · `-` · `_` · `.`, 날짜 꼴은 없음 · `YYMMDD` · `YYYYMMDD` · `YYMM`,
+  일련 자릿수 2 ~ 6. 기본으로 쓰는 유형은 반제품(`SF`) · 완제품(`FG`)이고 유형마다 하나다(`number_rules_default_for_unique`) — 기본 규칙은
+  「사용 안 함」이 아니다(`number_rules_default_active`). 일련은 (규칙, 기간)마다 한 행이다. 품목이 쓰는 규칙은 지울 수 없다.
+- **품목의 재고 칸**(ADR 0015 · 0016) — LOT 번호 규칙은 번호 규칙을 가리키고 반제품 · 완제품만 갖는다(`items_lot_rule_made_only`).
+  기본 입고 · 출고 창고는 (창고 번호, 늘 `false` 인 칸 `default_warehouse_defect`)으로 창고의 (`id`, `is_defect`)를 가리킨다 —
+  불량창고를 기본 창고로 두는 쓰기와 기본 창고인 창고를 불량창고로 바꾸는 쓰기를 DB 가 거절해, 두 화면을 동시에 저장해도 깨지지 않는다.
+  품목이 쓰는 창고는 지울 수 없다.
+- **수불**(조각 「재고 수불」 PR C, ADR 0015 · 0016 · 0018) — 전표 번호는 `^IV-[0-9]{8}-[0-9]{3,}$` 이고 가운데 여덟 자리가 수불 일자다
+  (`stock_moves_code_date`). 유형 · 사유 · 넣은 단위는 공통코드를 가리키고, 사유는 조정(`ADJ`)일 때만 있다. 한 전표는 한 번만 취소된다
+  (`cancels_move_id` 유일) — 취소 전표는 취소되지 않는다: 취소의 참조가 (원래 전표, 늘 `false` 인 칸 `cancels_cancel`)로 (`id`, 저절로 정해지는
+  `is_cancel`)을 가리킨다(`stock_moves_cancels_fk`). 줄의 수량 · 넣은 수량은 0 보다 크고, 출고창고 · 입고창고 가운데 하나는 있고 서로 다르다.
+  LOT 는 영문 · 숫자 · `-` · `_` · `.` 30자까지, 상태는 `AVAILABLE` · `QC`. 잔액은 0 밑으로 가지 못하고(`stock_balances_qty_not_negative`)
+  (품목, 창고, LOT, 상태)마다 한 행이다. 전표 · 줄 · 품목 · 창고는 지울 수 없다(참조).
+- **재고 실사**(조각 「재고 수불」 PR E, ADR 0021) — 실사 번호는 `^PI-[0-9]{8}-[0-9]{3,}$` 이고 가운데 여덟 자리가 처음 저장한 날이다
+  (`stock_counts_code_date`). 창고 하나에 작성 중인 실사는 하나다(부분 유일 인덱스 `stock_counts_one_draft_per_warehouse`). 확정한 날은
+  확정한 실사에만 있고, 조정 전표는 확정한 실사만 가리키며 한 전표는 한 실사만 가리킨다. 실사 줄은 1 ~ 100 번이고 (실사, 품목, LOT, 상태)마다 한 줄,
+  더한 줄은 가용이며(`stock_count_lines_added_available`), 실물 수량 · 장부는 0 이상이다.
 
 DB 가 막지 않고 서버가 막는 것(조각 「기준정보」 PR C · D · E) — 수량의 소수 넷째 자리(DB 는 `numeric(12,3)` 이라 거절하지 않고 셋째 자리로 반올림한다) · 수량의 상한, 코드 · 품목 유형을 등록 뒤 바꾸지 않음, 「사용 안 함」 단위를
 새 품목에 쓰지 않음, 「사용 안 함」 분류를 새 품목에 쓰지 않음(PR H), 「사용 안 함」 국가를 새 거래처에 쓰지 않음, 시스템 코드 묶음을 바꾸지 않음, 국가 `KR` 을 「사용 안 함」으로 바꾸지
-않음(PR G), 테이블마다 등록 상한.
+않음(PR G), 테이블마다 등록 상한. 조각 「재고 수불」 PR A 부터 — 단위를 더할 때 사양을 함께 넣음(단위마다 사양이 있음), 사양의 기준 단위 ·
+배수를 등록 뒤 바꾸지 않음, 「사용 안 함」 단위를 새 단위의 기준으로 받지 않음. PR B 부터 — 유형의 기본 규칙을 「사용 안 함」으로 바꾸거나
+떼지 않음(다른 규칙을 기본으로 고르면 옮겨 감), 「사용 안 함」 규칙 · 창고를 품목에 새로 고르지 않음, 불량창고를 품목의 기본 창고로 고르지 않음,
+품목의 기본 창고인 창고를 불량창고로 바꾸지 않음. PR C 부터 — 음수 재고(지난 날짜로 넣어 그 뒤 어느 때든 0 밑으로 가는 것까지), 미래 일자, 단위의
+자릿수(넣은 수량은 넣은 단위의, 쌓는 수량은 품목 단위의)와 같은 기준의 단위만으로 넣음, LOT 관리 품목의 LOT · 사 오는 품목의 거래처 LOT,
+불량창고에서 내보내지 않음, 수불이 있는 품목의 LOT 관리 · 단위를 바꾸지 않음, 재고가 있는 창고의 불량창고 표시를 바꾸지 않음, 단위의 자릿수를
+그 단위의 수불 수량이 맞지 않게 줄이지 않음, 조정 사유 `COUNT` 를 「사용 안 함」으로 바꾸지 않음, 수불 전표 5,000 · 줄 50,000 의 등록 상한.
+PR E 부터 — 조정 사유 `COUNT`(실사 차이)는 실사의 확정만 쓰고 손으로 넣는 조정은 거절함, 실사의 확정은 실물 수량을 비운 줄이 없을 때만, 작성 중
+실사의 저장 · 확정은 버전이 맞을 때만(그 사이 다른 사람이 저장했으면 거절), 장부에 없는 검사대기 줄을 받지 않음, 실사 500 · 실사 줄 50,000 의 등록 상한,
+작성 중 실사에 든 품목의 LOT 관리 · 단위를 바꾸지 않음과 단위의 자릿수를 작성 중 실사의 실물 수량이 맞지 않게 줄이지 않음(수불이 있는 품목과 같은
+규칙 — 확정하면 그 수량이 수불이 된다, PR E 리뷰 1회차).
+수불의 저장 · 취소, 실사의 저장 · 취소 · 확정과 이 고침들, 그리고 매일 밤 되돌림은 한 DB 잠금(`REGISTER_LOCK.stock`)을 쥐고 차례로 돈다 — 잠금은 늘 트랜잭션의
+첫 일로, 표를 고치기 전에 쥔다(표를 먼저 고치고 잠금을 기다리면 되돌림과 교착한다).
 
 ### 샘플 데이터와 되돌림
 
@@ -43,6 +83,13 @@ DB 가 막지 않고 서버가 막는 것(조각 「기준정보」 PR C · D ·
   1 부터. 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다. **테이블을 더하는 조각은 되돌림의 목록에도 더한다** —
   스키마와 목록이 다르면 시험이 실패한다.
 - 코드 번호는 같은 머리의 가장 큰 번호 + 1 이다(`src/db/numbering.ts`) — 되돌린 뒤에는 샘플의 다음 번호부터 붙는다.
+- LOT 번호는 번호 규칙의 일련 표(`number_rule_seqs`)로 낸다(`src/db/number-rules.ts` 의 `issueLotNumber`) — 부르는 쪽의 트랜잭션 안에서
+  (규칙, 기간)의 행을 올리며 잠그고, 그 품목에 이미 있는 번호면 다음 일련으로 넘어간다. 되돌림이 일련 표를 비운다.
+- 샘플 수불(조각 「재고 수불」 PR C)은 되돌림이 재고 계산의 저장(`src/db/stock.ts` 의 `saveMove` · `cancelMove`)을 불러 넣는다 — 날짜는 되돌린 날
+  (한국 시각)에서 센 며칠 앞이라 SQL 로 쓰지 않는다. 그래서 데이터가 있는 DB 에는 마이그레이션이 샘플 수불을 넣지 않고, 배포 뒤 첫 매일 밤 되돌림
+  부터 보인다(`docs/deploy.md`). 샘플 수불이 반제품 · 완제품의 LOT 를 저절로 받으며 일련 표를 채운다.
+- 샘플 실사(조각 「재고 수불」 PR E)도 같다 — 샘플 수불 뒤에 되돌림이 실사의 열기 · 저장 · 확정(`src/db/stock-counts.ts`)을 불러 넣는다. 생산현장의
+  확정한 실사(`PI-<D-1>-001`)가 「실사 차이」 조정 전표 한 장(`IV-<D-1>-003`)을 만들고, 제품창고의 실사(`PI-<D-1>-002`)는 작성 중으로 남는다.
 
 ## 이름 규칙
 
@@ -67,7 +114,8 @@ DB 가 막지 않고 서버가 막는 것(조각 「기준정보」 PR C · D ·
 - 테이블은 Drizzle 의 TypeScript 스키마(`src/db/schema.ts`)로 쓰고, `npm run db:generate` 가 SQL 마이그레이션 파일을 `drizzle/`
   에 만든다. 파일은 레포에 올려 리뷰에서 바뀌는 SQL 이 보이게 한다. 만든 SQL 은 손으로 고치지 않는다.
 - 데이터를 옮기거나 채우는 SQL(예: 새 참조가 가리킬 공통코드 값)은 `npx drizzle-kit generate --custom --name <이름>` 으로 만든 빈 파일에
-  손으로 쓰고, 스키마의 마이그레이션 앞에 둔다(예: `0001_country_codes` → `0002_partner_country`, `0003_item_class_codes` → `0004_master_descriptive`). 빈 DB 에서는 아무것도 하지 않게 쓴다 —
+  손으로 쓰고, 스키마의 마이그레이션 앞에 둔다(예: `0001_country_codes` → `0002_partner_country`, `0003_item_class_codes` → `0004_master_descriptive`). 새 테이블을 채우는
+  것이면 그 테이블을 만드는 마이그레이션 뒤에 둔다(예: `0005_unit_specs` → `0006_unit_spec_values`). 빈 DB 에서는 아무것도 하지 않게 쓴다 —
   빈 DB 는 배포 빌드가 샘플 전체로 채운다.
 - 배포 빌드가 배포 전에 마이그레이션을 적용한다(`package.json` 의 `build` → `scripts/migrate.ts`, ADR 0005) — PR 미리보기는
   미리보기 분기 DB 에, `main` 은 운영 DB 에. 적용이 실패하면 빌드가 실패해 그 배포는 나가지 않고 데모는 앞 배포에 남는다.
@@ -77,20 +125,29 @@ DB 가 막지 않고 서버가 막는 것(조각 「기준정보」 PR C · D ·
   주소(호스트에 `-pooler`)뿐이면 잠금 없이 적용한다 — 풀에서는 잠금이 다른 접속에 남을 수 있다.
 - 한 빌드가 적용하는 마이그레이션은 한 트랜잭션이다 — 하나라도 틀리면 그 빌드의 마이그레이션은 하나도 적용되지 않는다.
 - **잠금**(대장 NC-13) — 한 트랜잭션이라, 이미 행이 있는 테이블을 바꾸는 `ALTER` 는 그 빌드의 마이그레이션이 다 끝날 때까지 그
-  테이블의 읽기 · 쓰기를 멈춘다(앞 배포의 화면이 기다린다). 새 검사(CHECK) · 새 참조(FK)는 이미 있는 행을 전부 검사하고, 참조는
-  가리키는 테이블(예: `codes`)의 쓰기도 멈춘다. 인덱스를 멈춤 없이 만드는 `CREATE INDEX CONCURRENTLY` 는 트랜잭션 안에서 돌지 않아
-  쓸 수 없다. 등록 상한이 있는 지금의 테이블(품목 2,000 · 거래처 1,000 따위)은 멈춤이 짧아 그대로 둔다. 상한 없이 쌓이는 테이블(예:
-  수불 기록)에 검사 · 참조를 더할 때는 `NOT VALID` 로 더하고 — 만든 SQL 을 손으로 고치지 않는다는 규칙의 예외로, PR 본문에 적는다 —
-  다음 PR 의 손으로 쓴 마이그레이션에서 `VALIDATE CONSTRAINT` 로 검사한다(쓰기를 멈추지 않는다). PR 본문에 잠그는 테이블을 적는다.
+  테이블을 잠근다(앞 배포의 화면이 기다린다). 대개 읽기 · 쓰기를 다 멈추고, 참조만 더하는 `ALTER` 는 쓰기만 멈춘다. 새 검사(CHECK) ·
+  새 참조(FK)는 이미 있는 행을 전부 검사하고, 참조는 가리키는 테이블(예: `codes`)의 쓰기도 멈춘다. 인덱스를 멈춤 없이 만드는
+  `CREATE INDEX CONCURRENTLY` 는 트랜잭션 안에서 돌지 않아 쓸 수 없다. 등록 상한이 있는 지금의 테이블(품목 2,000 · 거래처 1,000 따위)은
+  멈춤이 짧아 그대로 둔다. 상한 없이 쌓이는 테이블(예: 수불 기록)에는 형태마다 이렇게 쓴다(회차 22 OB-10). PR 본문에 잠그는 테이블을 적는다.
+  - **검사 · 참조를 더할 때** — `NOT VALID` 로 더하고 — 만든 SQL 을 손으로 고치지 않는다는 규칙의 예외로, PR 본문에 적는다 — 다음 PR 의
+    손으로 쓴 마이그레이션에서 `VALIDATE CONSTRAINT` 로 검사한다(쓰기를 멈추지 않는다).
+  - **이미 있는 칸에 `NOT NULL` 을 걸 때** — `SET NOT NULL` 은 전체를 검사하며 읽기 · 쓰기를 멈춘다. 위의 틀로 `CHECK (칸 IS NOT NULL) NOT VALID`
+    를 더하고, 다음 PR 에서 `VALIDATE` 한 뒤 `SET NOT NULL` 을 한다 — 검증된 검사가 있으면 `SET NOT NULL` 은 다시 읽지 않는다.
+  - **인덱스 · 유일 제약을 더할 때** — `CONCURRENTLY` 없는 인덱스는 만드는 동안 쓰기를 멈춘다(읽기는 된다). 이 마이그레이터에는 피하는 길이
+    없으므로, 테이블을 만드는 마이그레이션에서 함께 만든다. 나중에 꼭 더해야 하면 쓰기가 멈추는 것을 PR 본문에 적고 받아들인다.
+  - **표를 다시 쓰는 변경** — 칸의 타입 변경, 휘발성 기본값(`random()` · `gen_random_uuid()` 따위)을 단 `ADD COLUMN` 은 읽기 · 쓰기를 멈추고
+    전체를 다시 쓴다. 쓰지 않는다 — 새 칸을 더하고, 나눠서 채우고, 코드를 옮기는 차례로 한다.
 - **앞 배포의 코드와도 함께 돌게 쓴다**(ADR 0005) — 배포를 앞 배포로 되돌려도(Instant Rollback) DB 는 돌아가지 않는다.
   - 더하기만 한다 — 테이블 · 칸 · 제약을 더한다. 새 칸은 비워도 되거나 기본값이 있어야 앞 배포의 등록이 실패하지 않는다.
   - 이름 바꾸기 · 지우기는 두 PR 로 나눈다 — 첫 PR 은 새것을 더하고 코드를 옮긴다, 둘째 PR(첫 PR 이 데모에 나간 뒤)이 옛것을 지운다.
   - 제약을 좁히는 변경(새 검사 · 새 참조)은 이미 있는 행이 지키는지 먼저 본다 — 아니면 적용이 실패해 배포가 멈춘다.
   - 되돌릴 마이그레이션(down)은 만들지 않는다. 잘못된 마이그레이션은 그것을 고치는 새 마이그레이션으로 덮는다.
-  - **앞 배포의 매일 밤 되돌림도 함께 돈다**(대장 NC-11) — 그 되돌림은 테이블을 비우고 **앞 배포의 샘플**로 다시 채운다. 두 가지를 본다.
+  - **앞 배포의 매일 밤 되돌림도 함께 돈다**(대장 NC-11) — 그 되돌림은 테이블을 비우고 **앞 배포의 샘플**로 다시 채운다. 한 물음으로 본다 —
+    **앞 배포의 `RESET_TABLES` 비우기와 샘플 넣기가 새 스키마에서 그대로 되는가 — 값 · 참조 · 검사 · 유일 · 새 테이블의 참조**(회차 22 OB-11).
+    지금까지 걸린 예는 셋이다.
     새 참조 · 기본값이 가리키는 값(예: 공통코드)이 앞 배포의 샘플에도 있는가 — 없으면 앞 배포의 되돌림이 거절돼 매일 밤 되돌림이
     멈춘다(`0002_partner_country` 의 기본값 `KR` 은 `0001` 이 넣은 값이라 앞 배포의 샘플에 없었다). 데이터 마이그레이션이 넣은 값이
     앞 배포의 되돌림에 지워져도 새 코드가 도는가 — 지워지면 그 마이그레이션은 다시 돌지 않는다(`0003_item_class_codes`). 새 테이블이
     되돌림이 비우는 테이블(`src/db/reset.ts` 의 `RESET_TABLES`)을 참조해도 앞 배포의 되돌림이 거절된다 — 앞 배포의 목록에는 새 테이블이
-    없고 비우기에 `CASCADE` 가 없다(회차 16 OB-7). 걸리면 PR 본문에
+    없고 비우기에 `CASCADE` 가 없다(회차 16 OB-7 — `unit_specs` 가 `codes` 를 가리키는 조각 「재고 수불」 PR A 부터 걸린다). 걸리면 PR 본문에
     적고, 되돌릴 때는 `docs/deploy.md` 「되돌리기」의 마지막 문단대로 매일 밤 되돌림을 끈다.
diff --git a/src/app/design/model/page.tsx b/src/app/design/model/page.tsx
index 8b50170..8c7cad3 100644
--- a/src/app/design/model/page.tsx
+++ b/src/app/design/model/page.tsx
@@ -26,8 +26,8 @@ export default function DesignModelPage() {
 
       <h2 className="mt-12 text-xl font-semibold">이 조각의 테이블</h2>
       <p className="mt-1 max-w-3xl text-sm text-muted">
-        조각 「{CURRENT_SLICE}」가 만드는 테이블 다섯과 그 열입니다. PK 는 겹치지 않는 열쇠, UK 는 겹치지 않는 코드, FK
-        는 다른 테이블을 가리키는 열입니다. 공통코드 값은 「묶음 + 코드」가 함께 열쇠입니다.
+        조각 「{CURRENT_SLICE}」가 지금까지 만든 테이블과 그 열, 그리고 그것이 가리키는 테이블입니다. UK 는 겹치지 않는
+        코드, FK 는 다른 테이블을 가리키는 열입니다. 앞 조각의 테이블은 위의 지도에서 봅니다.
       </p>
       <div className="mt-4 border border-rule bg-white p-4">
         <MermaidDiagram source={DATA_MODEL} title={`조각 「${CURRENT_SLICE}」의 테이블과 그 열`} />
diff --git a/src/app/inventory/warehouses/[code]/page.tsx b/src/app/inventory/warehouses/[code]/page.tsx
index a6ce72a..10d4e33 100644
--- a/src/app/inventory/warehouses/[code]/page.tsx
+++ b/src/app/inventory/warehouses/[code]/page.tsx
@@ -52,7 +52,11 @@ async function EditWarehouse({ params }: Pick<PageProps<"/inventory/warehouses/[
         code={warehouse.code}
         version={warehouse.version}
         action={updateWarehouseAction.bind(null, warehouse.code)}
-        initial={{ name: warehouse.name, active: warehouse.active ? "Y" : "N" }}
+        initial={{
+          name: warehouse.name,
+          isDefect: warehouse.isDefect ? "on" : "off",
+          active: warehouse.active ? "Y" : "N",
+        }}
       />
     </>
   );
diff --git a/src/app/inventory/warehouses/new/page.tsx b/src/app/inventory/warehouses/new/page.tsx
index 4cd4e02..f2a38fb 100644
--- a/src/app/inventory/warehouses/new/page.tsx
+++ b/src/app/inventory/warehouses/new/page.tsx
@@ -40,6 +40,11 @@ async function NewWarehouseForm() {
     return <LoadFailed what="입력 화면" error={error} />;
   }
   return (
-    <WarehouseForm mode="create" action={createWarehouseAction} previewCode={previewCode} initial={{ name: "" }} />
+    <WarehouseForm
+      mode="create"
+      action={createWarehouseAction}
+      previewCode={previewCode}
+      initial={{ name: "", isDefect: "off" }}
+    />
   );
 }
diff --git a/src/app/inventory/warehouses/warehouse-form.tsx b/src/app/inventory/warehouses/warehouse-form.tsx
index 3c75341..b34db48 100644
--- a/src/app/inventory/warehouses/warehouse-form.tsx
+++ b/src/app/inventory/warehouses/warehouse-form.tsx
@@ -1,7 +1,16 @@
 "use client";
 
 import { startTransition, useActionState, type FormEvent } from "react";
-import { ActiveSection, ErrorSummary, Field, FormActions, Input, ReadOnly, Section } from "@/components/form-parts";
+import {
+  ActiveSection,
+  Check,
+  ErrorSummary,
+  Field,
+  FormActions,
+  Input,
+  ReadOnly,
+  Section,
+} from "@/components/form-parts";
 import {
   WAREHOUSE_FIELDS,
   type WarehouseErrors,
@@ -25,7 +34,7 @@ type Props = {
     }
 );
 
-const LABEL: Record<WarehouseField, string> = { name: "창고명", active: "사용 여부" };
+const LABEL: Record<WarehouseField, string> = { name: "창고명", isDefect: "불량창고", active: "사용 여부" };
 
 export function WarehouseForm(props: Props) {
   const [state, formAction, pending] = useActionState(props.action, null);
@@ -63,9 +72,24 @@ export function WarehouseForm(props: Props) {
             <Input field="name" defaultValue={v.name} maxLength={50} invalid={!!errors.name} />
           </Field>
         </Section>
+        <DefectSection initial={v.isDefect === "on"} error={errors.isDefect} />
         {props.mode === "edit" && <ActiveSection what="창고" initial={v.active} error={errors.active} />}
       </div>
       <FormActions pending={pending} cancelHref="/inventory/warehouses" />
     </form>
   );
 }
+
+/** 불량창고 표시(조각 「재고 수불」 PR B, ADR 0015) — 그 창고의 재고는 불량이라 가용에 들지 않는다. */
+function DefectSection({ initial, error }: { initial: boolean; error?: string }) {
+  return (
+    <Section
+      title="불량창고"
+      note="불량창고의 재고는 불량이라 가용재고에 들지 않고, 수불관리에서 내보내지 못합니다. 품목의 기본 창고로 고르지 못합니다."
+    >
+      <Check name="isDefect" defaultChecked={initial} error={error}>
+        불량창고
+      </Check>
+    </Section>
+  );
+}
diff --git a/src/app/inventory/warehouses/warehouse-list.tsx b/src/app/inventory/warehouses/warehouse-list.tsx
index 0a74d5b..9d8016b 100644
--- a/src/app/inventory/warehouses/warehouse-list.tsx
+++ b/src/app/inventory/warehouses/warehouse-list.tsx
@@ -121,6 +121,11 @@ export function WarehouseList({
               </td>
               <td className="px-3 py-2.5 wrap-anywhere">
                 <span className="font-semibold">{w.name}</span>
+                {w.isDefect && (
+                  <span className="ml-2 rounded border border-red-700 px-1.5 py-0.5 text-xs whitespace-nowrap text-red-700">
+                    불량창고
+                  </span>
+                )}
                 {!w.active && (
                   <span className="ml-2 rounded border border-rule px-1.5 py-0.5 text-xs whitespace-nowrap">
                     사용 안 함
diff --git a/src/app/master/items/[code]/page.tsx b/src/app/master/items/[code]/page.tsx
index 32e5542..37b575d 100644
--- a/src/app/master/items/[code]/page.tsx
+++ b/src/app/master/items/[code]/page.tsx
@@ -4,9 +4,12 @@ import { notFound } from "next/navigation";
 import { connection } from "next/server";
 import { Suspense } from "react";
 import { LoadFailed } from "@/components/load-failed";
-import { getItem, itemClassOptions, unitOptions, type Item } from "@/db/items";
+import { getItem, itemClassOptions, stockLists, unitOptions, type Item } from "@/db/items";
+import { ruleOptions } from "@/db/number-rules";
 import { withDb } from "@/db/request";
 import type { ItemValues } from "@/lib/item-input";
+import { warehouseCodeOf, type StockLists } from "@/lib/item-stock";
+import { koreaToday } from "@/lib/today";
 import { updateItemAction } from "../actions";
 import { ItemForm } from "../item-form";
 
@@ -33,13 +36,17 @@ export default function EditItemPage({ params }: PageProps<"/master/items/[code]
   );
 }
 
-const asValues = (item: Item): ItemValues => ({
+const asValues = (item: Item, lists: StockLists): ItemValues => ({
   procurement: item.procurement,
   name: item.name,
   spec: item.spec,
   unit: item.unit,
   inspectIn: item.inspectIn ? "on" : "off",
   inspectOut: item.inspectOut ? "on" : "off",
+  lotManaged: item.lotManaged ? "on" : "off",
+  lotRuleCode: item.lotRuleCode ?? "",
+  defaultInWarehouse: warehouseCodeOf(lists, item.defaultInWarehouseId),
+  defaultOutWarehouse: warehouseCodeOf(lists, item.defaultOutWarehouseId),
   leadTimeDays: String(item.leadTimeDays),
   safetyStock: String(item.safetyStock),
   minLot: String(item.minLot),
@@ -58,13 +65,21 @@ async function EditItem({ params }: Pick<PageProps<"/master/items/[code]">, "par
   try {
     data = await withDb(async (db) => {
       const item = await getItem(db, decodeURIComponent(code));
-      return item && { item, units: await unitOptions(db, item.unit), classes: await itemClassOptions(db, item) };
+      return (
+        item && {
+          item,
+          units: await unitOptions(db, item.unit),
+          classes: await itemClassOptions(db, item),
+          rules: await ruleOptions(db, koreaToday()),
+          stock: await stockLists(db),
+        }
+      );
     });
   } catch (error) {
     return <LoadFailed what="품목" error={error} />;
   }
   if (!data) notFound();
-  const { item, units, classes } = data;
+  const { item, units, classes, rules, stock } = data;
   return (
     <>
       <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
@@ -78,7 +93,9 @@ async function EditItem({ params }: Pick<PageProps<"/master/items/[code]">, "par
         action={updateItemAction.bind(null, item.code)}
         units={units}
         classes={classes}
-        initial={asValues(item)}
+        rules={rules}
+        warehouses={stock.warehouses}
+        initial={asValues(item, stock)}
       />
     </>
   );
diff --git a/src/app/master/items/inquiry/item-inquiry.tsx b/src/app/master/items/inquiry/item-inquiry.tsx
index 588136e..1f1415a 100644
--- a/src/app/master/items/inquiry/item-inquiry.tsx
+++ b/src/app/master/items/inquiry/item-inquiry.tsx
@@ -1,14 +1,21 @@
 import type { Item, ItemClassOptions } from "@/db/items";
 import { dateKst, orDash, type InquiryColumn } from "@/components/inquiry-table";
 import { ITEM_CLASSES } from "@/lib/item-fields";
-import { itemTypeName, procTypeName } from "@/lib/master-codes";
+import type { StockLists } from "@/lib/item-stock";
+import { isMadeType, itemTypeName, procTypeName } from "@/lib/master-codes";
 
 // 품목 조회의 칸 — 한 건 등록 화면 · 시트의 순서 그대로, 끝에 사용 여부 · 수정일(저자 판정 2026-11-04).
 // 품명은 왼쪽에 붙는 칸(코드 · 품명)에 있다.
 
 const qty = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
 
-export function itemInquiryColumns(classes: ItemClassOptions): InquiryColumn<Item>[] {
+export function itemInquiryColumns(classes: ItemClassOptions, stock: StockLists): InquiryColumn<Item>[] {
+  // 창고는 코드와 이름으로 — 목록에 없는 번호는 그대로(지우는 길이 없어 생기지 않는다).
+  const warehouse = (id: number | null) => {
+    if (id === null) return "—";
+    const w = stock.warehouses.find((x) => x.id === id);
+    return w ? `${w.code} ${w.name}` : String(id);
+  };
   return [
     { label: "유형", cell: (i) => itemTypeName(i.itemType) },
     { label: "규격", cell: (i) => orDash(i.spec), long: true },
@@ -18,6 +25,15 @@ export function itemInquiryColumns(classes: ItemClassOptions): InquiryColumn<Ite
       label: "검사 대상",
       cell: (i) => [i.inspectIn && "수입", i.inspectOut && "출하"].filter(Boolean).join(" · ") || "—",
     },
+    // 재고(조각 「재고 수불」 PR B) — 규칙은 반제품 · 완제품만 있고, 비우면 유형의 기본 규칙이다.
+    { label: "LOT 관리", cell: (i) => (i.lotManaged ? "함" : "안 함") },
+    {
+      label: "LOT 번호 규칙",
+      cell: (i) => (isMadeType(i.itemType) ? (i.lotRuleCode ?? "유형의 기본") : "—"),
+      mono: true,
+    },
+    { label: "기본 입고 창고", cell: (i) => warehouse(i.defaultInWarehouseId) },
+    { label: "기본 출고 창고", cell: (i) => warehouse(i.defaultOutWarehouseId) },
     { label: "리드타임", cell: (i) => `${i.leadTimeDays}일`, numeric: true },
     { label: "안전재고", cell: (i) => qty(i.safetyStock), numeric: true },
     { label: "최소 발주 · 생산량", cell: (i) => qty(i.minLot), numeric: true },
diff --git a/src/app/master/items/inquiry/page.tsx b/src/app/master/items/inquiry/page.tsx
index 380c4e4..f9740e5 100644
--- a/src/app/master/items/inquiry/page.tsx
+++ b/src/app/master/items/inquiry/page.tsx
@@ -2,7 +2,7 @@ import type { Metadata } from "next";
 import Link from "next/link";
 import { connection } from "next/server";
 import { Suspense } from "react";
-import { allItemClasses, listItems, parseItemFilter } from "@/db/items";
+import { allItemClasses, listItems, parseItemFilter, stockLists } from "@/db/items";
 import { withDb } from "@/db/request";
 import { InquiryTable } from "@/components/inquiry-table";
 import { LoadFailed } from "@/components/load-failed";
@@ -47,7 +47,7 @@ async function Results({ searchParams }: Pick<PageProps<"/master/items/inquiry">
     data = await withDb(async (db) => {
       const classes = await allItemClasses(db);
       const { filter, notices } = parseItemFilter(params, classes);
-      return { classes, filter, notices, rows: await listItems(db, filter, "allText") };
+      return { classes, filter, notices, rows: await listItems(db, filter, "allText"), stock: await stockLists(db) };
     });
   } catch (error) {
     return <LoadFailed error={error} what="품목 조회" />;
@@ -67,7 +67,7 @@ async function Results({ searchParams }: Pick<PageProps<"/master/items/inquiry">
       </div>
       <InquiryTable
         rows={data.rows}
-        columns={itemInquiryColumns(classes)}
+        columns={itemInquiryColumns(classes, data.stock)}
         what="품목"
         nameLabel="품명"
         editHref={(code) => `/master/items/${code}`}
diff --git a/src/app/master/items/item-form.tsx b/src/app/master/items/item-form.tsx
index 9f43669..fdf3131 100644
--- a/src/app/master/items/item-form.tsx
+++ b/src/app/master/items/item-form.tsx
@@ -1,9 +1,10 @@
 "use client";
 
-import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
+import { startTransition, useActionState, useState, type FormEvent } from "react";
 import {
   ActiveSection,
   Check,
+  Choice,
   ErrorSummary,
   Field,
   FormActions,
@@ -13,6 +14,8 @@ import {
   inputClass,
 } from "@/components/form-parts";
 import type { ItemClassOptions, UnitOption } from "@/db/items";
+import type { RuleOption } from "@/db/number-rules";
+import type { WarehouseChoice } from "@/lib/item-stock";
 import {
   ITEM_CLASSES,
   ITEM_FIELDS,
@@ -21,17 +24,29 @@ import {
   type ItemField,
   type ItemValues,
 } from "@/lib/item-fields";
-import { ITEM_TYPE_DEFAULTS, ITEM_TYPES, PROC_TYPES, itemTypeName, type ItemType } from "@/lib/master-codes";
+import {
+  ITEM_TYPE_DEFAULTS,
+  ITEM_TYPES,
+  PROC_TYPES,
+  isMadeType,
+  itemTypeName,
+  type ItemType,
+} from "@/lib/master-codes";
 import type { ItemFormState } from "./actions";
 
 // 품목 등록 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
-// 유형을 고르면 조달구분 · 검사 대상의 기본값이 붙는다(ADR 0003) — 그 뒤에 바꿀 수 있다.
+// 유형을 고르면 조달구분 · 검사 대상 · LOT 관리의 기본값이 붙는다(ADR 0003 · 0019) — 그 뒤에 바꿀 수 있다.
+// LOT 번호 규칙은 반제품 · 완제품만 고른다(ADR 0016). 기본 창고는 불량창고를 고르지 못한다(ADR 0015).
 
 type Props = {
   action: (state: ItemFormState, form: FormData) => Promise<ItemFormState>;
   units: UnitOption[];
   /** 분류 묶음마다 고를 수 있는 값 — 사용 중인 것과, 수정이면 그 품목의 지금 값. */
   classes: ItemClassOptions;
+  /** LOT 번호 규칙 — 「사용 안 함」까지(고르는 목록은 사용 중인 것과 그 품목의 지금 값). 번호의 예는 오늘의 첫 번호. */
+  rules: RuleOption[];
+  /** 창고 — 「사용 안 함」 · 불량창고까지(고르는 목록은 사용 중이고 불량창고가 아닌 것과 그 품목의 지금 값). */
+  warehouses: WarehouseChoice[];
   initial: ItemValues;
 } & (
   | { mode: "create"; previewCodes: Record<ItemType, string> }
@@ -52,6 +67,10 @@ const LABEL: Partial<Record<ItemField, string>> = {
   unit: "단위",
   inspectIn: "수입검사 대상",
   inspectOut: "출하검사 대상",
+  lotManaged: "LOT 관리",
+  lotRuleCode: "LOT 번호 규칙",
+  defaultInWarehouse: "기본 입고 창고",
+  defaultOutWarehouse: "기본 출고 창고",
   leadTimeDays: "리드타임",
   safetyStock: "안전재고",
   minLot: "최소 발주 · 생산량",
@@ -98,6 +117,8 @@ function Fields(props: Props & { values: ItemValues; errors: ItemErrors }) {
   const [inspectIn, setInspectIn] = useState(v.inspectIn === "on");
   const [inspectOut, setInspectOut] = useState(v.inspectOut === "on");
   const [unit, setUnit] = useState(v.unit ?? "");
+  const [lotManaged, setLotManaged] = useState(v.lotManaged === "on");
+  const [lotRule, setLotRule] = useState(v.lotRuleCode ?? "");
 
   function pickType(type: ItemType) {
     setItemType(type);
@@ -105,8 +126,16 @@ function Fields(props: Props & { values: ItemValues; errors: ItemErrors }) {
     setProcurement(d.procurement);
     setInspectIn(d.inspectIn);
     setInspectOut(d.inspectOut);
+    setLotManaged(d.lotManaged);
+    if (!isMadeType(type)) setLotRule("");
   }
 
+  // 수정이면 그 품목의 유형, 등록이면 고른 유형.
+  const type = props.mode === "edit" ? props.itemType : itemType;
+  const initialRule = props.initial.lotRuleCode ?? "";
+  const rules = props.rules.filter((r) => r.active || (props.mode === "edit" && r.code === initialRule));
+  const typeDefault = props.rules.find((r) => r.defaultFor === type);
+
   // 조달구분이 구매면 발주에, 생산이면 생산에 쓰인다(ADR 0003).
   const lot = procurement === "BUY" ? "발주" : procurement === "MAKE" ? "생산" : "발주 · 생산";
   const unitShown = unit || "단위";
@@ -196,6 +225,94 @@ function Fields(props: Props & { values: ItemValues; errors: ItemErrors }) {
         </div>
       </Section>
 
+      <Section
+        title="재고"
+        note="수불관리의 등록 화면(기타입고 · 기타출고 · 재고이동 · 재고조정)이 씁니다. 기본 창고는 품목을 고르면 창고 칸에 미리 채워지고, 그 화면에서 바꿀 수 있습니다."
+      >
+        <div>
+          <Check name="lotManaged" checked={lotManaged} onChange={setLotManaged} error={errors.lotManaged}>
+            LOT 관리
+          </Check>
+          <p className="mt-1 text-sm text-muted">
+            켜면 수불마다 LOT 를 남깁니다. 원자재 · 반제품 · 완제품은 켬, 부자재 · 소모품은 끔이 기본입니다.
+          </p>
+        </div>
+        {isMadeType(type) ? (
+          <Field
+            field="lotRuleCode"
+            label="LOT 번호 규칙"
+            error={errors.lotRuleCode}
+            hint="입고에서 LOT 를 비우면 이 규칙으로 붙습니다"
+          >
+            <select
+              id="f-lotRuleCode"
+              name="lotRuleCode"
+              value={lotRule}
+              onChange={(e) => setLotRule(e.target.value)}
+              aria-invalid={!!errors.lotRuleCode || undefined}
+              aria-describedby={errors.lotRuleCode ? "e-lotRuleCode" : undefined}
+              className={inputClass(!!errors.lotRuleCode)}
+            >
+              <option value="">
+                {typeDefault ? `유형의 기본 — ${typeDefault.code} (${typeDefault.example})` : "유형의 기본"}
+              </option>
+              {rules.map((r) => (
+                <option key={r.code} value={r.code}>
+                  {r.code} — {r.name} ({r.example}){r.active ? "" : " (사용 안 함)"}
+                </option>
+              ))}
+            </select>
+          </Field>
+        ) : (
+          <div>
+            <input type="hidden" name="lotRuleCode" value="" />
+            <p className="text-sm text-muted" id="f-lotRuleCode">
+              {type
+                ? "사 오는 품목은 LOT 번호 규칙이 없습니다 — 입고할 때 거래처 LOT 를 넣습니다."
+                : "LOT 번호 규칙은 반제품 · 완제품을 고르면 보입니다."}
+            </p>
+            {errors.lotRuleCode && (
+              <p id="e-lotRuleCode" className="mt-1 text-sm font-semibold text-red-700">
+                {errors.lotRuleCode}
+              </p>
+            )}
+          </div>
+        )}
+        <div className="grid gap-6 sm:grid-cols-2">
+          {(
+            [
+              ["defaultInWarehouse", "기본 입고 창고"],
+              ["defaultOutWarehouse", "기본 출고 창고"],
+            ] as const
+          ).map(([field, label]) => {
+            const now = props.initial[field] ?? "";
+            const options = props.warehouses.filter(
+              (w) => (w.active && !w.isDefect) || (props.mode === "edit" && w.code === now),
+            );
+            return (
+              <Field key={field} field={field} label={label} error={errors[field]}>
+                <select
+                  id={`f-${field}`}
+                  name={field}
+                  defaultValue={v[field] ?? ""}
+                  aria-invalid={!!errors[field] || undefined}
+                  aria-describedby={errors[field] ? `e-${field}` : undefined}
+                  className={inputClass(!!errors[field])}
+                >
+                  <option value="">없음</option>
+                  {options.map((w) => (
+                    <option key={w.code} value={w.code}>
+                      {w.code} — {w.name}
+                      {w.active ? "" : " (사용 안 함)"}
+                    </option>
+                  ))}
+                </select>
+              </Field>
+            );
+          })}
+        </div>
+      </Section>
+
       <Section title="계획 정보" note="MRP 가 씁니다. 수량은 품목의 단위로, 소수 셋째 자리까지.">
         <div className="grid gap-6 sm:grid-cols-2">
           <Field field="leadTimeDays" label="리드타임" error={errors.leadTimeDays} hint="0 ~ 365">
@@ -278,28 +395,3 @@ function Fields(props: Props & { values: ItemValues; errors: ItemErrors }) {
     </div>
   );
 }
-
-function Choice({
-  name,
-  value,
-  checked,
-  onChange,
-  children,
-}: {
-  name: string;
-  value: string;
-  checked: boolean;
-  onChange: () => void;
-  children: ReactNode;
-}) {
-  return (
-    <label
-      className={`cursor-pointer rounded border px-4 py-2 has-focus-visible:outline-2 has-focus-visible:outline-machine ${
-        checked ? "border-machine bg-machine font-semibold text-white" : "border-rule bg-white hover:border-machine"
-      }`}
-    >
-      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
-      {children}
-    </label>
-  );
-}
diff --git a/src/app/master/items/new/page.tsx b/src/app/master/items/new/page.tsx
index 0b7977f..bded84d 100644
--- a/src/app/master/items/new/page.tsx
+++ b/src/app/master/items/new/page.tsx
@@ -3,8 +3,10 @@ import Link from "next/link";
 import { connection } from "next/server";
 import { Suspense } from "react";
 import { LoadFailed } from "@/components/load-failed";
-import { itemClassOptions, previewCodes, unitOptions } from "@/db/items";
+import { itemClassOptions, previewCodes, stockLists, unitOptions } from "@/db/items";
+import { ruleOptions } from "@/db/number-rules";
 import { withDb } from "@/db/request";
+import { koreaToday } from "@/lib/today";
 import { createItemAction } from "../actions";
 import { ItemForm } from "../item-form";
 
@@ -31,11 +33,15 @@ export default function NewItemPage() {
   );
 }
 
-// 처음 칸 — 계획 정보는 0(없음)에서 시작한다. 유형을 고르면 조달구분 · 검사 대상이 붙는다.
+// 처음 칸 — 계획 정보는 0(없음)에서 시작한다. 유형을 고르면 조달구분 · 검사 대상 · LOT 관리가 붙는다.
+// LOT 번호 규칙은 유형의 기본, 기본 창고는 없음에서 시작한다.
 const BLANK = {
   name: "",
   spec: "",
   unit: "",
+  lotRuleCode: "",
+  defaultInWarehouse: "",
+  defaultOutWarehouse: "",
   leadTimeDays: "0",
   safetyStock: "0",
   minLot: "0",
@@ -54,6 +60,8 @@ async function NewItemForm() {
       units: await unitOptions(db),
       classes: await itemClassOptions(db),
       codes: await previewCodes(db),
+      rules: await ruleOptions(db, koreaToday()),
+      stock: await stockLists(db),
     }));
   } catch (error) {
     return <LoadFailed what="입력 화면" error={error} />;
@@ -64,6 +72,8 @@ async function NewItemForm() {
       action={createItemAction}
       units={data.units}
       classes={data.classes}
+      rules={data.rules}
+      warehouses={data.stock.warehouses}
       previewCodes={data.codes}
       initial={BLANK}
     />
diff --git a/src/app/master/items/sheet/page.tsx b/src/app/master/items/sheet/page.tsx
index 097d45d..6af7182 100644
--- a/src/app/master/items/sheet/page.tsx
+++ b/src/app/master/items/sheet/page.tsx
@@ -5,7 +5,7 @@ import { Suspense } from "react";
 import { LoadFailed } from "@/components/load-failed";
 import { SheetGrid } from "@/components/sheet-grid";
 import { SheetLoadFilters } from "@/components/sheet-load-filters";
-import { allItemClasses, itemClassOptions, unitOptions } from "@/db/items";
+import { allItemClasses, itemClassOptions, stockLists, unitOptions } from "@/db/items";
 import { withDb } from "@/db/request";
 import { ITEM_CLASSES } from "@/lib/item-fields";
 import { ITEM_TYPES, PROC_TYPES } from "@/lib/master-codes";
@@ -49,13 +49,17 @@ async function ItemSheet() {
       units: await unitOptions(db),
       classes: await itemClassOptions(db),
       allClasses: await allItemClasses(db),
+      stock: await stockLists(db),
     }));
   } catch (error) {
     return <LoadFailed what="입력 화면" error={error} />;
   }
   return (
     <SheetGrid
-      columns={itemSheetColumns(data.units, data.classes)}
+      columns={itemSheetColumns(data.units, data.classes, {
+        rules: data.stock.rules.filter((r) => r.active),
+        warehouses: data.stock.warehouses.filter((w) => w.active && !w.isDefect),
+      })}
       action={saveItemSheetAction}
       what="품목"
       listHref="/master/items"
diff --git a/src/app/system/codes/[group]/[code]/page.tsx b/src/app/system/codes/[group]/[code]/page.tsx
index ea01cd7..1740a87 100644
--- a/src/app/system/codes/[group]/[code]/page.tsx
+++ b/src/app/system/codes/[group]/[code]/page.tsx
@@ -3,8 +3,9 @@ import { notFound } from "next/navigation";
 import { connection } from "next/server";
 import { Suspense } from "react";
 import { LoadFailed } from "@/components/load-failed";
-import { getCode, getCodeGroup } from "@/db/codes";
+import { getCode, getCodeGroup, getUnitSpec } from "@/db/codes";
 import { withDb } from "@/db/request";
+import { UNIT_GROUP } from "@/lib/code-fields";
 import { isAlwaysActive } from "@/lib/master-codes";
 import { updateCodeAction } from "../../actions";
 import { CodeForm } from "../../code-form";
@@ -32,13 +33,14 @@ async function EditCode({ params }: Pick<PageProps<"/system/codes/[group]/[code]
     data = await withDb(async (db) => {
       const group = await getCodeGroup(db, decodeURIComponent(rawGroup));
       const code = group && (await getCode(db, group.code, decodeURIComponent(rawCode)));
-      return group && code && { group, code };
+      const spec = group?.code === UNIT_GROUP && code ? await getUnitSpec(db, code.code) : undefined;
+      return group && code && { group, code, spec };
     });
   } catch (error) {
     return <LoadFailed what="공통코드" error={error} />;
   }
   if (!data || data.group.isSystem) notFound();
-  const { group, code } = data;
+  const { group, code, spec } = data;
   return (
     <>
       <Crumbs group={group} last="수정" />
@@ -52,7 +54,13 @@ async function EditCode({ params }: Pick<PageProps<"/system/codes/[group]/[code]
         version={code.version}
         alwaysActive={isAlwaysActive(group.code, code.code)}
         action={updateCodeAction.bind(null, group.code, code.code)}
-        initial={{ name: code.name, sortOrder: String(code.sortOrder), active: code.active ? "Y" : "N" }}
+        initial={{
+          name: code.name,
+          sortOrder: String(code.sortOrder),
+          active: code.active ? "Y" : "N",
+          decimals: spec ? String(spec.decimals) : undefined,
+        }}
+        unit={spec ? { mode: "edit", baseUnit: spec.baseUnit, factor: spec.factor } : undefined}
       />
     </>
   );
diff --git a/src/app/system/codes/[group]/new/page.tsx b/src/app/system/codes/[group]/new/page.tsx
index db1381d..6fa959e 100644
--- a/src/app/system/codes/[group]/new/page.tsx
+++ b/src/app/system/codes/[group]/new/page.tsx
@@ -3,8 +3,9 @@ import { notFound } from "next/navigation";
 import { connection } from "next/server";
 import { Suspense } from "react";
 import { LoadFailed } from "@/components/load-failed";
-import { getCodeGroup, nextSortOrder } from "@/db/codes";
+import { baseUnitOptions, getCodeGroup, nextSortOrder } from "@/db/codes";
 import { withDb } from "@/db/request";
+import { UNIT_GROUP } from "@/lib/code-fields";
 import { createCodeAction } from "../../actions";
 import { CodeForm } from "../../code-form";
 import { Crumbs } from "../../crumbs";
@@ -29,13 +30,19 @@ async function NewCode({ params }: Pick<PageProps<"/system/codes/[group]/new">,
   try {
     data = await withDb(async (db) => {
       const group = await getCodeGroup(db, decodeURIComponent(raw));
-      return group && { group, sortOrder: await nextSortOrder(db, group.code) };
+      return (
+        group && {
+          group,
+          sortOrder: await nextSortOrder(db, group.code),
+          bases: group.code === UNIT_GROUP ? await baseUnitOptions(db) : undefined,
+        }
+      );
     });
   } catch (error) {
     return <LoadFailed what="입력 화면" error={error} />;
   }
   if (!data || data.group.isSystem) notFound();
-  const { group, sortOrder } = data;
+  const { group, sortOrder, bases } = data;
   return (
     <>
       <Crumbs group={group} last="새 값" />
@@ -44,7 +51,8 @@ async function NewCode({ params }: Pick<PageProps<"/system/codes/[group]/new">,
         mode="create"
         group={{ code: group.code, name: group.name }}
         action={createCodeAction.bind(null, group.code)}
-        initial={{ code: "", name: "", sortOrder: String(sortOrder) }}
+        initial={{ code: "", name: "", sortOrder: String(sortOrder), baseUnit: "", factor: "", decimals: "0" }}
+        unit={bases ? { mode: "create", bases } : undefined}
       />
     </>
   );
diff --git a/src/app/system/codes/[group]/page.tsx b/src/app/system/codes/[group]/page.tsx
index 2afd518..535a2b3 100644
--- a/src/app/system/codes/[group]/page.tsx
+++ b/src/app/system/codes/[group]/page.tsx
@@ -4,9 +4,9 @@ import { notFound } from "next/navigation";
 import { connection } from "next/server";
 import { Suspense } from "react";
 import { LoadFailed } from "@/components/load-failed";
-import { getCodeGroup, listCodeGroups, listCodes } from "@/db/codes";
+import { getCodeGroup, listCodeGroups, listCodes, listUnitSpecs } from "@/db/codes";
 import { withDb } from "@/db/request";
-import { MINOR_CODE } from "@/lib/code-fields";
+import { MINOR_CODE, UNIT_GROUP } from "@/lib/code-fields";
 import { CodeTable, GroupPicker, Kind, SavedNotice } from "../code-list";
 import { Crumbs } from "../crumbs";
 
@@ -35,7 +35,12 @@ async function Group({ params, searchParams }: PageProps<"/system/codes/[group]"
     data = await withDb(async (db) => {
       const group = await getCodeGroup(db, code);
       if (!group) return undefined;
-      return { group, groups: await listCodeGroups(db), rows: await listCodes(db, group.code) };
+      return {
+        group,
+        groups: await listCodeGroups(db),
+        rows: await listCodes(db, group.code),
+        specs: group.code === UNIT_GROUP ? await listUnitSpecs(db) : undefined,
+      };
     });
   } catch (error) {
     return (
@@ -46,7 +51,7 @@ async function Group({ params, searchParams }: PageProps<"/system/codes/[group]"
     );
   }
   if (!data) notFound();
-  const { group, groups, rows } = data;
+  const { group, groups, rows, specs } = data;
   const saved = savedCode ? rows.find((r) => r.code === savedCode) : undefined;
 
   return (
@@ -75,7 +80,13 @@ async function Group({ params, searchParams }: PageProps<"/system/codes/[group]"
         )}
       </div>
       {saved && <SavedNotice code={saved} />}
-      <CodeTable group={group} rows={rows} savedCode={saved?.code} />
+      {specs && (
+        <p className="mt-4 text-sm text-muted">
+          같은 기준 단위끼리는 수불관리의 등록 화면에서 바꿔 넣습니다 — 예: KG 은 기준 G 의 1000 배. 소수 자릿수는 수불
+          수량이 들어가는 자리입니다.
+        </p>
+      )}
+      <CodeTable group={group} rows={rows} savedCode={saved?.code} specs={specs} />
     </>
   );
 }
diff --git a/src/app/system/codes/code-form.tsx b/src/app/system/codes/code-form.tsx
index a6fe366..f124bd2 100644
--- a/src/app/system/codes/code-form.tsx
+++ b/src/app/system/codes/code-form.tsx
@@ -1,17 +1,32 @@
 "use client";
 
 import { startTransition, useActionState, type FormEvent } from "react";
-import { ActiveSection, ErrorSummary, Field, FormActions, Input, ReadOnly, Section } from "@/components/form-parts";
-import { CODE_FIELDS, type CodeErrors, type CodeField, type CodeValues } from "@/lib/code-fields";
+import {
+  ActiveSection,
+  ErrorSummary,
+  Field,
+  FormActions,
+  Input,
+  ReadOnly,
+  Section,
+  inputClass,
+} from "@/components/form-parts";
+import { CODE_FIELDS, factorText, type CodeErrors, type CodeField, type CodeValues } from "@/lib/code-fields";
 import type { CodeFormState } from "./actions";
 
 // 공통코드 값 추가 · 수정 화면의 입력 칸. 검사는 서버가 하고(설계 ②), 화면은 거절된 칸과 까닭을 칸 옆에 보인다.
 // 사용자 코드 묶음에서만 열린다 — 시스템 코드 묶음에는 이 화면이 없다.
 
+/** 단위(UNIT) 묶음의 사양 칸 — 새 단위는 기준으로 고를 단위를, 수정은 바뀌지 않는 기준 · 배수를 받는다(ADR 0017). */
+export type UnitSpecProps =
+  { mode: "create"; bases: { code: string; name: string }[] } | { mode: "edit"; baseUnit: string; factor: number };
+
 type Props = {
   action: (state: CodeFormState, form: FormData) => Promise<CodeFormState>;
   group: { code: string; name: string };
   initial: CodeValues;
+  /** 단위 묶음이면 있다 — 다른 묶음에는 사양 칸이 없다. */
+  unit?: UnitSpecProps;
 } & (
   | { mode: "create" }
   | {
@@ -24,7 +39,15 @@ type Props = {
     }
 );
 
-const LABEL: Record<CodeField, string> = { code: "코드", name: "이름", sortOrder: "정렬 순서", active: "사용 여부" };
+const LABEL: Record<CodeField, string> = {
+  code: "코드",
+  name: "이름",
+  sortOrder: "정렬 순서",
+  active: "사용 여부",
+  baseUnit: "기준 단위",
+  factor: "배수",
+  decimals: "소수 자릿수",
+};
 
 export function CodeForm(props: Props) {
   const [state, formAction, pending] = useActionState(props.action, null);
@@ -85,6 +108,7 @@ export function CodeForm(props: Props) {
             </Field>
           </div>
         </Section>
+        {props.unit && <UnitSpecSection unit={props.unit} values={v} errors={errors} />}
         {props.mode === "edit" && props.alwaysActive && (
           <Section
             title="사용 여부"
@@ -106,3 +130,78 @@ export function CodeForm(props: Props) {
     </form>
   );
 }
+
+const DECIMALS = ["0", "1", "2", "3"] as const;
+
+/** 단위 사양 — 기준 단위 · 배수 · 소수 자릿수. 새 단위는 셋을 다 넣고, 수정은 소수 자릿수만 고친다. */
+function UnitSpecSection({ unit, values, errors }: { unit: UnitSpecProps; values: CodeValues; errors: CodeErrors }) {
+  const decimalsField = (
+    <Field field="decimals" label="소수 자릿수" error={errors.decimals} hint="0 ~ 3 — 0 이면 정수만">
+      <select
+        id="f-decimals"
+        name="decimals"
+        defaultValue={values.decimals ?? "0"}
+        aria-invalid={!!errors.decimals || undefined}
+        aria-describedby={errors.decimals ? "e-decimals" : undefined}
+        className={inputClass(!!errors.decimals)}
+      >
+        {DECIMALS.map((d) => (
+          <option key={d} value={d}>
+            {d === "0" ? "0 — 정수만" : `${d} — 소수 ${d}째 자리까지`}
+          </option>
+        ))}
+      </select>
+    </Field>
+  );
+  if (unit.mode === "edit") {
+    return (
+      <Section
+        title="단위 사양"
+        note="기준 단위 · 배수는 등록한 뒤 바뀌지 않습니다. 소수 자릿수는 수불 수량이 들어가는 자리입니다."
+      >
+        <div className="grid gap-5 sm:grid-cols-3">
+          <ReadOnly label="기준 단위" value={unit.baseUnit} />
+          <ReadOnly label="배수" value={factorText(unit.factor)} />
+          {decimalsField}
+        </div>
+      </Section>
+    );
+  }
+  return (
+    <Section
+      title="단위 사양"
+      note="같은 기준의 단위끼리는 수불관리의 등록 화면에서 바꿔 넣습니다 — 예: 기준 G, 배수 1000 이면 1 KG = 1000 G. 기준 단위 · 배수는 저장한 뒤 바뀌지 않습니다."
+    >
+      <div className="grid gap-5 sm:grid-cols-3">
+        <Field field="baseUnit" label="기준 단위" error={errors.baseUnit}>
+          <select
+            id="f-baseUnit"
+            name="baseUnit"
+            defaultValue={values.baseUnit ?? ""}
+            aria-invalid={!!errors.baseUnit || undefined}
+            aria-describedby={errors.baseUnit ? "e-baseUnit" : undefined}
+            className={inputClass(!!errors.baseUnit)}
+          >
+            <option value="">같은 단위(이 단위)</option>
+            {unit.bases.map((b) => (
+              <option key={b.code} value={b.code}>
+                {b.code} {b.name}
+              </option>
+            ))}
+          </select>
+        </Field>
+        <Field field="factor" label="배수" error={errors.factor} hint="기준 단위 몇 개인가 — 같은 단위면 비움">
+          <Input
+            field="factor"
+            defaultValue={values.factor}
+            maxLength={16}
+            inputMode="decimal"
+            placeholder="예: 1000"
+            invalid={!!errors.factor}
+          />
+        </Field>
+        {decimalsField}
+      </div>
+    </Section>
+  );
+}
diff --git a/src/app/system/codes/code-list.tsx b/src/app/system/codes/code-list.tsx
index 8726cd6..ec55596 100644
--- a/src/app/system/codes/code-list.tsx
+++ b/src/app/system/codes/code-list.tsx
@@ -1,5 +1,6 @@
 import Link from "next/link";
-import type { Code, CodeGroup, CodeGroupRow } from "@/db/codes";
+import type { Code, CodeGroup, CodeGroupRow, UnitSpec } from "@/db/codes";
+import { factorText } from "@/lib/code-fields";
 import { eul } from "@/lib/josa";
 
 // 공통코드 화면의 부품 — 묶음 표, 묶음 고르기, 값 표, 저장 뒤의 알림.
@@ -80,8 +81,21 @@ export function GroupPicker({ groups, current }: { groups: CodeGroupRow[]; curre
   );
 }
 
-/** 값 표 — 「사용 안 함」까지 모두 보인다. 사용자 코드 묶음이면 코드가 수정 화면으로 가는 링크다. */
-export function CodeTable({ group, rows, savedCode }: { group: CodeGroup; rows: Code[]; savedCode?: string }) {
+/**
+ * 값 표 — 「사용 안 함」까지 모두 보인다. 사용자 코드 묶음이면 코드가 수정 화면으로 가는 링크다.
+ * 단위 묶음이면 specs 가 있고, 기준 단위 · 배수 · 소수 자릿수 칸이 더 보인다(ADR 0017).
+ */
+export function CodeTable({
+  group,
+  rows,
+  savedCode,
+  specs,
+}: {
+  group: CodeGroup;
+  rows: Code[];
+  savedCode?: string;
+  specs?: Record<string, UnitSpec>;
+}) {
   if (rows.length === 0) {
     return <p className="mt-6 border border-dashed border-rule px-5 py-8 text-center text-muted">값이 없습니다.</p>;
   }
@@ -91,50 +105,67 @@ export function CodeTable({ group, rows, savedCode }: { group: CodeGroup; rows:
       <p className="mt-4 text-sm text-muted" aria-live="polite">
         {rows.length}개{inactive ? ` · 사용 안 함 ${inactive}개 포함` : ""}
       </p>
-      <table className="mt-2 w-full border-collapse bg-white text-left">
-        <caption className="sr-only">{group.name} 값 목록</caption>
-        <thead className="border-b-2 border-machine text-sm">
-          <tr>
-            <th scope="col" className="w-20 px-3 py-2 text-right">
-              정렬 순서
-            </th>
-            <th scope="col" className="px-3 py-2">
-              코드
-            </th>
-            <th scope="col" className="px-3 py-2">
-              이름
-            </th>
-          </tr>
-        </thead>
-        <tbody>
-          {rows.map((c) => (
-            <tr
-              key={c.id}
-              className={`border-b border-rule align-top ${c.code === savedCode ? "bg-safety/15" : ""} ${
-                c.active ? "" : "text-muted"
-              }`}
-            >
-              <td className="px-3 py-2.5 text-right tabular-nums">{c.sortOrder}</td>
-              <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
-                {group.isSystem ? (
-                  <span className="font-semibold">{c.code}</span>
-                ) : (
-                  <Link
-                    href={`/system/codes/${group.code}/${c.code}`}
-                    className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
-                  >
-                    {c.code}
-                  </Link>
-                )}
-              </td>
-              <td className="px-3 py-2.5 wrap-anywhere">
-                <span className="font-semibold">{c.name}</span>
-                {!c.active && <span className={`ml-2 ${badge} border-rule`}>사용 안 함</span>}
-              </td>
+      {/* 단위 묶음은 칸이 여섯이라 휴대폰 폭에서 옆으로 민다. */}
+      <div className="mt-2 overflow-x-auto">
+        <table className="w-full border-collapse bg-white text-left">
+          <caption className="sr-only">{group.name} 값 목록</caption>
+          <thead className="border-b-2 border-machine text-sm">
+            <tr>
+              <th scope="col" className="w-20 px-3 py-2 text-right">
+                정렬 순서
+              </th>
+              <th scope="col" className="px-3 py-2">
+                코드
+              </th>
+              <th scope="col" className="px-3 py-2">
+                이름
+              </th>
+              {specs && (
+                <>
+                  <th scope="col" className="px-3 py-2">
+                    기준 단위
+                  </th>
+                  <th scope="col" className="px-3 py-2 text-right">
+                    배수
+                  </th>
+                  <th scope="col" className="px-3 py-2 text-right">
+                    소수 자릿수
+                  </th>
+                </>
+              )}
             </tr>
-          ))}
-        </tbody>
-      </table>
+          </thead>
+          <tbody>
+            {rows.map((c) => (
+              <tr
+                key={c.id}
+                className={`border-b border-rule align-top ${c.code === savedCode ? "bg-safety/15" : ""} ${
+                  c.active ? "" : "text-muted"
+                }`}
+              >
+                <td className="px-3 py-2.5 text-right tabular-nums">{c.sortOrder}</td>
+                <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">
+                  {group.isSystem ? (
+                    <span className="font-semibold">{c.code}</span>
+                  ) : (
+                    <Link
+                      href={`/system/codes/${group.code}/${c.code}`}
+                      className="font-semibold text-ink underline underline-offset-4 hover:text-machine"
+                    >
+                      {c.code}
+                    </Link>
+                  )}
+                </td>
+                <td className="px-3 py-2.5 wrap-anywhere">
+                  <span className="font-semibold">{c.name}</span>
+                  {!c.active && <span className={`ml-2 ${badge} border-rule`}>사용 안 함</span>}
+                </td>
+                {specs && <SpecCells spec={specs[c.code]} />}
+              </tr>
+            ))}
+          </tbody>
+        </table>
+      </div>
     </>
   );
 }
@@ -150,3 +181,20 @@ export function SavedNotice({ code }: { code: Code }) {
     </div>
   );
 }
+
+/** 단위 사양의 칸 셋 — 사양이 없으면(있어서는 안 된다) 비었다고 보인다. */
+function SpecCells({ spec }: { spec?: UnitSpec }) {
+  if (!spec)
+    return (
+      <td colSpan={3} className="px-3 py-2.5 text-sm text-muted">
+        사양 없음
+      </td>
+    );
+  return (
+    <>
+      <td className="px-3 py-2.5 font-mono text-sm whitespace-nowrap">{spec.baseUnit}</td>
+      <td className="px-3 py-2.5 text-right tabular-nums">{factorText(spec.factor)}</td>
+      <td className="px-3 py-2.5 text-right tabular-nums">{spec.decimals}</td>
+    </>
+  );
+}
diff --git a/src/components/form-parts.tsx b/src/components/form-parts.tsx
index 80ffbe2..6c067b1 100644
--- a/src/components/form-parts.tsx
+++ b/src/components/form-parts.tsx
@@ -232,3 +232,29 @@ export function Check({
     </div>
   );
 }
+
+/** 고르기 단추 하나 — 라디오를 숨기고 이름표를 단추처럼 보인다(유형 · 조달구분 · 구분자 따위). */
+export function Choice({
+  name,
+  value,
+  checked,
+  onChange,
+  children,
+}: {
+  name: string;
+  value: string;
+  checked: boolean;
+  onChange: () => void;
+  children: ReactNode;
+}) {
+  return (
+    <label
+      className={`cursor-pointer rounded border px-4 py-2 has-focus-visible:outline-2 has-focus-visible:outline-machine ${
+        checked ? "border-machine bg-machine font-semibold text-white" : "border-rule bg-white hover:border-machine"
+      }`}
+    >
+      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
+      {children}
+    </label>
+  );
+}
diff --git a/src/components/sidebar.tsx b/src/components/sidebar.tsx
index 41c5f8b..8f1eb3a 100644
--- a/src/components/sidebar.tsx
+++ b/src/components/sidebar.tsx
@@ -3,6 +3,7 @@
 import Link from "next/link";
 import { usePathname } from "next/navigation";
 import { useState } from "react";
+import { useMenuHint } from "@/components/menu-hint";
 import { AREAS, activeMenuHref, isOpen, isWithin, type Menu } from "@/lib/areas";
 
 // 넓은 화면에서는 왼쪽에 늘 보이고, 휴대폰 폭에서는 「메뉴」 단추로 펼친다.
@@ -15,6 +16,8 @@ export function Sidebar() {
 // 주소를 빌드 때 알 수 없는 화면(품목 코드가 주소인 수정 화면 등)은 이 모양이 먼저 나가고, 요청 때 지금 모듈이 표시된다.
 export function SidebarView({ pathname }: { pathname: string }) {
   const [open, setOpen] = useState(false);
+  // 주소만으로 메뉴를 알 수 없는 화면(전표 보기)이 알린 메뉴 — 그 모듈의 메뉴일 때만 쓴다.
+  const hinted = useMenuHint(pathname);
 
   return (
     <nav
@@ -42,7 +45,8 @@ export function SidebarView({ pathname }: { pathname: string }) {
       >
         {AREAS.map((area) => {
           const current = isWithin(pathname, area.href);
-          const activeHref = current ? activeMenuHref(pathname, area) : undefined;
+          const hintHere = area.groups.some((g) => g.menus.some((m) => m.href && m.href === hinted));
+          const activeHref = current ? (hintHere ? hinted : activeMenuHref(pathname, area)) : undefined;
           return (
             <li key={area.href}>
               <Link
diff --git a/src/content/diagrams.ts b/src/content/diagrams.ts
index e6fe8bc..686789c 100644
--- a/src/content/diagrams.ts
+++ b/src/content/diagrams.ts
@@ -153,7 +153,7 @@ export type MapTable = { id: string; name: string; table?: string; slice: string
 export type MapModule = { module: string; tables: readonly MapTable[] };
 
 /** 지금 짓는 조각 — 지도에서 이 조각의 테이블을 따로 표시한다. */
-export const CURRENT_SLICE = "기준정보";
+export const CURRENT_SLICE = "재고 수불";
 
 export const MODULE_MAP: readonly MapModule[] = [
   {
@@ -189,11 +189,21 @@ export const MODULE_MAP: readonly MapModule[] = [
     module: "재고",
     tables: [
       { id: "warehouses", name: "창고", table: "warehouses", slice: "기준정보" },
-      { id: "txn", name: "수불", slice: "재고 수불" },
-      { id: "stock", name: "현재고 — 품목 × 창고 × LOT · 상태", slice: "재고 수불" },
-      { id: "lot", name: "LOT", slice: "재고 수불" },
-      { id: "alloc", name: "할당", slice: "재고 수불" },
-      { id: "count", name: "실사", slice: "재고 수불" },
+      { id: "txn", name: "수불 전표 — 유형 · 사유 · 취소", table: "stock_moves", slice: "재고 수불" },
+      {
+        id: "txn_lines",
+        name: "수불 줄 — 품목 · LOT번호 · 출고창고 → 입고창고",
+        table: "stock_move_lines",
+        slice: "재고 수불",
+      },
+      { id: "stock", name: "잔액 — 품목 × 창고 × LOT · 상태", table: "stock_balances", slice: "재고 수불" },
+      { id: "alloc", name: "할당", slice: "작업지시" },
+      {
+        id: "count",
+        name: "실사 — 창고 · 작성 중 · 확정 · 실사 차이 전표",
+        table: "stock_counts",
+        slice: "재고 수불",
+      },
     ],
   },
   {
@@ -236,6 +246,14 @@ export const MODULE_MAP: readonly MapModule[] = [
     tables: [
       { id: "code_groups", name: "공통코드 묶음", table: "code_groups", slice: "기준정보" },
       { id: "codes", name: "공통코드 값", table: "codes", slice: "기준정보" },
+      { id: "unit_specs", name: "단위 사양 — 기준 단위 · 배수 · 소수 자릿수", table: "unit_specs", slice: "재고 수불" },
+      { id: "number_rules", name: "번호 규칙 — LOT 번호", table: "number_rules", slice: "재고 수불" },
+      {
+        id: "number_rule_seqs",
+        name: "번호 규칙의 일련 — 규칙 · 기간마다",
+        table: "number_rule_seqs",
+        slice: "재고 수불",
+      },
       { id: "company", name: "회사 정보", slice: "인사" },
       { id: "users", name: "사용자 · 메뉴 · 권한", slice: "인사" },
     ],
@@ -247,7 +265,7 @@ export const MODULE_FLOWS: readonly (readonly string[])[] = [
   ["so", "mps", "plo"],
   ["splan", "mps"],
   ["bom", "plo"],
-  ["plo", "wo", "result", "txn", "stock"],
+  ["plo", "wo", "result", "txn", "txn_lines", "stock"],
   ["plo", "po", "rcv", "txn"],
   ["wo", "alloc", "stock"],
   ["shipreq", "alloc"],
@@ -267,66 +285,103 @@ export const MODULE_FLOWS: readonly (readonly string[])[] = [
   ["dept", "emp", "users"],
 ];
 
-// 데이터 모델 ② 이 조각의 테이블 — 조각 「기준정보」가 만드는 다섯과 그 칸.
+// 데이터 모델 ② 이 조각의 테이블 — 조각 「재고 수불」이 지금까지 만든 테이블과 그 칸, 그리고 그것이 가리키는 테이블.
+// 이 조각의 PR 이 테이블을 더할 때마다 여기에 더한다(조각 「재고 수불」 설계 ⑥). 조각 「기준정보」의 다섯은 docs/schema.md 가 든다.
 export const DATA_MODEL = `erDiagram
-  ITEMS["품목 items"] {
-    text code UK "RM-0001 · SF-0001 · FG-0001"
-    text name "품명"
-    text spec "규격"
-    text item_type "공통코드 ITEM_TYPE — RM · SF · FG"
-    text procurement "공통코드 PROC_TYPE — 구매 · 생산"
-    text unit "공통코드 UNIT — EA · M · KG · G …"
-    boolean inspect_in "수입검사 대상"
-    boolean inspect_out "출하검사 대상"
-    int lead_time_days "리드타임(일)"
-    numeric safety_stock "안전재고"
-    numeric min_lot "최소 발주 · 생산량"
-    numeric lot_multiple "발주 · 생산 배수"
-    text cls1 "공통코드 ITEM_CLS1 — 대분류(종류) · 비워도 됨"
-    text cls2 "공통코드 ITEM_CLS2 — 중분류(패키지) · 비워도 됨"
-    text cls3 "공통코드 ITEM_CLS3 — 소분류(용도) · 비워도 됨"
-    text note "비고"
-    boolean active "사용 여부"
+  CODES["공통코드 값 codes (Minor) — 조각 「기준정보」"] {
+    text group_code FK "묶음 — 여기서는 UNIT"
+    text code "EA · M · KG · G · MM · L · ML · MG …"
+    text name "이름"
   }
-  WAREHOUSES["창고 warehouses"] {
-    text code UK "WH-01"
-    text name "창고명"
-    boolean active "사용 여부"
+  UNIT_SPECS["단위 사양 unit_specs"] {
+    text unit UK "공통코드 UNIT 의 값 — 단위마다 하나"
+    text base_unit FK "기준 단위 — 자신이 기준인 단위(KG → G)"
+    numeric factor "배수 — 기준 단위 몇 개(KG = 1000 G). 자신이면 1"
+    smallint decimals "소수 자릿수 0 ~ 3 — 수불 수량이 들어가는 자리"
   }
-  PARTNERS["거래처 partners"] {
-    text code UK "BP-0001"
-    text name "거래처명"
-    boolean is_supplier "매입처"
-    boolean is_customer "매출처"
-    text country "공통코드 COUNTRY — KR · US · JP …"
-    text biz_no "사업자등록번호 — 한국"
-    text foreign_biz_no "해외 사업자번호 — 한국 밖"
-    text ceo "대표자"
-    text biz_type "업태"
-    text biz_item "종목"
-    text address "주소"
-    text phone "전화"
-    text email "이메일"
-    text contact_name "담당자"
-    text contact_phone "담당자 연락처"
-    text note "비고"
-    boolean active "사용 여부"
+  NUMBER_RULES["번호 규칙 number_rules — LOT 번호"] {
+    text code UK "LOT_SF · LOT_FG · LOT_NUM …"
+    text prefix "머리 — 영문 대문자 · 숫자 0 ~ 6자"
+    text separator "구분자 — 없음 · - · _ · ."
+    text date_format "날짜 꼴 — 없음 · YYMMDD · YYYYMMDD · YYMM"
+    smallint seq_digits "일련 자릿수 2 ~ 6"
+    text default_for UK "기본으로 쓰는 유형 — SF · FG 마다 하나"
   }
-  CODE_GROUPS["공통코드 묶음 code_groups (Major)"] {
-    text code UK "ITEM_TYPE · PROC_TYPE · UNIT · COUNTRY · ITEM_CLS1 ~ 3"
-    text name "이름"
-    boolean is_system "시스템 코드 — 화면에서 못 고침"
+  NUMBER_RULE_SEQS["번호 규칙의 일련 number_rule_seqs"] {
+    text rule_code FK "규칙"
+    text period "기간 — 날짜 꼴로 쓴 날짜(261105 · 2611), 없으면 빈 글자"
+    integer last_seq "마지막으로 낸 일련"
   }
-  CODES["공통코드 값 codes (Minor)"] {
-    text group_code FK "묶음 — 묶음 + 코드가 겹치지 않음(UK)"
-    text code "RM · BUY · EA · KR …"
-    text name "이름"
-    int sort_order "정렬 순서"
-    boolean active "사용 여부"
+  ITEMS["품목 items — 조각 「기준정보」"] {
+    text code UK "RM · SF · FG · SM · CS — 부자재 · 소모품을 더함"
+    boolean lot_managed "LOT 관리"
+    text lot_rule_code FK "LOT 번호 규칙 — 반제품 · 완제품만, 비우면 유형의 기본"
+    integer default_in_warehouse_id FK "기본 입고 창고"
+    integer default_out_warehouse_id FK "기본 출고 창고"
+  }
+  WAREHOUSES["창고 warehouses — 조각 「기준정보」"] {
+    text code UK "WH-01 …"
+    boolean is_defect "불량창고 — 재고가 불량"
+  }
+  STOCK_MOVES["수불 전표 stock_moves"] {
+    text code UK "IV-YYYYMMDD-NNN — 수불 일자 · 그날의 일련"
+    date move_date "일자 — 오늘이나 지난 날"
+    text move_type FK "유형 — 공통코드 MOVE_TYPE(IN · OUT · XFER · ADJ)"
+    text reason FK "사유 — 조정만, ADJ_REASON"
+    text note "비고 — 200자까지"
+    integer cancels_move_id FK "취소한 전표 — 한 번만, 취소 전표는 취소되지 않음"
+  }
+  STOCK_MOVE_LINES["수불 줄 stock_move_lines"] {
+    integer move_id FK "전표"
+    integer item_id FK "품목"
+    text lot "LOT — 끈 품목은 빈 글자"
+    text status "상태 — 가용 · 검사대기"
+    integer from_warehouse_id FK "출고창고 — 출고 · 이동 · 줄이는 조정"
+    integer to_warehouse_id FK "입고창고 — 입고 · 이동 · 늘리는 조정"
+    numeric qty "품목 단위의 수량 — 늘 0 보다 큼"
+    numeric entered_qty "넣은 수량"
+    text entered_unit FK "넣은 단위 — 같은 기준이면 바꿔 쌓음"
+  }
+  STOCK_BALANCES["잔액 stock_balances"] {
+    integer item_id FK "품목"
+    integer warehouse_id FK "창고 — 불량창고면 불량"
+    text lot "LOT"
+    text status "상태"
+    numeric qty "지금 수량 — 0 밑으로 못 감, 줄의 합"
+  }
+  STOCK_COUNTS["재고 실사 stock_counts"] {
+    text code UK "PI-YYYYMMDD-NNN — 처음 저장한 날 · 그날의 일련"
+    integer warehouse_id FK "창고 — 작성 중은 창고마다 하나"
+    text status "작성 중 · 확정 · 취소"
+    integer baseline_line_id "장부를 불러온 때의 마지막 수불 줄 — 연 뒤의 수불 경고"
+    date confirmed_date "확정한 날"
+    integer adjust_move_id FK "실사 차이의 조정 전표 — 차이가 없으면 없음"
+  }
+  STOCK_COUNT_LINES["실사 줄 stock_count_lines"] {
+    integer count_id FK "실사 — 줄 1 ~ 100"
+    integer item_id FK "품목"
+    text lot "LOT"
+    text status "상태 — 더한 줄은 가용"
+    boolean added "장부에 없어 더한 줄"
+    numeric counted_qty "실물 수량 — 작성 중에만 비울 수 있음"
+    numeric book_qty "확정하는 순간의 장부"
   }
-  CODE_GROUPS ||--o{ CODES : "묶음의 값"
-  CODES ||--o{ ITEMS : "유형 · 조달구분 · 단위 · 분류"
-  CODES ||--o{ PARTNERS : "국가"`;
+  CODES ||--|| UNIT_SPECS : "단위의 사양"
+  UNIT_SPECS ||--o{ UNIT_SPECS : "기준 단위"
+  NUMBER_RULES ||--o{ NUMBER_RULE_SEQS : "기간마다 일련"
+  NUMBER_RULES |o--o{ ITEMS : "LOT 번호 규칙"
+  WAREHOUSES |o--o{ ITEMS : "기본 입고 · 출고 창고"
+  STOCK_MOVES ||--|{ STOCK_MOVE_LINES : "줄 1 ~ 100"
+  STOCK_MOVES |o--o| STOCK_MOVES : "취소"
+  ITEMS ||--o{ STOCK_MOVE_LINES : "품목"
+  WAREHOUSES |o--o{ STOCK_MOVE_LINES : "출고창고 · 입고창고"
+  ITEMS ||--o{ STOCK_BALANCES : "품목"
+  WAREHOUSES ||--o{ STOCK_BALANCES : "창고"
+  CODES ||--o{ STOCK_MOVES : "수불 유형 · 조정 사유"
+  WAREHOUSES ||--o{ STOCK_COUNTS : "창고"
+  STOCK_COUNTS ||--|{ STOCK_COUNT_LINES : "줄 1 ~ 100"
+  ITEMS ||--o{ STOCK_COUNT_LINES : "품목"
+  STOCK_COUNTS |o--o| STOCK_MOVES : "확정 → 실사 차이 조정 전표"`;
 
 // 시스템 구성 — 화면 · 서버 · DB · 자동 검사 · 알림.
 export const SYSTEM = `flowchart LR
diff --git a/src/db/codes.ts b/src/db/codes.ts
index e0a59c7..1171326 100644
--- a/src/db/codes.ts
+++ b/src/db/codes.ts
@@ -1,7 +1,8 @@
 import { and, asc, count, eq, getTableColumns, max, sql } from "drizzle-orm";
-import { GROUP_CODE, MINOR_CODE } from "@/lib/code-fields";
+import { GROUP_CODE, MINOR_CODE, UNIT_GROUP } from "@/lib/code-fields";
 import { parseCodeUpdate, parseNewCode, type CodeErrors, type CodeField, type CodeValues } from "@/lib/code-input";
 import { isAlwaysActive } from "@/lib/master-codes";
+import { parseNewUnitSpec, parseUnitDecimals, type UnitSpecInput } from "@/lib/unit-input";
 import {
   REGISTER_LOCK,
   STALE,
@@ -12,7 +13,8 @@ import {
   versionIs,
   versionOf,
 } from "./master-shared";
-import { codeGroups, codes } from "./schema";
+import { codeGroups, codes, unitSpecs } from "./schema";
+import { lockStock, unitQuantitiesFit } from "./stock";
 import type { Db } from "./types";
 
 // 시스템 관리 › 공통코드의 목록 · 값 추가 · 수정(조각 「기준정보」 PR E). 화면(src/app/system/codes/)은 이 함수만 부른다.
@@ -27,6 +29,9 @@ export type Code = typeof codes.$inferSelect;
 /** 공통코드 값과 그 버전(마지막으로 고친 때) — 수정 화면이 들고 있다가 저장할 때 돌려준다(PR J). */
 export type CodeWithVersion = Code & { version: string };
 export type CodeGroupRow = Pick<CodeGroup, "code" | "name" | "isSystem"> & { values: number };
+export type UnitSpec = Pick<typeof unitSpecs.$inferSelect, "unit" | "baseUnit" | "factor" | "decimals">;
+/** 기준 단위로 고를 수 있는 단위 — 자신이 기준이고 「사용」인 단위. */
+export type BaseUnitOption = { code: string; name: string };
 
 // ── 목록 ─────────────────────────────────────────────
 
@@ -69,6 +74,46 @@ export async function nextSortOrder(db: Db, group: string): Promise<number> {
   return Math.min((row?.max ?? 0) + 10, 999);
 }
 
+// ── 단위 사양(조각 「재고 수불」 PR A, ADR 0017) ─────────────────
+
+const specColumns = {
+  unit: unitSpecs.unit,
+  baseUnit: unitSpecs.baseUnit,
+  factor: unitSpecs.factor,
+  decimals: unitSpecs.decimals,
+};
+
+/** 단위마다의 사양 — 단위 코드로 찾는다. 공통코드 화면의 UNIT 표가 쓴다. */
+export async function listUnitSpecs(db: Db): Promise<Record<string, UnitSpec>> {
+  const rows = await db.select(specColumns).from(unitSpecs);
+  return Object.fromEntries(rows.map((r) => [r.unit, r]));
+}
+
+export async function getUnitSpec(db: Db, unit: string): Promise<UnitSpec | undefined> {
+  if (!MINOR_CODE.test(unit)) return undefined;
+  const [row] = await db.select(specColumns).from(unitSpecs).where(eq(unitSpecs.unit, unit));
+  return row;
+}
+
+/** 새 단위의 기준으로 고를 수 있는 단위 — 자신이 기준(배수 1)이고 「사용」인 단위, 정렬 순서대로. */
+export async function baseUnitOptions(db: Db): Promise<BaseUnitOption[]> {
+  return db
+    .select({ code: codes.code, name: codes.name })
+    .from(unitSpecs)
+    .innerJoin(codes, and(eq(codes.groupCode, unitSpecs.unitGroup), eq(codes.code, unitSpecs.unit)))
+    .where(and(eq(unitSpecs.unit, unitSpecs.baseUnit), eq(codes.active, true)))
+    .orderBy(asc(codes.sortOrder), asc(codes.code));
+}
+
+const NOT_BASE = "기준이 될 수 없는 단위입니다 — 목록에 있는 「사용」 단위를 고르세요";
+
+/** 고른 기준 단위가 자신이 기준이고 「사용」인 단위인가 — 아니면 거절할 까닭. 자신이 기준이면 보지 않는다. */
+async function baseUnitProblem(db: Db, code: string, spec: UnitSpecInput): Promise<string | undefined> {
+  if (spec.baseUnit === code) return undefined;
+  const ok = (await baseUnitOptions(db)).some((b) => b.code === spec.baseUnit);
+  return ok ? undefined : NOT_BASE;
+}
+
 // ── 추가 · 수정 ─────────────────────────────────────────
 
 export type CodeSaveResult =
@@ -86,6 +131,10 @@ const CONSTRAINT_FIELD: Record<string, CodeField> = {
   codes_code_format: "code",
   codes_name_length: "name",
   codes_sort_order_range: "sortOrder",
+  unit_specs_base_fk: "baseUnit",
+  unit_specs_factor_positive: "factor",
+  unit_specs_base_factor_one: "factor",
+  unit_specs_decimals_range: "decimals",
 };
 
 /** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
@@ -105,7 +154,17 @@ export async function createCode(db: Db, group: string, values: CodeValues): Pro
   if (!g) return { ok: false, notFound: true };
   if (g.isSystem) return { ok: false, errors: {}, formError: SYSTEM_LOCKED, values };
   const parsed = parseNewCode(values);
-  if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
+  // 단위 묶음이면 사양(기준 단위 · 배수 · 소수 자릿수)도 함께 받는다 — 단위마다 사양이 하나씩 있다(ADR 0017).
+  const isUnit = g.code === UNIT_GROUP;
+  const spec = isUnit
+    ? parseNewUnitSpec(values, parsed.ok ? parsed.value.code : (values.code ?? "").trim())
+    : undefined;
+  const errors: CodeErrors = { ...(parsed.ok ? {} : parsed.errors), ...(spec && !spec.ok ? spec.errors : {}) };
+  if (parsed.ok && spec?.ok) {
+    const problem = await baseUnitProblem(db, parsed.value.code, spec.value);
+    if (problem) errors.baseUnit = problem;
+  }
+  if (!parsed.ok || (spec && !spec.ok) || Object.keys(errors).length) return { ok: false, errors, values };
 
   try {
     return await db.transaction(async (tx): Promise<CodeSaveResult> => {
@@ -114,6 +173,7 @@ export async function createCode(db: Db, group: string, values: CodeValues): Pro
       if (n >= CODE_LIMIT)
         return { ok: false, errors: {}, formError: limitMessage("한 묶음의 값", CODE_LIMIT), values };
       await tx.insert(codes).values({ ...parsed.value, groupCode: g.code });
+      if (spec?.ok) await tx.insert(unitSpecs).values({ unit: parsed.value.code, ...spec.value });
       return { ok: true, code: parsed.value.code };
     });
   } catch (error) {
@@ -143,24 +203,61 @@ export async function updateCode(
   if (!g || !current) return { ok: false, notFound: true };
   if (g.isSystem) return { ok: false, errors: {}, formError: SYSTEM_LOCKED, values };
   const parsed = parseCodeUpdate(values);
-  const errors: CodeErrors = parsed.ok ? {} : { ...parsed.errors };
+  // 단위 묶음이면 소수 자릿수도 고친다 — 기준 단위 · 배수는 등록 뒤 바뀌지 않는다(ADR 0017).
+  // 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만이다(설계 「PR A 를 열기 전에 정한 것」 — PR C 가 더함).
+  // 자릿수를 보내지 않으면 그대로 둔다.
+  const decimals = g.code === UNIT_GROUP && values.decimals !== undefined ? parseUnitDecimals(values) : undefined;
+  const errors: CodeErrors = {
+    ...(parsed.ok ? {} : parsed.errors),
+    ...(decimals && !decimals.ok ? decimals.errors : {}),
+  };
   if (!errors.active && values.active === "N" && isAlwaysActive(g.code, current.code))
     errors.active = ALWAYS_ACTIVE_MESSAGE;
-  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
+  if (!parsed.ok || (decimals && !decimals.ok) || Object.keys(errors).length) return { ok: false, errors, values };
   if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
   try {
-    const done = await db
-      .update(codes)
-      .set({ ...parsed.value, updatedAt: touched() })
-      .where(
-        version === undefined
-          ? eq(codes.id, current.id)
-          : and(eq(codes.id, current.id), versionIs(codes.updatedAt, version)),
-      )
-      .returning({ id: codes.id });
-    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
-    return { ok: true, code };
+    // 값과 사양을 한 트랜잭션에서 고친다 — 버전이 어긋나면 둘 다 바뀌지 않는다.
+    return await db.transaction(async (tx): Promise<CodeSaveResult> => {
+      // 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만이다(ADR 0017) — 재고의 잠금을 쥐고 본다. 잠금은 표를 고치기 전에
+      // 쥔다 — 수불 저장 · 매일 밤 되돌림과 같은 차례(잠금 → 표). 고친 뒤 쥐면 되돌림과 교착한다(PR C 리뷰 2회차).
+      if (decimals?.ok) {
+        await lockStock(tx);
+        if (!(await unitQuantitiesFit(tx, current.code, decimals.value.decimals)))
+          throw new DecimalsMisfit(decimals.value.decimals);
+      }
+      const done = await tx
+        .update(codes)
+        .set({ ...parsed.value, updatedAt: touched() })
+        .where(
+          version === undefined
+            ? eq(codes.id, current.id)
+            : and(eq(codes.id, current.id), versionIs(codes.updatedAt, version)),
+        )
+        .returning({ id: codes.id });
+      if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
+      if (decimals?.ok)
+        await tx
+          .update(unitSpecs)
+          .set({ decimals: decimals.value.decimals, updatedAt: touched() })
+          .where(eq(unitSpecs.unit, current.code));
+      return { ok: true, code };
+    });
   } catch (error) {
+    if (error instanceof DecimalsMisfit)
+      return {
+        ok: false,
+        errors: {
+          decimals: `이 단위의 수불 수량 · 작성 중 실사의 실물 수량 가운데 소수 ${error.decimals}자리에 맞지 않는 것이 있어 줄이지 못합니다`,
+        },
+        values,
+      };
     return asRejection(error, values);
   }
 }
+
+/** 자릿수를 줄이면 남은 수불 수량이 맞지 않는다 — 던져 고침을 되돌린다. */
+class DecimalsMisfit extends Error {
+  constructor(readonly decimals: number) {
+    super("단위 자릿수를 줄이지 못한다");
+  }
+}
diff --git a/src/db/items.ts b/src/db/items.ts
index 399ce02..a80aea0 100644
--- a/src/db/items.ts
+++ b/src/db/items.ts
@@ -1,6 +1,7 @@
 import { and, asc, count, eq, getTableColumns, ilike, inArray, or, type SQL } from "drizzle-orm";
 import { eul } from "@/lib/josa";
 import { ITEM_TYPES, PROC_TYPES, type ItemType } from "@/lib/master-codes";
+import { resolveStock, type StockColumns, type StockLists, type WarehouseChoice } from "@/lib/item-stock";
 import {
   ITEM_CLASSES,
   type ItemClassField,
@@ -8,6 +9,7 @@ import {
   parseNewItem,
   type ItemErrors,
   type ItemField,
+  type ItemInput,
   type ItemValues,
 } from "@/lib/item-input";
 import { itemSheetRow, readItemEditRow, readItemRow, type CodeOption } from "@/lib/sheet-input";
@@ -47,11 +49,13 @@ import {
   type UpdatedRow,
 } from "./master-shared";
 import { nextCode } from "./numbering";
-import { codes, items } from "./schema";
+import { codes, items, numberRules, warehouses } from "./schema";
+import { itemsWithMoves, lockStock } from "./stock";
 import type { Db } from "./types";
 
 // 품목의 목록 · 등록 · 수정(조각 「기준정보」 PR C). 화면(src/app/master/items/)은 이 함수만 부른다.
 // 입력 검사는 src/lib/item-input.ts, 단위 · 분류가 「사용 안 함」이 아닌지 · 등록 상한 · 코드 번호는 여기서 본다.
+// LOT 번호 규칙 · 기본 창고(조각 「재고 수불」 PR B)는 DB 의 목록을 읽어 src/lib/item-stock.ts 의 규칙으로 본다.
 
 /** 품목의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 매일 밤 되돌림이 샘플 수로 줄인다. */
 export const ITEM_LIMIT = 2000;
@@ -140,14 +144,15 @@ export async function listItems(db: Db, filter: ItemFilter, scope: SearchScope =
  */
 export async function loadItemsForSheet(db: Db, filter: ItemFilter): Promise<{ rows: SheetRow[]; total: number }> {
   const where = itemWhere(filter, "codeName");
-  const [found, [{ n }]] = await Promise.all([
+  const [found, [{ n }], lists] = await Promise.all([
     db.select(WITH_VERSION).from(items).where(where).orderBy(asc(items.code)).limit(SHEET_MAX_ROWS),
     db.select({ n: count() }).from(items).where(where),
+    stockLists(db),
   ]);
-  return { rows: found.map(itemSheetRow), total: n };
+  return { rows: found.map((i) => itemSheetRow(i, lists)), total: n };
 }
 
-export const ITEM_CODE = /^(RM|SF|FG)-[0-9]{4,}$/;
+export const ITEM_CODE = /^(RM|SF|FG|SM|CS)-[0-9]{4,}$/;
 
 /** 품목 하나와 그 버전 — 한 쿼리로 읽어, 보인 값과 버전이 어긋나지 않는다. */
 export async function getItem(db: Db, code: string): Promise<ItemWithVersion | undefined> {
@@ -196,8 +201,60 @@ export async function itemClassOptions(db: Db, current?: Pick<Item, ItemClassFie
 
 /** 유형마다 지금 등록하면 붙을 코드 — 화면의 안내용이고, 저장할 때 다시 센다. */
 export async function previewCodes(db: Db): Promise<Record<ItemType, string>> {
-  const [RM, SF, FG] = await Promise.all(ITEM_TYPES.map((t) => nextCode(db, t.code)));
-  return { RM, SF, FG };
+  const next = await Promise.all(ITEM_TYPES.map((t) => nextCode(db, t.code)));
+  return Object.fromEntries(ITEM_TYPES.map((t, i) => [t.code, next[i]])) as Record<ItemType, string>;
+}
+
+/** LOT 번호 규칙 · 창고 — 「사용 안 함」까지, 코드 순으로(규칙 50 · 창고 99 안). 재고 칸의 검사와 화면 · 시트가 읽는다. */
+export async function stockLists(db: Db): Promise<StockLists & { warehouses: WarehouseChoice[] }> {
+  const [rules, whs] = await Promise.all([
+    db
+      .select({ code: numberRules.code, name: numberRules.name, active: numberRules.active })
+      .from(numberRules)
+      .orderBy(asc(numberRules.code)),
+    db
+      .select({
+        id: warehouses.id,
+        code: warehouses.code,
+        name: warehouses.name,
+        active: warehouses.active,
+        isDefect: warehouses.isDefect,
+      })
+      .from(warehouses)
+      .orderBy(asc(warehouses.code)),
+  ]);
+  return { rules, warehouses: whs };
+}
+
+/** 저장할 칸 — 입력의 창고 코드를 창고 번호로 바꾼 것. */
+const columnsOf = <T extends ItemInput>(input: T, stock: StockColumns) => {
+  const rest: Omit<T, "defaultInWarehouse" | "defaultOutWarehouse"> & Partial<T> = { ...input };
+  delete rest.defaultInWarehouse;
+  delete rest.defaultOutWarehouse;
+  return { ...rest, ...stock };
+};
+
+/** 품목의 재고 칸을 DB 의 목록에 대어 본다(src/lib/item-stock.ts) — 맞으면 저장할 칸을, 틀리면 errors 에 까닭을 더한다. */
+async function checkStock(
+  db: Db,
+  values: ItemValues,
+  itemType: string | undefined,
+  errors: ItemErrors,
+  current?: Item,
+): Promise<StockColumns | undefined> {
+  const r = resolveStock(
+    {
+      itemType,
+      lotRuleCode: (values.lotRuleCode ?? "").trim() || null,
+      defaultInWarehouse: (values.defaultInWarehouse ?? "").trim() || null,
+      defaultOutWarehouse: (values.defaultOutWarehouse ?? "").trim() || null,
+    },
+    await stockLists(db),
+    current,
+    new Set(Object.keys(errors)),
+  );
+  if (r.ok) return r.value;
+  Object.assign(errors, r.errors);
 }
 
 // ── 등록 · 수정 ─────────────────────────────────────────
@@ -248,12 +305,37 @@ const CONSTRAINT_FIELD: Record<string, ItemField> = {
   items_cls2_fk: "cls2",
   items_cls3_fk: "cls3",
   items_note_length: "note",
+  items_lot_rule_fk: "lotRuleCode",
+  items_lot_rule_made_only: "lotRuleCode",
+  items_default_in_warehouse_fk: "defaultInWarehouse",
+  items_default_out_warehouse_fk: "defaultOutWarehouse",
 };
 
 /** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
+// 칸의 말이 「받을 수 없는 값」보다 더 알려 줄 수 있는 제약 — 기본 창고의 참조는 고른 뒤 그 창고가 불량창고로 바뀌었을 때 걸린다(리뷰 1회차).
+const DEFECT_SINCE = "그 사이 불량창고로 바뀐 창고입니다 — 다른 창고를 고르세요";
+const CONSTRAINT_MESSAGE: Record<string, string> = {
+  items_default_in_warehouse_fk: DEFECT_SINCE,
+  items_default_out_warehouse_fk: DEFECT_SINCE,
+};
+const rejectedField = (error: unknown): ItemErrors | undefined => {
+  const name = constraintOf(error) ?? "";
+  const field = CONSTRAINT_FIELD[name];
+  return field && { [field]: CONSTRAINT_MESSAGE[name] ?? "받을 수 없는 값입니다" };
+};
+
+/** 그 창고를 기본 입고 · 출고 창고로 쓰는 품목의 수 — 창고를 불량창고로 바꿀 수 있는지 본다(src/db/warehouses.ts). */
+export async function itemsDefaultingTo(db: Db, warehouseId: number): Promise<number> {
+  const [{ n }] = await db
+    .select({ n: count() })
+    .from(items)
+    .where(or(eq(items.defaultInWarehouseId, warehouseId), eq(items.defaultOutWarehouseId, warehouseId)));
+  return n;
+}
+
 function asRejection(error: unknown, values: ItemValues): SaveResult {
-  const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
-  if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
+  const errors = rejectedField(error);
+  if (errors) return { ok: false, errors, values };
   if (pgError(error).code === "23514")
     return { ok: false, errors: {}, formError: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다", values };
   throw error;
@@ -264,7 +346,9 @@ export async function createItem(db: Db, values: ItemValues): Promise<SaveResult
   const parsed = parseNewItem(values);
   const errors: ItemErrors = parsed.ok ? {} : { ...parsed.errors };
   await checkCodes(db, values, errors);
-  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
+  const itemType = ITEM_TYPES.some((t) => t.code === values.itemType) ? values.itemType : undefined;
+  const stock = await checkStock(db, values, itemType, errors);
+  if (!parsed.ok || !stock || Object.keys(errors).length) return { ok: false, errors, values };
 
   try {
     const r = await registerWithCode(db, {
@@ -273,7 +357,7 @@ export async function createItem(db: Db, values: ItemValues): Promise<SaveResult
       limit: ITEM_LIMIT,
       prefix: parsed.value.itemType,
       uniqueConstraint: "items_code_unique",
-      insert: (tx, code) => tx.insert(items).values({ ...parsed.value, code }),
+      insert: (tx, code) => tx.insert(items).values({ ...columnsOf(parsed.value, stock), code }),
     });
     if (r.ok) return r;
     return {
@@ -304,26 +388,47 @@ export async function updateItem(
   const parsed = parseItemUpdate(values);
   const errors: ItemErrors = parsed.ok ? {} : { ...parsed.errors };
   await checkCodes(db, values, errors, current);
-  if (!parsed.ok || Object.keys(errors).length) return { ok: false, errors, values };
+  const stock = await checkStock(db, values, current.itemType, errors, current);
+  if (!parsed.ok || !stock || Object.keys(errors).length) return { ok: false, errors, values };
   if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
 
   try {
-    const done = await db
-      .update(items)
-      .set({ ...parsed.value, updatedAt: touched() })
-      .where(
-        version === undefined
-          ? eq(items.id, current.id)
-          : and(eq(items.id, current.id), versionIs(items.updatedAt, version)),
-      )
-      .returning({ id: items.id });
-    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
-    return { ok: true, code };
+    return await db.transaction(async (tx): Promise<SaveResult> => {
+      // 수불이 있는 품목은 LOT 관리 · 단위를 바꾸지 못한다(ADR 0015) — 재고의 잠금을 쥐고 세어, 센 뒤 그 사이 수불이 들지 않는다.
+      const moved = movedErrors(parsed.value, current);
+      if (Object.keys(moved).length) {
+        await lockStock(tx);
+        if ((await itemsWithMoves(tx, [current.id])).size) return { ok: false, errors: moved, values };
+      }
+      const done = await tx
+        .update(items)
+        .set({ ...columnsOf(parsed.value, stock), updatedAt: touched() })
+        .where(
+          version === undefined
+            ? eq(items.id, current.id)
+            : and(eq(items.id, current.id), versionIs(items.updatedAt, version)),
+        )
+        .returning({ id: items.id });
+      if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
+      return { ok: true, code };
+    });
   } catch (error) {
     return asRejection(error, values);
   }
 }
 
+const MOVED_UNIT = "수불이 있거나 작성 중인 실사에 든 품목이라 단위를 바꾸지 못합니다 — 이미 넣은 수량의 뜻이 바뀝니다";
+const MOVED_LOT =
+  "수불이 있거나 작성 중인 실사에 든 품목이라 LOT 관리를 바꾸지 못합니다 — 이미 넣은 수량의 뜻이 바뀝니다";
+
+/** 바꾸려는 칸 가운데 수불이 있으면 막는 것(단위 · LOT 관리)의 까닭 — 바꾸지 않으면 비어 있다. */
+function movedErrors(next: { unit: string; lotManaged: boolean }, current: Item): ItemErrors {
+  const errors: ItemErrors = {};
+  if (next.unit !== current.unit) errors.unit = MOVED_UNIT;
+  if (next.lotManaged !== current.lotManaged) errors.lotManaged = MOVED_LOT;
+  return errors;
+}
+
 // ── 시트형 등록(PR F) ────────────────────────────────────
 
 /** 단위의 공통코드 — 「사용 안 함」까지. 시트는 이름 · 코드 둘 다 받고, 「사용 안 함」 단위는 거절한다. */
@@ -341,10 +446,11 @@ function rowRejection(r: RegisteredRow | UpdatedRow): SheetErrors {
   if (r.reason === "limit") return { [ROW_ERROR]: limitMessage("품목", ITEM_LIMIT) };
   if (r.reason === "collided") return { [ROW_ERROR]: COLLIDED };
   if (r.reason === "stale") return { [ROW_ERROR]: STALE_ROW };
-  const field = CONSTRAINT_FIELD[constraintOf(r.error) ?? ""];
-  return field
-    ? { [field]: "받을 수 없는 값입니다" }
-    : { [ROW_ERROR]: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다" };
+  return (
+    (rejectedField(r.error) as SheetErrors | undefined) ?? {
+      [ROW_ERROR]: "받을 수 없는 값이 있습니다 — 수량은 0 이상입니다",
+    }
+  );
 }
 
 /** 시트가 고치려는 품목들 — 코드의 꼴이 맞는 것만 DB 에 묻는다. */
@@ -363,43 +469,79 @@ async function itemsByCode(db: Db, rows: readonly SheetRow[]): Promise<Map<strin
  */
 export async function saveItemRows(db: Db, rows: readonly SheetRow[]): Promise<SheetResult> {
   const filled = rows.filter((r) => !isBlankRow(r));
-  const [units, classes, currents] = await Promise.all([allUnits(db), allItemClasses(db), itemsByCode(db, filled)]);
+  const [units, classes, currents, lists] = await Promise.all([
+    allUnits(db),
+    allItemClasses(db),
+    itemsByCode(db, filled),
+    stockLists(db),
+  ]);
   const seen = new Map<string, number>();
   for (const r of filled) if (isLoadedRow(r)) seen.set(r[CODE_KEY], (seen.get(r[CODE_KEY]) ?? 0) + 1);
 
   type Read =
     | { row: SheetRow; kind: "rejected"; errors: SheetErrors }
-    | { row: SheetRow; kind: "new"; value: ReturnType<typeof readItemRow> & { ok: true } }
-    | { row: SheetRow; kind: "edit"; current: Item; value: ReturnType<typeof readItemEditRow> & { ok: true } };
+    | { row: SheetRow; kind: "new"; value: ReturnType<typeof readItemRow> & { ok: true }; stock: StockColumns }
+    | {
+        row: SheetRow;
+        kind: "edit";
+        current: Item;
+        value: ReturnType<typeof readItemEditRow> & { ok: true };
+        stock: StockColumns;
+      };
+  // 재고 칸은 읽은 값(코드)을 DB 의 목록에 대어 본다 — 한 건 등록 · 수정과 같은 규칙(src/lib/item-stock.ts).
+  const stockOf = (input: ItemInput, itemType: string, current?: Item) =>
+    resolveStock({ ...input, itemType }, lists, current);
   const read: Read[] = filled.map((row) => {
     if (!isLoadedRow(row)) {
-      const r = readItemRow(row, units, classes);
-      return r.ok ? { row, kind: "new", value: r } : { row, kind: "rejected", errors: r.errors };
+      const r = readItemRow(row, units, classes, lists);
+      if (!r.ok) return { row, kind: "rejected", errors: r.errors };
+      const stock = stockOf(r.value, r.value.itemType);
+      return stock.ok
+        ? { row, kind: "new", value: r, stock: stock.value }
+        : { row, kind: "rejected", errors: stock.errors };
     }
     const current = currents.get(row[CODE_KEY]);
     if (!current) return { row, kind: "rejected", errors: { [ROW_ERROR]: "없는 품목입니다 — 이 행을 지우세요" } };
     if (seen.get(row[CODE_KEY])! > 1) return { row, kind: "rejected", errors: { [ROW_ERROR]: DUPLICATE_ROW } };
     if (!VERSION.test(row[VERSION_KEY] ?? "")) return { row, kind: "rejected", errors: { [ROW_ERROR]: STALE_ROW } };
-    const r = readItemEditRow(row, units, classes, current);
-    return r.ok ? { row, kind: "edit", current, value: r } : { row, kind: "rejected", errors: r.errors };
+    const r = readItemEditRow(row, units, classes, current, lists);
+    if (!r.ok) return { row, kind: "rejected", errors: r.errors };
+    const stock = stockOf(r.value, current.itemType, current);
+    return stock.ok
+      ? { row, kind: "edit", current, value: r, stock: stock.value }
+      : { row, kind: "rejected", errors: stock.errors };
   });
   const edits = read.flatMap((r) => (r.kind === "edit" ? [r] : []));
   const news = read.flatMap((r) => (r.kind === "new" ? [r] : []));
 
   const outcome = await db.transaction(async (tx) => {
-    const updated = await updateRowsWithVersion(
+    // 수불이 있는 품목의 단위 · LOT 관리를 바꾸는 줄은 남긴다(ADR 0015) — 한 건 수정과 같은 규칙 · 같은 잠금.
+    const guarded = edits.filter((r) => Object.keys(movedErrors(r.value.value, r.current)).length);
+    if (guarded.length) await lockStock(tx);
+    const moved = await itemsWithMoves(
+      tx,
+      guarded.map((r) => r.current.id),
+    );
+    const blocked = new Map(
+      guarded.filter((r) => moved.has(r.current.id)).map((r) => [r, movedErrors(r.value.value, r.current)] as const),
+    );
+    const allowed = edits.filter((r) => !blocked.has(r));
+    const done = await updateRowsWithVersion(
       tx,
-      edits.map((r) => ({
+      allowed.map((r) => ({
         update: async (sp: Db) =>
           (
             await sp
               .update(items)
-              .set({ ...r.value.value, updatedAt: touched() })
+              .set({ ...columnsOf(r.value.value, r.stock), updatedAt: touched() })
               .where(and(eq(items.id, r.current.id), versionIs(items.updatedAt, r.row[VERSION_KEY])))
               .returning({ id: items.id })
           ).length,
       })),
     );
+    const updated = new Map<Read, UpdatedRow | { ok: false; reason: "moved"; errors: SheetErrors }>();
+    allowed.forEach((r, i) => updated.set(r, done[i]));
+    for (const [r, errors] of blocked) updated.set(r, { ok: false, reason: "moved", errors });
     const registered = news.length
       ? await registerRowsWithCode(tx, {
           table: items,
@@ -408,7 +550,7 @@ export async function saveItemRows(db: Db, rows: readonly SheetRow[]): Promise<S
           uniqueConstraint: "items_code_unique",
           rows: news.map((r) => ({
             prefix: r.value.value.itemType,
-            insert: (sp: Db, code: string) => sp.insert(items).values({ ...r.value.value, code }),
+            insert: (sp: Db, code: string) => sp.insert(items).values({ ...columnsOf(r.value.value, r.stock), code }),
           })),
         })
       : [];
@@ -421,8 +563,9 @@ export async function saveItemRows(db: Db, rows: readonly SheetRow[]): Promise<S
       result.rejected.push({ row: r.row, errors: r.errors });
       continue;
     }
-    const done = r.kind === "edit" ? outcome.updated[edits.indexOf(r)] : outcome.registered[news.indexOf(r)];
-    if (!done.ok) result.rejected.push({ row: r.row, errors: rowRejection(done) });
+    const done = r.kind === "edit" ? outcome.updated.get(r)! : outcome.registered[news.indexOf(r)];
+    if (!done.ok && done.reason === "moved") result.rejected.push({ row: r.row, errors: done.errors });
+    else if (!done.ok) result.rejected.push({ row: r.row, errors: rowRejection(done) });
     else result.saved.push({ ...savedCode(r, done), name: r.value.value.name });
   }
   return result;
diff --git a/src/db/master-shared.ts b/src/db/master-shared.ts
index d14a993..82a2d2c 100644
--- a/src/db/master-shared.ts
+++ b/src/db/master-shared.ts
@@ -13,6 +13,9 @@ export const REGISTER_LOCK = {
   warehouses: 2026110302,
   partners: 2026110303,
   codes: 2026110304,
+  numberRules: 2026110601,
+  // 재고 수불(조각 「재고 수불」 PR C) — 수불 저장 · 취소, 그리고 재고에 기대는 고침(품목의 LOT 관리 · 단위, 창고의 불량창고 표시, 단위의 자릿수).
+  stock: 2026110901,
 } as const;
 
 export type Params = Record<string, string | string[] | undefined>;
diff --git a/src/db/numbering.ts b/src/db/numbering.ts
index 1170c4f..d4b34c8 100644
--- a/src/db/numbering.ts
+++ b/src/db/numbering.ts
@@ -9,6 +9,8 @@ const SERIES = {
   RM: { table: items, digits: 4 },
   SF: { table: items, digits: 4 },
   FG: { table: items, digits: 4 },
+  SM: { table: items, digits: 4 },
+  CS: { table: items, digits: 4 },
   WH: { table: warehouses, digits: 2 },
   BP: { table: partners, digits: 4 },
 } as const;
diff --git a/src/db/reset.ts b/src/db/reset.ts
index 492c9ff..fde535e 100644
--- a/src/db/reset.ts
+++ b/src/db/reset.ts
@@ -1,29 +1,177 @@
-import { sql } from "drizzle-orm";
-import { SAMPLE_CODE_GROUPS, SAMPLE_CODES, SAMPLE_ITEMS, SAMPLE_PARTNERS, SAMPLE_WAREHOUSES } from "./sample";
-import { codeGroups, codes, items, partners, warehouses } from "./schema";
+import { asc, count, eq, sql } from "drizzle-orm";
+import type { ItemType } from "@/lib/master-codes";
+import { koreaToday } from "@/lib/today";
+import {
+  SAMPLE_CODE_GROUPS,
+  SAMPLE_CODES,
+  SAMPLE_COUNTS,
+  SAMPLE_DEFAULT_WAREHOUSES,
+  SAMPLE_ITEMS,
+  SAMPLE_MOVES,
+  SAMPLE_NUMBER_RULES,
+  SAMPLE_PARTNERS,
+  SAMPLE_UNIT_SPECS,
+  SAMPLE_WAREHOUSES,
+} from "./sample";
+import {
+  codeGroups,
+  codes,
+  items,
+  numberRules,
+  numberRuleSeqs,
+  partners,
+  stockBalances,
+  stockCountLines,
+  stockCounts,
+  stockMoveLines,
+  stockMoves,
+  unitSpecs,
+  warehouses,
+} from "./schema";
+import { cancelMove, lockStock, saveMove } from "./stock";
+import { confirmCount, openCountSheet, saveCount } from "./stock-counts";
 import type { Db } from "./types";
 
 /** 되돌림이 비우고 다시 채우는 테이블 — 테이블을 더하는 조각은 여기에도 더한다(시험이 스키마와 견준다). */
-export const RESET_TABLES = ["items", "warehouses", "partners", "codes", "code_groups"] as const;
+export const RESET_TABLES = [
+  "stock_count_lines",
+  "stock_counts",
+  "stock_balances",
+  "stock_move_lines",
+  "stock_moves",
+  "items",
+  "number_rule_seqs",
+  "number_rules",
+  "warehouses",
+  "partners",
+  "unit_specs",
+  "codes",
+  "code_groups",
+] as const;
 
 export type ResetCounts = Record<(typeof RESET_TABLES)[number], number>;
 
-// 다섯 테이블을 샘플 데이터로 되돌린다(ADR 0004). 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다.
+// 테이블을 샘플 데이터로 되돌린다(ADR 0004). 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않는다.
 // 번호(id)도 1 부터 다시 센다. 코드 번호는 테이블의 가장 큰 번호 + 1 이라 샘플의 다음 번호부터 붙는다.
-export async function resetToSample(db: Db): Promise<ResetCounts> {
-  await db.transaction(async (tx) => {
+// 번호 규칙의 일련(number_rule_seqs)은 비우고, 샘플 수불이 LOT 를 저절로 붙이며 채운다.
+// 샘플 수불은 재고 계산의 저장(src/db/stock.ts)을 불러 넣는다 — 날짜는 today(한국 시각의 오늘)에서 센다(설계 「2026-11-09 — PR C 를 열기 전에 정한 것」).
+export async function resetToSample(db: Db, today: string = koreaToday()): Promise<ResetCounts> {
+  return db.transaction(async (tx) => {
+    // 재고의 잠금을 먼저 쥔다 — 수불 저장과 같은 차례(잠금 → 표). 비운 뒤 잠금을 기다리면 잠금을 쥔 채 표를 읽으려는 저장과
+    // 서로 기다려 한쪽이 교착(40P01)으로 되돌아간다(PR C 리뷰 1회차).
+    await lockStock(tx);
     await tx.execute(sql.raw(`truncate table ${RESET_TABLES.map((t) => `"${t}"`).join(", ")} restart identity`));
     await tx.insert(codeGroups).values(SAMPLE_CODE_GROUPS);
     await tx.insert(codes).values(SAMPLE_CODES);
-    await tx.insert(warehouses).values(SAMPLE_WAREHOUSES);
+    await tx.insert(unitSpecs).values(SAMPLE_UNIT_SPECS);
+    const placed = await tx
+      .insert(warehouses)
+      .values(SAMPLE_WAREHOUSES)
+      .returning({ id: warehouses.id, code: warehouses.code });
+    await tx.insert(numberRules).values(SAMPLE_NUMBER_RULES);
     await tx.insert(partners).values(SAMPLE_PARTNERS);
-    await tx.insert(items).values(SAMPLE_ITEMS);
+    const idOf = (code: string) => placed.find((w) => w.code === code)!.id;
+    await tx.insert(items).values(
+      SAMPLE_ITEMS.map((i) => {
+        const at = SAMPLE_DEFAULT_WAREHOUSES[i.itemType as ItemType];
+        return { ...i, defaultInWarehouseId: idOf(at.in), defaultOutWarehouseId: idOf(at.out) };
+      }),
+    );
+    await insertSampleMoves(tx, today);
+    await insertSampleCounts(tx, today);
+    const n = async (
+      t:
+        | typeof stockMoves
+        | typeof stockMoveLines
+        | typeof stockBalances
+        | typeof numberRuleSeqs
+        | typeof stockCounts
+        | typeof stockCountLines,
+    ) => (await tx.select({ n: count() }).from(t))[0].n;
+    return {
+      stock_count_lines: await n(stockCountLines),
+      stock_counts: await n(stockCounts),
+      stock_balances: await n(stockBalances),
+      stock_move_lines: await n(stockMoveLines),
+      stock_moves: await n(stockMoves),
+      items: SAMPLE_ITEMS.length,
+      number_rule_seqs: await n(numberRuleSeqs),
+      number_rules: SAMPLE_NUMBER_RULES.length,
+      warehouses: SAMPLE_WAREHOUSES.length,
+      partners: SAMPLE_PARTNERS.length,
+      unit_specs: SAMPLE_UNIT_SPECS.length,
+      codes: SAMPLE_CODES.length,
+      code_groups: SAMPLE_CODE_GROUPS.length,
+    };
   });
-  return {
-    items: SAMPLE_ITEMS.length,
-    warehouses: SAMPLE_WAREHOUSES.length,
-    partners: SAMPLE_PARTNERS.length,
-    codes: SAMPLE_CODES.length,
-    code_groups: SAMPLE_CODE_GROUPS.length,
-  };
+}
+
+/** 날짜(YYYY-MM-DD)에서 며칠 앞. */
+export function daysBefore(date: string, days: number): string {
+  const [y, m, d] = date.split("-").map(Number);
+  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
+}
+
+/**
+ * 샘플 수불을 차례로 저장한다 — 틀리면 던져 되돌림 전체를 되돌린다(샘플이 규칙에 어긋난 것이라 고쳐야 한다).
+ * LOT 의 `@<품목 코드>` 는 그 품목이 앞의 샘플에서 저절로 받은 첫 LOT 다(격리 이동이 쓴다).
+ */
+async function insertSampleMoves(tx: Db, today: string) {
+  for (const m of SAMPLE_MOVES) {
+    const moveDate = daysBefore(today, m.daysAgo);
+    const lines = [];
+    for (const l of m.lines) {
+      if (!l.lot?.startsWith("@")) {
+        lines.push(l);
+        continue;
+      }
+      const [first] = await tx
+        .select({ lot: stockMoveLines.lot })
+        .from(stockMoveLines)
+        .innerJoin(items, eq(items.id, stockMoveLines.itemId))
+        .where(eq(items.code, l.lot.slice(1)))
+        .orderBy(asc(stockMoveLines.id))
+        .limit(1);
+      lines.push({ ...l, lot: first?.lot ?? "" });
+    }
+    const saved = await saveMove(
+      tx,
+      { moveDate, moveType: m.moveType, reason: m.reason ?? "", note: m.note ?? "", lines },
+      today,
+    );
+    if (!saved.ok)
+      throw new Error(`샘플 수불 저장 실패(${m.daysAgo}일 전 ${m.moveType}): ${JSON.stringify(saved.errors)}`);
+    if (m.cancel) {
+      const cancel = await cancelMove(tx, saved.code, moveDate);
+      if (!cancel.ok) throw new Error(`샘플 수불 취소 실패: ${saved.code}`);
+    }
+  }
+}
+
+/**
+ * 샘플 재고 실사를 넣는다 — 그 창고의 장부를 불러(openCountSheet) 실물 수량을 채워 저장하고, confirm 이면 확정한다. 화면과 같은 길이라
+ * 번호 · 조정 전표 · 잔액이 맞는다. 틀리면 던져 되돌림 전체를 되돌린다.
+ */
+async function insertSampleCounts(tx: Db, today: string) {
+  for (const c of SAMPLE_COUNTS) {
+    const date = daysBefore(today, c.daysAgo);
+    const opened = await openCountSheet(tx, c.warehouse);
+    if (!opened.ok) throw new Error(`샘플 실사를 열지 못했다(${c.warehouse}): ${opened.message}`);
+    const lines = opened.sheet.lines.map((l) => {
+      const hit = c.counted[`${l.itemCode}|${l.lot}`] ?? c.counted[l.itemCode];
+      return {
+        item: l.itemCode,
+        lot: l.lot,
+        status: l.status,
+        counted: hit ?? (c.rest === "book" ? l.book : ""),
+      };
+    });
+    const saved = await saveCount(tx, { warehouse: c.warehouse, baseline: String(opened.sheet.baseline), lines }, date);
+    if (!saved.ok)
+      throw new Error(`샘플 실사 저장 실패(${c.warehouse}): ${JSON.stringify([saved.errors, saved.formError])}`);
+    if (c.confirm) {
+      const done = await confirmCount(tx, saved.code, saved.version, date);
+      if (!done.ok) throw new Error(`샘플 실사 확정 실패: ${saved.code}`);
+    }
+  }
 }
diff --git a/src/db/sample.ts b/src/db/sample.ts
index 09fcbfa..09e38a0 100644
--- a/src/db/sample.ts
+++ b/src/db/sample.ts
@@ -1,5 +1,7 @@
-import { ITEM_TYPES, PROC_TYPES } from "@/lib/master-codes";
-import type { codeGroups, codes, items, partners, warehouses } from "./schema";
+import { ITEM_TYPES, MOVE_TYPES, PROC_TYPES, type ItemType } from "@/lib/master-codes";
+import type { MoveLineValues } from "@/lib/move-input";
+import type { MoveType } from "@/lib/master-codes";
+import type { codeGroups, codes, items, numberRules, partners, unitSpecs, warehouses } from "./schema";
 
 // 샘플 데이터 — 가상 반도체 후공정(패키징) 회사. 매일 밤 되돌림(ADR 0004)과 첫 배포가 이 값으로 테이블을 채운다.
 // 실제 회사명 · 실제 사람의 정보를 쓰지 않는다(CLAUDE.md). 거래처 이름은 「(가상)」으로 시작하고,
@@ -19,15 +21,29 @@ export const SAMPLE_CODE_GROUPS: New<typeof codeGroups>[] = [
   { code: "ITEM_CLS1", name: "품목 대분류", isSystem: false },
   { code: "ITEM_CLS2", name: "품목 중분류", isSystem: false },
   { code: "ITEM_CLS3", name: "품목 소분류", isSystem: false },
+  // 재고 수불(PR C, ADR 0016) — 수불 유형은 재고 계산이 기대는 시스템 코드, 조정 사유는 사용자 코드.
+  { code: "MOVE_TYPE", name: "수불 유형", isSystem: true },
+  { code: "ADJ_REASON", name: "조정 사유", isSystem: false },
 ];
 
 export const SAMPLE_CODES: New<typeof codes>[] = [
   ...ITEM_TYPES.map((t, i) => ({ groupCode: "ITEM_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
   ...PROC_TYPES.map((t, i) => ({ groupCode: "PROC_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
+  ...MOVE_TYPES.map((t, i) => ({ groupCode: "MOVE_TYPE", code: t.code, name: t.name, sortOrder: (i + 1) * 10 })),
+  { groupCode: "ADJ_REASON", code: "COUNT", name: "실사 차이", sortOrder: 10 },
+  { groupCode: "ADJ_REASON", code: "DAMAGE", name: "파손", sortOrder: 20 },
+  { groupCode: "ADJ_REASON", code: "LOSS", name: "분실", sortOrder: 30 },
+  { groupCode: "ADJ_REASON", code: "FOUND", name: "발견", sortOrder: 40 },
+  { groupCode: "ADJ_REASON", code: "ETC", name: "기타", sortOrder: 50 },
   { groupCode: "UNIT", code: "EA", name: "개", sortOrder: 10 },
   { groupCode: "UNIT", code: "M", name: "미터", sortOrder: 20 },
   { groupCode: "UNIT", code: "KG", name: "킬로그램", sortOrder: 30 },
   { groupCode: "UNIT", code: "G", name: "그램", sortOrder: 40 },
+  // 조각 「재고 수불」 PR A 가 더한 단위(저자 인터뷰 2026-11-05) — 같은 기준의 단위로 바꿔 넣는다(ADR 0017).
+  { groupCode: "UNIT", code: "MM", name: "밀리미터", sortOrder: 50 },
+  { groupCode: "UNIT", code: "L", name: "리터", sortOrder: 60 },
+  { groupCode: "UNIT", code: "ML", name: "밀리리터", sortOrder: 70 },
+  { groupCode: "UNIT", code: "MG", name: "밀리그램", sortOrder: 80 },
   // 국가 — 국제 표준 두 글자(ADR 0011). 마이그레이션 0001(손으로 쓴 것)이 데이터가 있는 DB 에 같은 값을 넣는다(시험이 견준다).
   { groupCode: "COUNTRY", code: "KR", name: "한국", sortOrder: 10 },
   { groupCode: "COUNTRY", code: "US", name: "미국", sortOrder: 20 },
@@ -41,6 +57,9 @@ export const SAMPLE_CODES: New<typeof codes>[] = [
   { groupCode: "ITEM_CLS1", code: "CHEM", name: "화학재료", sortOrder: 40 },
   { groupCode: "ITEM_CLS1", code: "WIP", name: "공정품", sortOrder: 50 },
   { groupCode: "ITEM_CLS1", code: "IC", name: "IC", sortOrder: 60 },
+  // 부자재 · 소모품의 종류(조각 「재고 수불」 PR B — 저자 판정 2026-11-06). 마이그레이션 0008 이 데이터가 있는 DB 에 같은 값을 넣는다.
+  { groupCode: "ITEM_CLS1", code: "PACK", name: "포장재", sortOrder: 70 },
+  { groupCode: "ITEM_CLS1", code: "TOOL", name: "공구", sortOrder: 80 },
   { groupCode: "ITEM_CLS2", code: "SOP", name: "SOP", sortOrder: 10 },
   { groupCode: "ITEM_CLS2", code: "QFN", name: "QFN", sortOrder: 20 },
   { groupCode: "ITEM_CLS2", code: "COMMON", name: "공용", sortOrder: 30 },
@@ -49,13 +68,67 @@ export const SAMPLE_CODES: New<typeof codes>[] = [
   { groupCode: "ITEM_CLS3", code: "GENERAL", name: "범용", sortOrder: 30 },
 ];
 
+/**
+ * 단위 사양(ADR 0017) — 단위마다 기준 단위 · 배수 · 소수 자릿수. 샘플의 단위(UNIT 값) 하나하나에 하나씩 있다(시험이 견준다).
+ * 마이그레이션 0006 이 데이터가 있는 DB 에 넣는 값과 같다.
+ */
+export const SAMPLE_UNIT_SPECS: New<typeof unitSpecs>[] = [
+  { unit: "EA", baseUnit: "EA", factor: 1, decimals: 0 },
+  { unit: "M", baseUnit: "M", factor: 1, decimals: 3 },
+  { unit: "KG", baseUnit: "G", factor: 1000, decimals: 3 },
+  { unit: "G", baseUnit: "G", factor: 1, decimals: 0 },
+  { unit: "MM", baseUnit: "M", factor: 0.001, decimals: 0 },
+  { unit: "L", baseUnit: "ML", factor: 1000, decimals: 3 },
+  { unit: "ML", baseUnit: "ML", factor: 1, decimals: 0 },
+  { unit: "MG", baseUnit: "G", factor: 0.001, decimals: 0 },
+];
+
 export const SAMPLE_WAREHOUSES: New<typeof warehouses>[] = [
   { code: "WH-01", name: "자재창고" },
   { code: "WH-02", name: "생산현장" },
   { code: "WH-03", name: "제품창고" },
-  { code: "WH-04", name: "불량창고" },
+  // 불량창고 표시(조각 「재고 수불」 PR B, ADR 0015) — 이 창고의 재고는 불량이라 가용에 들지 않는다.
+  { code: "WH-04", name: "불량창고", isDefect: true },
+];
+
+/**
+ * LOT 번호 규칙(조각 「재고 수불」 PR B, ADR 0016 · 저자 판정 2026-11-06) — 반제품 · 완제품의 기본 규칙 둘과,
+ * 품목에서 다른 규칙을 고르는 것을 보이는 숫자형 하나(센서 IC 가 고른다). 마이그레이션 0008 이 데이터가 있는 DB 에 같은 값을 넣는다.
+ */
+export const SAMPLE_NUMBER_RULES: New<typeof numberRules>[] = [
+  {
+    code: "LOT_SF",
+    name: "반제품 LOT",
+    prefix: "SF",
+    separator: "-",
+    dateFormat: "YYMMDD",
+    seqDigits: 3,
+    defaultFor: "SF",
+  },
+  {
+    code: "LOT_FG",
+    name: "완제품 LOT",
+    prefix: "FG",
+    separator: "-",
+    dateFormat: "YYMMDD",
+    seqDigits: 3,
+    defaultFor: "FG",
+  },
+  { code: "LOT_NUM", name: "숫자형 LOT", prefix: "", separator: "", dateFormat: "YYMMDD", seqDigits: 3 },
 ];
 
+/**
+ * 유형마다 품목의 기본 입고 · 출고 창고(저자 판정 2026-11-06 — 설계 「PR B 를 열기 전에 정한 것」). 사 오는 품목은 자재창고에 들어와
+ * 생산현장으로 옮긴 뒤 현장에서 나간다. 되돌림이 창고 코드를 번호(id)로 바꿔 샘플 품목에 넣는다.
+ */
+export const SAMPLE_DEFAULT_WAREHOUSES: Record<ItemType, { in: string; out: string }> = {
+  RM: { in: "WH-01", out: "WH-02" },
+  SM: { in: "WH-01", out: "WH-02" },
+  CS: { in: "WH-01", out: "WH-02" },
+  SF: { in: "WH-02", out: "WH-02" },
+  FG: { in: "WH-03", out: "WH-03" },
+};
+
 export const SAMPLE_PARTNERS: New<typeof partners>[] = [
   {
     code: "BP-0001",
@@ -159,9 +232,12 @@ export const SAMPLE_PARTNERS: New<typeof partners>[] = [
 ];
 
 // 원자재 → 구매 · 수입검사, 반제품 · 완제품 → 생산, 완제품 → 출하검사(ADR 0003 의 기본값).
+// 부자재 · 소모품 → 구매 · LOT 관리 끔 · 검사 끔(ADR 0019). LOT 관리는 DB 의 기본값(켬)이라 끄는 것만 적는다.
 const rm = { itemType: "RM", procurement: "BUY", inspectIn: true } as const;
 const sf = { itemType: "SF", procurement: "MAKE" } as const;
 const fg = { itemType: "FG", procurement: "MAKE", inspectOut: true } as const;
+const sm = { itemType: "SM", procurement: "BUY", lotManaged: false } as const;
+const cs = { itemType: "CS", procurement: "BUY", lotManaged: false } as const;
 
 export const SAMPLE_ITEMS: New<typeof items>[] = [
   {
@@ -293,5 +369,168 @@ export const SAMPLE_ITEMS: New<typeof items>[] = [
     safetyStock: 1000,
     minLot: 500,
     lotMultiple: 500,
+    // 품목에서 다른 LOT 규칙을 고른다 — 숫자만인 꼴(ADR 0016, 저자 판정 2026-11-06).
+    lotRuleCode: "LOT_NUM",
   },
+  // 부자재 · 소모품(조각 「재고 수불」 PR B — 저자 판정 2026-11-06). 마이그레이션 0008 이 데이터가 있는 DB 에 같은 값을 넣는다.
+  {
+    ...sm,
+    code: "SM-0001",
+    cls1: "PACK",
+    cls2: "SOP",
+    name: "캐리어 테이프",
+    spec: "폭 12mm · SOP-8 용",
+    unit: "M",
+    leadTimeDays: 7,
+    safetyStock: 2000,
+    minLot: 1000,
+    lotMultiple: 500,
+  },
+  {
+    ...sm,
+    code: "SM-0002",
+    cls1: "PACK",
+    cls2: "COMMON",
+    name: "방습백",
+    spec: "알루미늄 · 건조제 동봉",
+    unit: "EA",
+    leadTimeDays: 7,
+    safetyStock: 500,
+    minLot: 500,
+    lotMultiple: 100,
+  },
+  {
+    ...cs,
+    code: "CS-0001",
+    cls1: "TOOL",
+    cls2: "COMMON",
+    name: "다이싱 블레이드",
+    spec: "두께 30µm",
+    unit: "EA",
+    leadTimeDays: 14,
+    safetyStock: 10,
+    minLot: 5,
+    lotMultiple: 5,
+  },
+  {
+    ...cs,
+    code: "CS-0002",
+    cls1: "CHEM",
+    cls2: "COMMON",
+    name: "세정용 IPA",
+    spec: "순도 99.9%",
+    unit: "L",
+    leadTimeDays: 5,
+    safetyStock: 20,
+    minLot: 20,
+    lotMultiple: 20,
+  },
+];
+
+/**
+ * 샘플 수불(조각 「재고 수불」 PR C — 저자 판정 2026-11-09, 설계 「2026-11-09 — PR C 를 열기 전에 정한 것」). 날짜는 되돌린 날 D 에서 센다(daysAgo).
+ * 오늘 날짜의 전표는 두지 않아 그날 첫 전표가 IV-<오늘>-001 이다. 거래처 LOT 는 지어낸 번호다(CLAUDE.md — 실제 거래처의 LOT 꼴을 쓰지 않는다).
+ * 반제품 · 완제품은 LOT 를 비워 번호 규칙으로 받는다. 되돌림이 재고 계산의 저장(src/db/stock.ts)을 불러 넣는다 — 잔액 · 번호 · LOT 일련이 맞는다.
+ * cancel 이면 같은 날 그 전표를 취소한다.
+ */
+export type SampleMove = {
+  daysAgo: number;
+  moveType: MoveType;
+  reason?: string;
+  note?: string;
+  lines: MoveLineValues[];
+  cancel?: true;
+};
+
+export const SAMPLE_MOVES: SampleMove[] = [
+  {
+    daysAgo: 7,
+    moveType: "IN",
+    note: "기초 재고",
+    lines: [
+      { item: "RM-0001", lot: "MW-A1021", warehouse: "WH-01", qty: "100" },
+      { item: "RM-0002", lot: "GL-S8-5501", warehouse: "WH-01", qty: "30000" },
+      { item: "RM-0003", lot: "NW-25-0701", warehouse: "WH-01", qty: "8000" },
+      { item: "RM-0004", lot: "SR-K3108", warehouse: "WH-01", qty: "75" },
+      { item: "RM-0005", lot: "DA-AG-1150", warehouse: "WH-01", qty: "1000" },
+      { item: "RM-0006", lot: "GL-Q32-2207", warehouse: "WH-01", qty: "15000" },
+      { item: "SF-0001", warehouse: "WH-02", qty: "2000" },
+      { item: "SF-0002", warehouse: "WH-02", qty: "1500" },
+      { item: "FG-0001", warehouse: "WH-03", qty: "3000" },
+      { item: "FG-0002", warehouse: "WH-03", qty: "1500" },
+      { item: "SM-0001", warehouse: "WH-01", qty: "3000" },
+      { item: "SM-0002", warehouse: "WH-01", qty: "800" },
+      { item: "CS-0001", warehouse: "WH-01", qty: "20" },
+      { item: "CS-0002", warehouse: "WH-01", qty: "40" },
+    ],
+  },
+  {
+    daysAgo: 5,
+    moveType: "XFER",
+    note: "생산 불출",
+    lines: [
+      { item: "RM-0001", lot: "MW-A1021", warehouse: "WH-01", toWarehouse: "WH-02", qty: "25" },
+      { item: "RM-0002", lot: "GL-S8-5501", warehouse: "WH-01", toWarehouse: "WH-02", qty: "10000" },
+      { item: "RM-0003", lot: "NW-25-0701", warehouse: "WH-01", toWarehouse: "WH-02", qty: "2000" },
+      { item: "RM-0004", lot: "SR-K3108", warehouse: "WH-01", toWarehouse: "WH-02", qty: "25" },
+      { item: "RM-0005", lot: "DA-AG-1150", warehouse: "WH-01", toWarehouse: "WH-02", qty: "250" },
+      { item: "SM-0001", warehouse: "WH-01", toWarehouse: "WH-02", qty: "1000" },
+      { item: "CS-0001", warehouse: "WH-01", toWarehouse: "WH-02", qty: "4" },
+      { item: "CS-0002", warehouse: "WH-01", toWarehouse: "WH-02", qty: "10" },
+    ],
+  },
+  {
+    daysAgo: 4,
+    moveType: "IN",
+    lines: [{ item: "RM-0003", lot: "NW-25-0702", warehouse: "WH-01", qty: "2000" }],
+  },
+  {
+    daysAgo: 3,
+    moveType: "OUT",
+    note: "소모",
+    lines: [
+      { item: "CS-0001", warehouse: "WH-02", qty: "2" },
+      { item: "CS-0002", warehouse: "WH-02", qty: "4" },
+    ],
+  },
+  {
+    daysAgo: 3,
+    moveType: "OUT",
+    note: "견본 출고",
+    lines: [{ item: "FG-0001", lot: "@FG-0001", warehouse: "WH-03", qty: "500" }],
+  },
+  {
+    daysAgo: 2,
+    moveType: "ADJ",
+    reason: "DAMAGE",
+    lines: [{ item: "RM-0002", lot: "GL-S8-5501", warehouse: "WH-02", qty: "-50" }],
+  },
+  { daysAgo: 2, moveType: "ADJ", reason: "FOUND", lines: [{ item: "SM-0002", warehouse: "WH-01", qty: "20" }] },
+  {
+    daysAgo: 2,
+    moveType: "XFER",
+    note: "격리",
+    lines: [{ item: "SF-0002", lot: "@SF-0002", warehouse: "WH-02", toWarehouse: "WH-04", qty: "30" }],
+  },
+  { daysAgo: 1, moveType: "IN", lines: [{ item: "CS-0002", warehouse: "WH-01", qty: "20" }], cancel: true },
+];
+
+/**
+ * 샘플 재고 실사(조각 「재고 수불」 PR E — 저자 판정, 설계 「2026-11-09 — PR E 를 열기 전에 정한 것」). 날짜는 되돌린 날 D 에서 센다.
+ * 샘플 수불 뒤에 그 창고의 장부를 불러 넣는다. counted 는 품목 코드(LOT 가 둘 이상이면 「품목|LOT」)마다의 실물 수량이고, 나머지 줄은
+ * rest 가 「book」이면 장부 그대로, 「blank」이면 비운다. confirm 이면 같은 날 확정한다.
+ */
+export type SampleCount = {
+  daysAgo: number;
+  warehouse: string;
+  counted: Record<string, string>;
+  rest: "book" | "blank";
+  confirm?: true;
+};
+
+export const SAMPLE_COUNTS: SampleCount[] = [
+  // 생산현장 — 금 와이어만 5 M 모자라 「실사 차이」 −5 M 의 조정 전표 한 장(IV-<D-1>-003)이 생긴다.
+  { daysAgo: 1, warehouse: "WH-02", counted: { "RM-0003|NW-25-0701": "1995" }, rest: "book", confirm: true },
+  // 제품창고 — 작성 중. 전원 관리 IC 는 넣었고 센서 IC 는 비워 두어, 확정하려면 마저 넣어야 한다.
+  { daysAgo: 1, warehouse: "WH-03", counted: { "FG-0001": "2500" }, rest: "blank" },
 ];
diff --git a/src/db/schema.ts b/src/db/schema.ts
index 210db0b..91af6f4 100644
--- a/src/db/schema.ts
+++ b/src/db/schema.ts
@@ -1,7 +1,21 @@
 import { sql } from "drizzle-orm";
-import { boolean, check, foreignKey, integer, numeric, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
+import {
+  boolean,
+  check,
+  date,
+  foreignKey,
+  index,
+  integer,
+  numeric,
+  pgTable,
+  smallint,
+  text,
+  timestamp,
+  unique,
+  uniqueIndex,
+} from "drizzle-orm/pg-core";
 
-// 조각 「기준정보」의 테이블 다섯(docs/schema.md · 설계도의 「이 조각의 테이블」).
+// 조각 「기준정보」의 테이블 다섯과 조각 「재고 수불」의 테이블(docs/schema.md · 설계도의 「이 조각의 테이블」).
 // 코드의 꼴은 앵커볼트(ADR 0003 · 0009)라 DB 의 제약으로도 막는다 — 화면 · 서버를 건너뛴 값도 들어오지 않는다.
 // 이 파일을 바꾸면 `npx drizzle-kit generate` 로 drizzle/ 의 마이그레이션을 만들어 함께 올린다.
 
@@ -54,6 +68,117 @@ export const codes = pgTable(
   ],
 );
 
+/**
+ * 단위 사양(조각 「재고 수불」 PR A, ADR 0017) — 공통코드 UNIT 의 값마다 기준 단위 · 배수 · 소수 자릿수.
+ * 같은 기준의 단위 사이는 배수로 바꿔 넣는다(1 KG = 1000 G). 기준 단위는 그 자신이 기준인 단위(배수 1)여야 한다 —
+ * (기준 단위, 기준 단위)가 이 표의 (단위, 기준 단위)를 가리키게 해 DB 가 막는다. 기준 · 배수는 등록 뒤 바꾸지 않는다(서버가 막는다).
+ */
+export const unitSpecs = pgTable(
+  "unit_specs",
+  {
+    id: id(),
+    unitGroup: text("unit_group").notNull().default("UNIT"),
+    unit: text("unit").notNull(),
+    baseUnit: text("base_unit").notNull(),
+    factor: numeric("factor", { precision: 18, scale: 6, mode: "number" }).notNull(),
+    decimals: smallint("decimals").notNull(),
+    ...timestamps(),
+  },
+  (t) => [
+    unique("unit_specs_unit_unique").on(t.unit),
+    unique("unit_specs_unit_base_unique").on(t.unit, t.baseUnit),
+    foreignKey({
+      name: "unit_specs_unit_fk",
+      columns: [t.unitGroup, t.unit],
+      foreignColumns: [codes.groupCode, codes.code],
+    }),
+    foreignKey({
+      name: "unit_specs_base_fk",
+      columns: [t.baseUnit, t.baseUnit],
+      foreignColumns: [t.unit, t.baseUnit],
+    }),
+    check("unit_specs_unit_group_fixed", sql`${t.unitGroup} = 'UNIT'`),
+    check("unit_specs_factor_positive", sql`${t.factor} > 0`),
+    check("unit_specs_base_factor_one", sql`${t.unit} <> ${t.baseUnit} or ${t.factor} = 1`),
+    check("unit_specs_decimals_range", sql`${t.decimals} between 0 and 3`),
+  ],
+);
+
+/**
+ * 창고. 위치(랙 · 선반)는 두지 않는다(ADR 0003).
+ * 불량창고(`is_defect`, 조각 「재고 수불」 PR B · ADR 0015) — 그 창고의 재고는 불량이라 가용에 들지 않고, 품목의 기본 창고로 고르지 못한다.
+ */
+export const warehouses = pgTable(
+  "warehouses",
+  {
+    id: id(),
+    code: text("code").notNull().unique(),
+    name: text("name").notNull(),
+    isDefect: boolean("is_defect").notNull().default(false),
+    active: boolean("active").notNull().default(true),
+    ...timestamps(),
+  },
+  (t) => [
+    // 품목의 기본 창고가 (번호, 불량창고 아님)을 가리키는 열쇠 — 불량창고를 기본 창고로 두는 것을 DB 가 막는다(ADR 0015).
+    unique("warehouses_id_defect_unique").on(t.id, t.isDefect),
+    check("warehouses_code_format", sql`${t.code} ~ '^WH-[0-9]{2,}$'`),
+    check("warehouses_name_length", sql`char_length(${t.name}) between 1 and 50`),
+  ],
+);
+
+/**
+ * LOT 번호 규칙(조각 「재고 수불」 PR B, ADR 0016) — 머리 · 구분자 · 날짜 꼴 · 일련 자릿수. 번호는 늘 머리 → 날짜 → 일련이고,
+ * 있는 조각 사이에 구분자를 넣는다(src/lib/number-rule.ts). 만드는 품목(반제품 · 완제품)에만 쓴다.
+ * 유형마다 기본 규칙이 하나다(`default_for`) — 기본 규칙은 「사용 안 함」이 아니다. 규칙은 지우지 않는다.
+ */
+export const numberRules = pgTable(
+  "number_rules",
+  {
+    id: id(),
+    code: text("code").notNull().unique(),
+    name: text("name").notNull(),
+    prefix: text("prefix").notNull().default(""),
+    separator: text("separator").notNull().default(""),
+    dateFormat: text("date_format").notNull().default(""),
+    seqDigits: smallint("seq_digits").notNull(),
+    defaultFor: text("default_for").unique(),
+    active: boolean("active").notNull().default(true),
+    ...timestamps(),
+  },
+  (t) => [
+    check("number_rules_code_format", sql`${t.code} ~ '^[A-Z][A-Z0-9_]{1,19}$'`),
+    check("number_rules_name_length", sql`char_length(${t.name}) between 1 and 50`),
+    check("number_rules_prefix_format", sql`${t.prefix} ~ '^[A-Z0-9]{0,6}$'`),
+    check("number_rules_separator_values", sql`${t.separator} in ('', '-', '_', '.')`),
+    check("number_rules_date_format_values", sql`${t.dateFormat} in ('', 'YYMMDD', 'YYYYMMDD', 'YYMM')`),
+    check("number_rules_seq_digits_range", sql`${t.seqDigits} between 2 and 6`),
+    check("number_rules_default_for_values", sql`${t.defaultFor} in ('SF', 'FG')`),
+    check("number_rules_default_active", sql`${t.defaultFor} is null or ${t.active}`),
+  ],
+);
+
+/**
+ * 번호 규칙의 일련 — 규칙 · 기간마다 마지막으로 낸 일련. 기간은 날짜 꼴로 쓴 날짜(`261105` · `20261105` · `2611`, 날짜 꼴이 없으면 빈 글자)라
+ * 날짜 꼴의 단위로 다시 센다. LOT 번호를 저절로 붙일 때만 행이 생긴다 — 사람이 넣는 입구가 없다.
+ */
+export const numberRuleSeqs = pgTable(
+  "number_rule_seqs",
+  {
+    id: id(),
+    ruleCode: text("rule_code")
+      .notNull()
+      .references(() => numberRules.code),
+    period: text("period").notNull().default(""),
+    lastSeq: integer("last_seq").notNull(),
+    ...timestamps(),
+  },
+  (t) => [
+    unique("number_rule_seqs_rule_period_unique").on(t.ruleCode, t.period),
+    check("number_rule_seqs_period_format", sql`${t.period} ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})?$'`),
+    check("number_rule_seqs_last_seq_positive", sql`${t.lastSeq} >= 1`),
+  ],
+);
+
 /**
  * 품목. 유형 · 조달구분 · 단위는 공통코드의 값만 받는다 — 묶음 칸(`*_group`)은 늘 같은 값이고, 묶음 + 코드로 공통코드를 가리킨다.
  * 코드는 유형 머리 + 네 자리 이상의 일련번호이고, 머리는 유형과 같다.
@@ -85,10 +210,36 @@ export const items = pgTable(
     cls3Group: text("cls3_group").notNull().default("ITEM_CLS3"),
     cls3: text("cls3"),
     note: text("note").notNull().default(""),
+    // 재고 수불(PR B, ADR 0015 · 0016) — LOT 관리 여부, LOT 번호 규칙(반제품 · 완제품만, 비우면 유형의 기본 규칙),
+    // 기본 입고 · 출고 창고(비우면 없음, 수불 등록이 창고 칸을 미리 채운다).
+    lotManaged: boolean("lot_managed").notNull().default(true),
+    lotRuleCode: text("lot_rule_code"),
+    defaultInWarehouseId: integer("default_in_warehouse_id"),
+    defaultOutWarehouseId: integer("default_out_warehouse_id"),
+    // 늘 false — 기본 창고의 참조가 (창고 번호, 이 칸)으로 창고의 (번호, 불량창고)를 가리킨다. 불량창고는 가리킬 수 없고,
+    // 기본 창고인 창고를 불량창고로 바꾸는 쓰기도 DB 가 거절한다 — 동시에 저장해도 깨지지 않는다(리뷰 1회차).
+    defaultWarehouseDefect: boolean("default_warehouse_defect").notNull().default(false),
     active: boolean("active").notNull().default(true),
     ...timestamps(),
   },
   (t) => [
+    foreignKey({
+      name: "items_lot_rule_fk",
+      columns: [t.lotRuleCode],
+      foreignColumns: [numberRules.code],
+    }),
+    foreignKey({
+      name: "items_default_in_warehouse_fk",
+      columns: [t.defaultInWarehouseId, t.defaultWarehouseDefect],
+      foreignColumns: [warehouses.id, warehouses.isDefect],
+    }),
+    foreignKey({
+      name: "items_default_out_warehouse_fk",
+      columns: [t.defaultOutWarehouseId, t.defaultWarehouseDefect],
+      foreignColumns: [warehouses.id, warehouses.isDefect],
+    }),
+    check("items_default_warehouse_defect_fixed", sql`${t.defaultWarehouseDefect} = false`),
+    check("items_lot_rule_made_only", sql`${t.lotRuleCode} is null or ${t.itemType} in ('SF', 'FG')`),
     foreignKey({
       name: "items_item_type_fk",
       columns: [t.itemTypeGroup, t.itemType],
@@ -125,7 +276,7 @@ export const items = pgTable(
     check("items_cls1_group_fixed", sql`${t.cls1Group} = 'ITEM_CLS1'`),
     check("items_cls2_group_fixed", sql`${t.cls2Group} = 'ITEM_CLS2'`),
     check("items_cls3_group_fixed", sql`${t.cls3Group} = 'ITEM_CLS3'`),
-    check("items_code_format", sql`${t.code} ~ '^(RM|SF|FG)-[0-9]{4,}$' and left(${t.code}, 2) = ${t.itemType}`),
+    check("items_code_format", sql`${t.code} ~ '^(RM|SF|FG|SM|CS)-[0-9]{4,}$' and left(${t.code}, 2) = ${t.itemType}`),
     check("items_name_length", sql`char_length(${t.name}) between 1 and 100`),
     check("items_spec_length", sql`char_length(${t.spec}) <= 100`),
     check("items_lead_time_range", sql`${t.leadTimeDays} between 0 and 365`),
@@ -134,22 +285,6 @@ export const items = pgTable(
   ],
 );
 
-/** 창고. 위치(랙 · 선반)는 두지 않는다(ADR 0003). */
-export const warehouses = pgTable(
-  "warehouses",
-  {
-    id: id(),
-    code: text("code").notNull().unique(),
-    name: text("name").notNull(),
-    active: boolean("active").notNull().default(true),
-    ...timestamps(),
-  },
-  (t) => [
-    check("warehouses_code_format", sql`${t.code} ~ '^WH-[0-9]{2,}$'`),
-    check("warehouses_name_length", sql`char_length(${t.name}) between 1 and 50`),
-  ],
-);
-
 /**
  * 거래처. 한 거래처에 매입처 · 매출처 표시 — 하나 이상(ADR 0003).
  * 국가는 공통코드 COUNTRY 의 값이다(ADR 0011). 한국(KR)이면 사업자등록번호(000-00-00000)를, 아니면 해외 사업자번호(글자 그대로)를 둔다 —
@@ -221,3 +356,214 @@ export const partners = pgTable(
     ),
   ],
 );
+
+// ── 재고 수불(조각 「재고 수불」 PR C, ADR 0015 · 0016 · 0018) ─────────────────────────
+
+/** 재고 수량 — 품목의 단위로 소수 셋째 자리까지(ADR 0018). 자릿수는 단위가 정하고(ADR 0017) 서버가 본다. */
+const stockQty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });
+
+/**
+ * 수불 전표 — 수불 등록 한 번(여러 줄). 번호는 `IV-YYYYMMDD-NNN`(수불 일자 · 그날의 일련, ADR 0016).
+ * 유형은 공통코드 MOVE_TYPE, 사유는 조정(ADJ)일 때만 ADJ_REASON. 고치거나 지우는 길이 없다 — 취소는 새 전표다.
+ * 취소 전표(`cancels_move_id`)는 원래 전표를 가리키고, 한 전표는 한 번만 취소된다(유일). 취소 전표는 취소되지 않는다 —
+ * 참조가 (원래 전표, 늘 false)로 (번호, 취소 전표인가)를 가리켜 DB 가 막는다(기본 창고의 참조와 같은 꼴).
+ */
+export const stockMoves = pgTable(
+  "stock_moves",
+  {
+    id: id(),
+    code: text("code").notNull().unique(),
+    moveDate: date("move_date", { mode: "string" }).notNull(),
+    moveTypeGroup: text("move_type_group").notNull().default("MOVE_TYPE"),
+    moveType: text("move_type").notNull(),
+    reasonGroup: text("reason_group").notNull().default("ADJ_REASON"),
+    reason: text("reason"),
+    note: text("note").notNull().default(""),
+    cancelsMoveId: integer("cancels_move_id").unique(),
+    // 이 전표가 취소 전표인가 — `cancels_move_id` 에서 저절로. 취소 전표를 가리키는 취소를 막는 열쇠다.
+    isCancel: boolean("is_cancel")
+      .notNull()
+      .generatedAlwaysAs(sql`cancels_move_id is not null`),
+    // 늘 false — 취소가 가리키는 전표는 취소 전표가 아니다.
+    cancelsCancel: boolean("cancels_cancel").notNull().default(false),
+    ...timestamps(),
+  },
+  (t) => [
+    unique("stock_moves_id_cancel_unique").on(t.id, t.isCancel),
+    foreignKey({
+      name: "stock_moves_cancels_fk",
+      columns: [t.cancelsMoveId, t.cancelsCancel],
+      foreignColumns: [t.id, t.isCancel],
+    }),
+    foreignKey({
+      name: "stock_moves_move_type_fk",
+      columns: [t.moveTypeGroup, t.moveType],
+      foreignColumns: [codes.groupCode, codes.code],
+    }),
+    foreignKey({
+      name: "stock_moves_reason_fk",
+      columns: [t.reasonGroup, t.reason],
+      foreignColumns: [codes.groupCode, codes.code],
+    }),
+    check("stock_moves_code_format", sql`${t.code} ~ '^IV-[0-9]{8}-[0-9]{3,}$'`),
+    check("stock_moves_code_date", sql`substring(${t.code} from 4 for 8) = to_char(${t.moveDate}, 'YYYYMMDD')`),
+    check("stock_moves_move_type_group_fixed", sql`${t.moveTypeGroup} = 'MOVE_TYPE'`),
+    check("stock_moves_reason_group_fixed", sql`${t.reasonGroup} = 'ADJ_REASON'`),
+    check("stock_moves_reason_adjust_only", sql`(${t.moveType} = 'ADJ') = (${t.reason} is not null)`),
+    check("stock_moves_note_length", sql`char_length(${t.note}) <= 200`),
+    check("stock_moves_cancels_cancel_fixed", sql`${t.cancelsCancel} = false`),
+    check("stock_moves_cancel_not_self", sql`${t.cancelsMoveId} is null or ${t.cancelsMoveId} <> ${t.id}`),
+  ],
+);
+
+/**
+ * 수불 줄 — 품목 하나가 보내는 창고에서 나가고(`from`) 받는 창고로 든다(`to`). 입고는 받는 창고만, 출고는 보내는 창고만, 이동은 둘 다,
+ * 조정은 늘리면 받는 창고 · 줄이면 보내는 창고다. 수량은 늘 0 보다 크다 — 취소는 보내는 · 받는 창고를 바꾼 줄이다.
+ * 잔액(품목 · 창고 · LOT · 상태) = 그 키로 든 수량 − 나간 수량(ADR 0018). 일자는 전표의 일자를 옮겨 둔다 — 지난 날짜 음수 검사가
+ * (일자, 줄 번호) 차례로 누계를 세운다(설계 「2026-11-09 — PR C 를 열기 전에 정한 것」).
+ * LOT 를 끈 품목의 LOT 는 빈 글자다. 넣은 단위가 품목 단위와 다르면 넣은 수량 · 단위를 함께 남긴다(성공 기준 8).
+ */
+export const stockMoveLines = pgTable(
+  "stock_move_lines",
+  {
+    id: id(),
+    moveId: integer("move_id")
+      .notNull()
+      .references(() => stockMoves.id),
+    lineNo: smallint("line_no").notNull(),
+    moveDate: date("move_date", { mode: "string" }).notNull(),
+    itemId: integer("item_id")
+      .notNull()
+      .references(() => items.id),
+    lot: text("lot").notNull().default(""),
+    status: text("status").notNull().default("AVAILABLE"),
+    fromWarehouseId: integer("from_warehouse_id").references(() => warehouses.id),
+    toWarehouseId: integer("to_warehouse_id").references(() => warehouses.id),
+    qty: stockQty("qty").notNull(),
+    enteredQty: stockQty("entered_qty").notNull(),
+    enteredUnitGroup: text("entered_unit_group").notNull().default("UNIT"),
+    enteredUnit: text("entered_unit").notNull(),
+    ...timestamps(),
+  },
+  (t) => [
+    unique("stock_move_lines_move_line_unique").on(t.moveId, t.lineNo),
+    foreignKey({
+      name: "stock_move_lines_entered_unit_fk",
+      columns: [t.enteredUnitGroup, t.enteredUnit],
+      foreignColumns: [codes.groupCode, codes.code],
+    }),
+    index("stock_move_lines_to_key_idx").on(t.itemId, t.toWarehouseId, t.lot, t.status, t.moveDate, t.id),
+    index("stock_move_lines_from_key_idx").on(t.itemId, t.fromWarehouseId, t.lot, t.status, t.moveDate, t.id),
+    check("stock_move_lines_line_no_range", sql`${t.lineNo} between 1 and 100`),
+    check("stock_move_lines_lot_format", sql`${t.lot} ~ '^[A-Za-z0-9._-]{0,30}$'`),
+    check("stock_move_lines_status_values", sql`${t.status} in ('AVAILABLE', 'QC')`),
+    check(
+      "stock_move_lines_warehouse_required",
+      sql`${t.fromWarehouseId} is not null or ${t.toWarehouseId} is not null`,
+    ),
+    check("stock_move_lines_warehouses_differ", sql`${t.fromWarehouseId} is distinct from ${t.toWarehouseId}`),
+    check("stock_move_lines_qty_positive", sql`${t.qty} > 0 and ${t.enteredQty} > 0`),
+    check("stock_move_lines_entered_unit_group_fixed", sql`${t.enteredUnitGroup} = 'UNIT'`),
+  ],
+);
+
+/**
+ * 잔액 — 품목 · 창고 · LOT · 상태마다 지금 수량(ADR 0018). 수불 줄을 쓰는 같은 트랜잭션에서 고치고, 0 밑으로 가지 못한다.
+ * 불량은 창고(불량창고)가, 검사대기는 상태 칸이 정한다(ADR 0015). 재고 계산(src/db/stock.ts) 말고는 고치지 않는다.
+ */
+export const stockBalances = pgTable(
+  "stock_balances",
+  {
+    id: id(),
+    itemId: integer("item_id")
+      .notNull()
+      .references(() => items.id),
+    warehouseId: integer("warehouse_id")
+      .notNull()
+      .references(() => warehouses.id),
+    lot: text("lot").notNull().default(""),
+    status: text("status").notNull().default("AVAILABLE"),
+    qty: stockQty("qty").notNull().default(0),
+    ...timestamps(),
+  },
+  (t) => [
+    unique("stock_balances_key_unique").on(t.itemId, t.warehouseId, t.lot, t.status),
+    index("stock_balances_warehouse_idx").on(t.warehouseId),
+    check("stock_balances_qty_not_negative", sql`${t.qty} >= 0`),
+    check("stock_balances_lot_format", sql`${t.lot} ~ '^[A-Za-z0-9._-]{0,30}$'`),
+    check("stock_balances_status_values", sql`${t.status} in ('AVAILABLE', 'QC')`),
+  ],
+);
+
+// ── 재고 실사(조각 「재고 수불」 PR E, ADR 0015 · 0021) ─────────────────────────
+
+/**
+ * 재고 실사 — 창고 하나의 실물 수량을 세어 장부와 맞춘다. 번호는 `PI-YYYYMMDD-NNN`(처음 저장한 날 · 그날의 일련, ADR 0016).
+ * 상태는 작성 중(DRAFT) · 확정(CONFIRMED) · 취소(CANCELED). 창고 하나에 작성 중인 실사는 하나다(부분 유일 인덱스).
+ * `baseline_line_id` 는 장부를 불러올 때의 마지막 수불 줄 번호 — 확정 화면이 그 뒤 그 창고에 닿은 수불을 경고한다(설계 「PR E 를 열기 전에 정한 것」).
+ * 확정하면 확정한 날과, 차이가 있었으면 그 조정 전표(사유 「실사 차이」)를 가리킨다. 확정 · 취소한 실사는 고치지 않는다.
+ */
+export const stockCounts = pgTable(
+  "stock_counts",
+  {
+    id: id(),
+    code: text("code").notNull().unique(),
+    countDate: date("count_date", { mode: "string" }).notNull(),
+    warehouseId: integer("warehouse_id")
+      .notNull()
+      .references(() => warehouses.id),
+    status: text("status").notNull().default("DRAFT"),
+    baselineLineId: integer("baseline_line_id").notNull().default(0),
+    confirmedDate: date("confirmed_date", { mode: "string" }),
+    adjustMoveId: integer("adjust_move_id")
+      .unique()
+      .references(() => stockMoves.id),
+    ...timestamps(),
+  },
+  (t) => [
+    uniqueIndex("stock_counts_one_draft_per_warehouse")
+      .on(t.warehouseId)
+      .where(sql`${t.status} = 'DRAFT'`),
+    check("stock_counts_code_format", sql`${t.code} ~ '^PI-[0-9]{8}-[0-9]{3,}$'`),
+    check("stock_counts_code_date", sql`substring(${t.code} from 4 for 8) = to_char(${t.countDate}, 'YYYYMMDD')`),
+    check("stock_counts_status_values", sql`${t.status} in ('DRAFT', 'CONFIRMED', 'CANCELED')`),
+    check("stock_counts_confirmed_date", sql`(${t.status} = 'CONFIRMED') = (${t.confirmedDate} is not null)`),
+    check("stock_counts_adjust_confirmed_only", sql`${t.adjustMoveId} is null or ${t.status} = 'CONFIRMED'`),
+    check("stock_counts_baseline_not_negative", sql`${t.baselineLineId} >= 0`),
+  ],
+);
+
+/**
+ * 실사 줄 — 품목 · LOT · 상태마다 실물 수량(품목 단위). 비운 실물 수량(null)은 작성 중에만 있다 — 확정은 모든 줄이 차야 한다.
+ * `added` 는 장부에 없어 더한 줄(늘 가용). `book_qty` 는 확정하는 순간의 장부 — 실사 보기가 그때의 장부 · 실물 · 차이를 그대로 보인다.
+ * 한 실사는 100줄까지다 — 차이가 조정 전표 한 장(100줄)에 다 들어간다(저자 판정).
+ */
+export const stockCountLines = pgTable(
+  "stock_count_lines",
+  {
+    id: id(),
+    countId: integer("count_id")
+      .notNull()
+      .references(() => stockCounts.id),
+    lineNo: smallint("line_no").notNull(),
+    itemId: integer("item_id")
+      .notNull()
+      .references(() => items.id),
+    lot: text("lot").notNull().default(""),
+    status: text("status").notNull().default("AVAILABLE"),
+    added: boolean("added").notNull().default(false),
+    countedQty: stockQty("counted_qty"),
+    bookQty: stockQty("book_qty"),
+    ...timestamps(),
+  },
+  (t) => [
+    unique("stock_count_lines_line_unique").on(t.countId, t.lineNo),
+    unique("stock_count_lines_key_unique").on(t.countId, t.itemId, t.lot, t.status),
+    check("stock_count_lines_line_no_range", sql`${t.lineNo} between 1 and 100`),
+    check("stock_count_lines_lot_format", sql`${t.lot} ~ '^[A-Za-z0-9._-]{0,30}$'`),
+    check("stock_count_lines_status_values", sql`${t.status} in ('AVAILABLE', 'QC')`),
+    check("stock_count_lines_added_available", sql`not ${t.added} or ${t.status} = 'AVAILABLE'`),
+    check("stock_count_lines_counted_not_negative", sql`${t.countedQty} is null or ${t.countedQty} >= 0`),
+    check("stock_count_lines_book_not_negative", sql`${t.bookQty} is null or ${t.bookQty} >= 0`),
+  ],
+);
diff --git a/src/db/warehouses.ts b/src/db/warehouses.ts
index 196b3e7..dfca85f 100644
--- a/src/db/warehouses.ts
+++ b/src/db/warehouses.ts
@@ -23,11 +23,13 @@ import {
   type Params,
 } from "./master-shared";
 import { nextCode } from "./numbering";
+import { itemsDefaultingTo } from "./items";
 import { warehouses } from "./schema";
+import { lockStock, warehouseHasStock } from "./stock";
 import type { Db } from "./types";
 
 // 창고의 목록 · 등록 · 수정(조각 「기준정보」 PR D). 화면(src/app/inventory/warehouses/)은 이 함수만 부른다.
-// 입력 검사는 src/lib/warehouse-input.ts, 등록 상한 · 코드 번호는 여기서 본다.
+// 입력 검사는 src/lib/warehouse-input.ts, 등록 상한 · 코드 번호 · 불량창고 표시를 바꿀 수 있는지는 여기서 본다.
 
 /** 창고의 등록 상한(설계 「PR B 를 열기 전에 정한 것」) — 두 자리 번호의 끝까지. 매일 밤 되돌림이 샘플 수로 줄인다. */
 export const WAREHOUSE_LIMIT = 99;
@@ -90,7 +92,19 @@ export type WarehouseSaveResult =
 const CONSTRAINT_FIELD: Record<string, WarehouseField> = { warehouses_name_length: "name" };
 
 /** 제약 위반이면 칸의 거절로 바꾸고, 아니면 그대로 던진다(부르는 쪽이 코드만 남기고 알린다). */
+// 품목의 기본 창고 참조가 (번호, 불량창고 아님)을 가리켜, 기본 창고인 창고를 불량창고로 바꾸는 쓰기를 DB 가 거절한다 —
+// 서버가 센 뒤 그 사이 누가 그 창고를 기본 창고로 고른 때다(리뷰 1회차).
+const DEFAULT_REFERENCE = new Set(["items_default_in_warehouse_fk", "items_default_out_warehouse_fk"]);
+
 function asRejection(error: unknown, values: WarehouseValues): WarehouseSaveResult {
+  if (DEFAULT_REFERENCE.has(constraintOf(error) ?? ""))
+    return {
+      ok: false,
+      errors: {
+        isDefect: "품목의 기본 입고 · 출고 창고라 불량창고로 바꿀 수 없습니다 — 그 품목의 기본 창고를 먼저 바꾸세요",
+      },
+      values,
+    };
   const field = CONSTRAINT_FIELD[constraintOf(error) ?? ""];
   if (field) return { ok: false, errors: { [field]: "받을 수 없는 값입니다" }, values };
   throw error;
@@ -121,8 +135,15 @@ export async function createWarehouse(db: Db, values: WarehouseValues): Promise<
   }
 }
 
+const HAS_STOCK = "재고가 있는 창고라 불량창고 표시를 바꿀 수 없습니다 — 재고를 다른 창고로 옮긴 뒤 바꾸세요";
+const DEFAULT_OF_ITEMS = (n: number) =>
+  `품목 ${n}개의 기본 입고 · 출고 창고라 불량창고로 바꿀 수 없습니다 — 그 품목의 기본 창고를 먼저 바꾸세요`;
+
 /**
- * 수정 — 코드는 바꾸지 않는다. 창고명 · 사용 여부만.
+ * 수정 — 코드는 바꾸지 않는다. 창고명 · 불량창고 표시 · 사용 여부.
+ * 품목의 기본 창고인 창고는 불량창고로 바꾸지 못한다 — 기본 창고는 불량창고가 아니다(ADR 0015). 서버가 세어 알리고,
+ * 센 뒤 그 사이 누가 그 창고를 고른 때는 DB 의 참조가 막는다(리뷰 1회차).
+ * 재고(잔액)가 있는 창고는 불량창고 표시를 바꾸지 못한다 — 그 재고의 상태가 바뀌므로(설계 ③, 조각 「재고 수불」 PR C).
  * version 은 화면을 연 때의 버전이다 — 그 사이 다른 사람이 고쳤으면 저장하지 않는다(저자 판정 2026-11-05 — 품목 · 거래처와 같다).
  * 주지 않으면 버전을 보지 않는다(서버 안의 시험용 — 화면의 입구는 늘 준다).
  */
@@ -136,19 +157,30 @@ export async function updateWarehouse(
   if (!current) return { ok: false, notFound: true };
   const parsed = parseWarehouseUpdate(values);
   if (!parsed.ok) return { ok: false, errors: parsed.errors, values };
+  if (parsed.value.isDefect && !current.isDefect) {
+    const n = await itemsDefaultingTo(db, current.id);
+    if (n > 0) return { ok: false, errors: { isDefect: DEFAULT_OF_ITEMS(n) }, values };
+  }
   if (version !== undefined && !VERSION.test(version)) return { ok: false, errors: {}, formError: STALE, values };
   try {
-    const done = await db
-      .update(warehouses)
-      .set({ ...parsed.value, updatedAt: touched() })
-      .where(
-        version === undefined
-          ? eq(warehouses.id, current.id)
-          : and(eq(warehouses.id, current.id), versionIs(warehouses.updatedAt, version)),
-      )
-      .returning({ id: warehouses.id });
-    if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
-    return { ok: true, code };
+    return await db.transaction(async (tx): Promise<WarehouseSaveResult> => {
+      // 재고가 있는 창고는 불량창고 표시를 바꾸지 못한다 — 그 재고의 상태가 바뀌므로(설계 ③ 「창고의 새 칸」). 재고의 잠금을 쥐고 센다.
+      if (parsed.value.isDefect !== current.isDefect) {
+        await lockStock(tx);
+        if (await warehouseHasStock(tx, current.id)) return { ok: false, errors: { isDefect: HAS_STOCK }, values };
+      }
+      const done = await tx
+        .update(warehouses)
+        .set({ ...parsed.value, updatedAt: touched() })
+        .where(
+          version === undefined
+            ? eq(warehouses.id, current.id)
+            : and(eq(warehouses.id, current.id), versionIs(warehouses.updatedAt, version)),
+        )
+        .returning({ id: warehouses.id });
+      if (done.length === 0) return { ok: false, errors: {}, formError: STALE, values };
+      return { ok: true, code };
+    });
   } catch (error) {
     return asRejection(error, values);
   }
diff --git a/src/lib/areas.ts b/src/lib/areas.ts
index 5795124..664a1b5 100644
--- a/src/lib/areas.ts
+++ b/src/lib/areas.ts
@@ -2,6 +2,8 @@
 // 모듈의 순서와 메뉴는 마스터플랜 「모듈과 메뉴」를 따르고, 후보 메뉴는 넣지 않는다.
 // 지은 화면만 주소(href)를 갖는다 — 주소가 없는 메뉴는 「준비 중」으로 보인다.
 
+import { MOVE_MENUS } from "@/lib/move-menus";
+
 export type Menu = {
   label: string;
   /** 이 메뉴를 짓는 조각(마스터플랜의 조각 이름). */
@@ -86,10 +88,11 @@ export const AREAS: readonly Area[] = [
       {
         label: "수불관리",
         menus: [
-          { label: "수불 등록", slice: "재고 수불" },
-          { label: "재고 실사", slice: "재고 수불" },
-          { label: "수불 이력", slice: "재고 수불" },
-          { label: "수불부", slice: "재고 수불" },
+          // 등록은 수불구분마다 메뉴 하나다(ADR 0020) — 이름 · 주소는 src/lib/move-menus.ts 가 든다.
+          ...MOVE_MENUS.map((m) => ({ label: m.label, slice: "재고 수불", href: m.href })),
+          { label: "재고 실사", slice: "재고 수불", href: "/inventory/counts" },
+          { label: "수불 이력", slice: "재고 수불", href: "/inventory/history" },
+          { label: "수불부", slice: "재고 수불", href: "/inventory/ledger" },
         ],
       },
       {
@@ -194,11 +197,13 @@ export const AREAS: readonly Area[] = [
   {
     href: "/system",
     label: "시스템 관리",
-    summary: "공통코드, 회사 정보, 사용자 · 메뉴와 권한",
+    summary: "공통코드 · 번호 규칙, 회사 정보, 사용자 · 메뉴와 권한",
     groups: [
       {
         menus: [
           { label: "공통코드", slice: "기준정보", href: "/system/codes" },
+          // LOT 번호의 규칙만 든다(ADR 0016). 전표 · 발주 · 작업지시 번호를 얹을지는 그 조각의 착공에서 정한다.
+          { label: "번호 규칙", slice: "재고 수불", href: "/system/number-rules" },
           { label: "회사 정보", slice: "인사" },
           { label: "사용자", slice: "인사" },
           // 메뉴를 DB 의 표로 두어 권한이 가리킨다 — 처음 값은 이 목록을 옮긴다(마스터플랜 범위 변경 2026-11-05).
diff --git a/src/lib/code-fields.ts b/src/lib/code-fields.ts
index 83da682..e98969f 100644
--- a/src/lib/code-fields.ts
+++ b/src/lib/code-fields.ts
@@ -1,7 +1,8 @@
 // 공통코드 값(Minor) 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/code-input.ts)가 함께 쓴다.
 // 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.
 
-export const CODE_FIELDS = ["code", "name", "sortOrder", "active"] as const;
+// 뒤의 셋은 단위(UNIT) 묶음에만 있다 — 기준 단위 · 배수 · 소수 자릿수(ADR 0017). 다른 묶음은 보내지 않고, 보내도 읽지 않는다.
+export const CODE_FIELDS = ["code", "name", "sortOrder", "active", "baseUnit", "factor", "decimals"] as const;
 
 export type CodeField = (typeof CODE_FIELDS)[number];
 /** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
@@ -13,3 +14,9 @@ export type CodeErrors = Partial<Record<CodeField, string>>;
 export const GROUP_CODE = /^[A-Z][A-Z0-9_]{1,19}$/;
 /** 값(Minor) 코드의 꼴(ADR 0009). */
 export const MINOR_CODE = /^[A-Z0-9][A-Z0-9_]{0,19}$/;
+
+/** 단위 사양을 가진 묶음 — 공통코드 UNIT(ADR 0017). */
+export const UNIT_GROUP = "UNIT";
+
+/** 배수를 사람이 읽는 글로 — 1000 · 0.001. 끝의 0 은 떼어 낸다. */
+export const factorText = (n: number) => String(Number(n.toFixed(6)));
diff --git a/src/lib/item-fields.ts b/src/lib/item-fields.ts
index 0ebfd0e..b94ea2a 100644
--- a/src/lib/item-fields.ts
+++ b/src/lib/item-fields.ts
@@ -9,6 +9,11 @@ export const ITEM_FIELDS = [
   "unit",
   "inspectIn",
   "inspectOut",
+  // 재고(조각 「재고 수불」 PR B, ADR 0015 · 0016) — 창고는 코드(WH-01 꼴)로 주고받는다.
+  "lotManaged",
+  "lotRuleCode",
+  "defaultInWarehouse",
+  "defaultOutWarehouse",
   "leadTimeDays",
   "safetyStock",
   "minLot",
diff --git a/src/lib/item-input.ts b/src/lib/item-input.ts
index 78a8a36..447fe6b 100644
--- a/src/lib/item-input.ts
+++ b/src/lib/item-input.ts
@@ -2,10 +2,12 @@ import { z } from "zod";
 import { activeFlag, firstErrors as firstOf, formValues, text, toggle } from "./input-common";
 import { eul, eun } from "./josa";
 import { ITEM_FIELDS, NOTE_MAX, type ItemErrors, type ItemField, type ItemValues } from "./item-fields";
-import { ITEM_TYPES, PROC_TYPES } from "./master-codes";
+import { ITEM_TYPES, PROC_TYPES, type ItemType } from "./master-codes";
+import { RULE_CODE } from "./number-rule-fields";
 
 // 품목 등록 · 수정의 입력 검사(설계 ③). 서버가 한다 — 화면의 검사를 건너뛴 요청도 같은 규칙으로 거절한다.
-// 단위 · 분류가 공통코드에 있고 「사용 안 함」이 아닌지는 DB 를 봐야 해서 src/db/items.ts 가 이어서 본다.
+// 단위 · 분류 · LOT 번호 규칙 · 기본 창고가 있고 「사용 안 함」이 아닌지, 규칙이 만드는 품목의 것인지는 DB · 유형을 봐야 해서
+// src/db/items.ts 가 이어서 본다.
 
 export {
   ITEM_CLASSES,
@@ -24,6 +26,12 @@ export type ItemInput = {
   unit: string;
   inspectIn: boolean;
   inspectOut: boolean;
+  lotManaged: boolean;
+  /** LOT 번호 규칙 — 반제품 · 완제품만, 비우면 유형의 기본 규칙(ADR 0016). */
+  lotRuleCode: string | null;
+  /** 기본 입고 · 출고 창고의 코드 — 비우면 없음(ADR 0015). */
+  defaultInWarehouse: string | null;
+  defaultOutWarehouse: string | null;
   leadTimeDays: number;
   safetyStock: number;
   minLot: number;
@@ -33,7 +41,7 @@ export type ItemInput = {
   cls3: string | null;
   note: string;
 };
-export type NewItemInput = ItemInput & { itemType: "RM" | "SF" | "FG" };
+export type NewItemInput = ItemInput & { itemType: ItemType };
 export type ItemUpdateInput = ItemInput & { active: boolean };
 
 // 수량 — 품목의 단위로 0 이상, 소수 셋째 자리까지. 천 단위 쉼표는 지우고 읽는다.
@@ -71,6 +79,24 @@ const itemClass = (label: string) =>
     .regex(/^$|^[A-Z0-9][A-Z0-9_]{0,19}$/, { error: `${eul(label)} 목록에서 고르세요` })
     .transform((s) => s || null);
 
+// LOT 번호 규칙 — 비우면 유형의 기본 규칙(null). 고른 규칙이 있는지 · 만드는 품목인지는 DB 를 본다.
+const lotRule = z
+  .string()
+  .trim()
+  .check((ctx) => {
+    if (ctx.value !== "" && !RULE_CODE.test(ctx.value))
+      ctx.issues.push({ code: "custom", input: ctx.value, message: "LOT 번호 규칙을 목록에서 고르세요" });
+  })
+  .transform((s) => s || null);
+
+// 기본 창고 — 비우면 없음(null). 고른 창고가 있고 불량창고가 아닌지는 DB 를 본다.
+const warehouse = (label: string) =>
+  z
+    .string()
+    .trim()
+    .regex(/^$|^WH-[0-9]{2,}$/, { error: `${eul(label)} 목록에서 고르세요` })
+    .transform((s) => s || null);
+
 const codeOf = <T extends readonly { code: string }[]>(list: T) => list.map((t) => t.code) as [string, ...string[]];
 
 const common = {
@@ -80,6 +106,10 @@ const common = {
   unit: z.string().regex(/^[A-Z0-9][A-Z0-9_]{0,19}$/, { error: "단위를 고르세요" }),
   inspectIn: toggle,
   inspectOut: toggle,
+  lotManaged: toggle,
+  lotRuleCode: lotRule,
+  defaultInWarehouse: warehouse("기본 입고 창고"),
+  defaultOutWarehouse: warehouse("기본 출고 창고"),
   leadTimeDays: leadTime,
   safetyStock: quantity("안전재고"),
   minLot: quantity("최소 발주 · 생산량"),
@@ -116,9 +146,14 @@ function raw(values: ItemValues) {
     cls2: values.cls2 ?? "",
     cls3: values.cls3 ?? "",
     note: values.note ?? "",
+    // 재고 칸(PR B)도 비워도 된다 — 규칙은 유형의 기본, 창고는 없음.
+    lotRuleCode: values.lotRuleCode ?? "",
+    defaultInWarehouse: values.defaultInWarehouse ?? "",
+    defaultOutWarehouse: values.defaultOutWarehouse ?? "",
     // 끈 체크 상자는 칸이 오지 않는다.
     inspectIn: values.inspectIn ?? "off",
     inspectOut: values.inspectOut ?? "off",
+    lotManaged: values.lotManaged ?? "off",
   };
 }
 
diff --git a/src/lib/master-codes.ts b/src/lib/master-codes.ts
index 09601fe..f31d4d1 100644
--- a/src/lib/master-codes.ts
+++ b/src/lib/master-codes.ts
@@ -6,6 +6,9 @@ export const ITEM_TYPES = [
   { code: "RM", name: "원자재" },
   { code: "SF", name: "반제품" },
   { code: "FG", name: "완제품" },
+  // 조각 「재고 수불」 PR B(ADR 0019) — 사 오는 품목 가운데 LOT 없이 들어오는 것.
+  { code: "SM", name: "부자재" },
+  { code: "CS", name: "소모품" },
 ] as const;
 
 export const PROC_TYPES = [
@@ -13,33 +16,66 @@ export const PROC_TYPES = [
   { code: "MAKE", name: "생산" },
 ] as const;
 
+/**
+ * 수불 유형(조각 「재고 수불」 PR C, ADR 0016) — 재고 계산(src/db/stock.ts)이 기대는 시스템 코드. 구매입고 · 생산입고 · 자재투입 ·
+ * 제품출고 · 폐기는 그 화면을 짓는 조각이 더한다(ADR 0008).
+ */
+export const MOVE_TYPES = [
+  { code: "IN", name: "기타입고" },
+  { code: "OUT", name: "기타출고" },
+  { code: "XFER", name: "이동" },
+  { code: "ADJ", name: "조정" },
+] as const;
+
 export type ItemType = (typeof ITEM_TYPES)[number]["code"];
+export type MoveType = (typeof MOVE_TYPES)[number]["code"];
 export type ProcType = (typeof PROC_TYPES)[number]["code"];
 
 /** 시스템 코드 묶음 — 묶음 코드와 프로그램이 아는 값. */
 export const SYSTEM_CODE_GROUPS = {
   ITEM_TYPE: ITEM_TYPES,
   PROC_TYPE: PROC_TYPES,
+  MOVE_TYPE: MOVE_TYPES,
 } as const;
 
-/** 유형을 고르면 붙는 기본값(ADR 0003) — 원자재 → 구매 · 수입검사, 반제품 → 생산, 완제품 → 생산 · 출하검사. 등록 화면에서 바꿀 수 있다. */
-export const ITEM_TYPE_DEFAULTS: Record<ItemType, { procurement: ProcType; inspectIn: boolean; inspectOut: boolean }> =
-  {
-    RM: { procurement: "BUY", inspectIn: true, inspectOut: false },
-    SF: { procurement: "MAKE", inspectIn: false, inspectOut: false },
-    FG: { procurement: "MAKE", inspectIn: false, inspectOut: true },
-  };
+/**
+ * 유형을 고르면 붙는 기본값 — 원자재 → 구매 · 수입검사, 반제품 → 생산, 완제품 → 생산 · 출하검사(ADR 0003),
+ * 부자재 · 소모품 → 구매(ADR 0019). LOT 관리는 원자재 · 반제품 · 완제품만 켬(ADR 0015 · 0019). 등록 화면에서 바꿀 수 있다.
+ */
+export const ITEM_TYPE_DEFAULTS: Record<
+  ItemType,
+  { procurement: ProcType; inspectIn: boolean; inspectOut: boolean; lotManaged: boolean }
+> = {
+  RM: { procurement: "BUY", inspectIn: true, inspectOut: false, lotManaged: true },
+  SF: { procurement: "MAKE", inspectIn: false, inspectOut: false, lotManaged: true },
+  FG: { procurement: "MAKE", inspectIn: false, inspectOut: true, lotManaged: true },
+  SM: { procurement: "BUY", inspectIn: false, inspectOut: false, lotManaged: false },
+  CS: { procurement: "BUY", inspectIn: false, inspectOut: false, lotManaged: false },
+};
+
+/** 만드는 품목 — LOT 번호 규칙을 쓰고, 입고에서 LOT 를 비우면 저절로 붙는다(ADR 0016). 나머지는 사 오는 품목이다. */
+export const MADE_ITEM_TYPES = ["SF", "FG"] as const satisfies readonly ItemType[];
+export type MadeItemType = (typeof MADE_ITEM_TYPES)[number];
+export const isMadeType = (type: string): type is MadeItemType => (MADE_ITEM_TYPES as readonly string[]).includes(type);
 
 export const itemTypeName = (code: string) => ITEM_TYPES.find((t) => t.code === code)?.name ?? code;
 export const procTypeName = (code: string) => PROC_TYPES.find((t) => t.code === code)?.name ?? code;
+export const moveTypeName = (code: string) => MOVE_TYPES.find((t) => t.code === code)?.name ?? code;
+export const isMoveType = (code: string): code is MoveType => MOVE_TYPES.some((t) => t.code === code);
+
+/** 조정 사유 「실사 차이」 — 재고 실사의 확정이 쓰는 값이라 「사용 안 함」으로 바꾸지 못한다(ADR 0016). */
+export const COUNT_REASON = "COUNT";
 
 /** 한국 — 거래처의 사업자등록번호 꼴(000-00-00000) 검사가 기대는 국가 코드(ADR 0011). */
 export const KOREA = "KR";
 
 /**
  * 사용자 코드이지만 「사용 안 함」으로 바꾸지 못하는 값 — 프로그램이 기댄다.
- * 국가 KR(사업자등록번호 꼴 검사, ADR 0011 · 저자 인터뷰 2026-11-03).
+ * 국가 KR(사업자등록번호 꼴 검사, ADR 0011 · 저자 인터뷰 2026-11-03), 조정 사유 COUNT(실사 확정, ADR 0016).
  */
-export const ALWAYS_ACTIVE: Readonly<Record<string, readonly string[]>> = { COUNTRY: [KOREA] };
+export const ALWAYS_ACTIVE: Readonly<Record<string, readonly string[]>> = {
+  COUNTRY: [KOREA],
+  ADJ_REASON: [COUNT_REASON],
+};
 
 export const isAlwaysActive = (group: string, code: string) => ALWAYS_ACTIVE[group]?.includes(code) ?? false;
diff --git a/src/lib/sheet-columns.ts b/src/lib/sheet-columns.ts
index f512ab0..7ea7dd9 100644
--- a/src/lib/sheet-columns.ts
+++ b/src/lib/sheet-columns.ts
@@ -6,7 +6,7 @@ import type { SheetColumn } from "./sheet";
 // 시트형 등록의 칸 — 순서는 한 건 등록 화면과 같다(저자 판정 2026-11-03). 붙여넣기는 이 순서대로 칸을 채운다.
 // 고르는 값은 이름 · 코드 둘 다 받고, 검사 대상 · 매입처 · 매출처는 Y/N · O/X · 예/아니오를 받는다.
 // PR H 의 설명용 칸은 지금 칸의 뒤에 붙는다 — PR F 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다.
-// PR J 의 사용 여부도 맨 뒤에 붙는다. 코드는 칸이 아니다 — 불러온 줄의 숨은 칸이다(src/lib/sheet.ts 의 CODE_KEY).
+// PR J 의 사용 여부도 그때의 맨 뒤에, 재고 수불 PR B 의 재고 칸 넷은 그 뒤에 붙는다. 코드는 칸이 아니다 — 불러온 줄의 숨은 칸이다(src/lib/sheet.ts 의 CODE_KEY).
 
 type Option = { code: string; name: string };
 
@@ -15,7 +15,8 @@ const listOf = (options: readonly Option[]) => options.map((o) => `${o.name}(${o
 export const YES_NO = "Y · N (O · X, 예 · 아니오도 됩니다)";
 
 /**
- * 사용 여부(PR J) — 맨 뒤 칸이라 앞 PR 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다(저자 판정 2026-11-05 — 시트에서 바꾼다).
+ * 사용 여부(PR J) — PR J 때 맨 뒤에 붙어 앞 PR 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다(저자 판정 2026-11-05 — 시트에서 바꾼다).
+ * 뒤에 붙는 칸(품목의 재고 칸 넷)은 이 칸 뒤에 붙는다 — 같은 까닭.
  * 새 줄은 한 건 등록처럼 「사용」으로만 등록한다.
  */
 const ACTIVE_COLUMN: SheetColumn = {
@@ -26,9 +27,18 @@ const ACTIVE_COLUMN: SheetColumn = {
 };
 
 type ClassLists = Partial<Record<(typeof ITEM_CLASSES)[number]["field"], readonly Option[]>>;
+/** 재고 칸의 안내 — 사용 중인 LOT 번호 규칙과, 고를 수 있는 창고(사용 중 · 불량창고 아님). */
+type StockOptions = { rules?: readonly Option[]; warehouses?: readonly Option[] };
 
-/** 품목 시트의 칸 — 단위 · 분류의 안내는 공통코드 `UNIT` · `ITEM_CLS1 ~ 3` 의 사용 중인 값으로 만든다. */
-export function itemSheetColumns(units: readonly Option[], classes: ClassLists = {}): SheetColumn[] {
+/**
+ * 품목 시트의 칸 — 단위 · 분류의 안내는 공통코드 `UNIT` · `ITEM_CLS1 ~ 3` 의 사용 중인 값으로 만든다.
+ * 재고 칸 넷(조각 「재고 수불」 PR B)은 사용 여부 뒤에 붙는다 — 앞 PR 의 칸 순서로 만든 표를 붙여넣어도 앞 칸이 어긋나지 않는다.
+ */
+export function itemSheetColumns(
+  units: readonly Option[],
+  classes: ClassLists = {},
+  stock: StockOptions = {},
+): SheetColumn[] {
   return [
     {
       key: "itemType",
@@ -65,6 +75,24 @@ export function itemSheetColumns(units: readonly Option[], classes: ClassLists =
     }),
     { key: "note", label: "비고", rule: `${NOTE_MAX}자까지 — 비워도 됩니다`, width: 16 },
     ACTIVE_COLUMN,
+    { key: "lotManaged", label: "LOT 관리", rule: `${YES_NO} — 비우면 유형의 기본값`, width: 6 },
+    {
+      key: "lotRuleCode",
+      label: "LOT 번호 규칙",
+      rule: `${stock.rules?.length ? listOf(stock.rules) : "「시스템 관리 › 번호 규칙」의 규칙"} — 이름이나 코드, 반제품 · 완제품만. 비우면 유형의 기본 규칙`,
+      width: 10,
+    },
+    ...(
+      [
+        ["defaultInWarehouse", "기본 입고 창고"],
+        ["defaultOutWarehouse", "기본 출고 창고"],
+      ] as const
+    ).map(([key, label]) => ({
+      key,
+      label,
+      rule: `${stock.warehouses?.length ? listOf(stock.warehouses) : "창고"} — 이름이나 코드, 불량창고는 안 됩니다. 비워도 됩니다`,
+      width: 9,
+    })),
   ];
 }
 
diff --git a/src/lib/sheet-input.ts b/src/lib/sheet-input.ts
index 7f9e06f..f8cd176 100644
--- a/src/lib/sheet-input.ts
+++ b/src/lib/sheet-input.ts
@@ -1,5 +1,6 @@
 import { parseItemUpdate, parseNewItem, type ItemUpdateInput, type NewItemInput } from "./item-input";
 import { ITEM_CLASSES, type ItemClassField, type ItemValues } from "./item-fields";
+import { warehouseCodeOf, type StockLists } from "./item-stock";
 import { ITEM_TYPE_DEFAULTS, ITEM_TYPES, KOREA, PROC_TYPES, type ItemType } from "./master-codes";
 import {
   PARTNER_TEXT_FIELDS,
@@ -52,6 +53,7 @@ const AMBIGUOUS = (what: string) => `같은 이름의 ${what}가 둘 이상입
 type ItemCurrent = { itemType: string; unit: string; cls1: string | null; cls2: string | null; cls3: string | null };
 type Classes = Readonly<Record<ItemClassField, readonly CodeOption[]>>;
 const NO_CLASSES: Classes = { cls1: [], cls2: [], cls3: [] };
+const NO_STOCK: StockLists = { rules: [], warehouses: [] };
 
 const NEW_ONLY_ACTIVE = "새 행은 사용(Y)으로만 등록합니다 — 비우거나 Y 를 넣으세요";
 
@@ -70,7 +72,13 @@ function readActive(text: string, editing: boolean, errors: SheetErrors): "Y" |
  * 품목 한 줄의 글자를 한 건 등록 · 수정의 값으로 — 이름 · 코드 · Y/N · 빈 칸의 기본값. current 가 있으면 불러온 줄의 고침이다:
  * 유형은 그 품목의 것(시트의 유형 칸은 보지 않는다), 「사용 안 함」 단위 · 분류도 그 품목의 지금 값이면 남는다(한 건 수정과 같다).
  */
-function itemRowValues(row: SheetRow, units: readonly CodeOption[], classes: Classes, current?: ItemCurrent) {
+function itemRowValues(
+  row: SheetRow,
+  units: readonly CodeOption[],
+  classes: Classes,
+  lists: StockLists,
+  current?: ItemCurrent,
+) {
   const errors: SheetErrors = {};
   const values: ItemValues = {
     name: row.name ?? "",
@@ -115,7 +123,26 @@ function itemRowValues(row: SheetRow, units: readonly CodeOption[], classes: Cla
     else values[field] = picked.code;
   }
 
-  for (const key of ["inspectIn", "inspectOut"] as const) {
+  // 재고 칸(조각 「재고 수불」 PR B) — 규칙 · 창고는 이름 · 코드 둘 다 받고, 비우면 규칙은 유형의 기본 · 창고는 없음.
+  // 「사용 안 함」 · 불량창고 · 만드는 품목인지는 한 건 등록과 같은 검사(src/lib/item-stock.ts)가 본다.
+  const rule = pickOption(row.lotRuleCode ?? "", lists.rules);
+  if (rule === "blank") values.lotRuleCode = "";
+  else if (rule === "ambiguous") errors.lotRuleCode = AMBIGUOUS("LOT 번호 규칙");
+  else if (rule === "none")
+    errors.lotRuleCode = "번호 규칙에 없는 규칙입니다 — 「시스템 관리 › 번호 규칙」의 코드를 넣으세요";
+  else values.lotRuleCode = rule.code;
+  for (const [key, label] of [
+    ["defaultInWarehouse", "기본 입고 창고"],
+    ["defaultOutWarehouse", "기본 출고 창고"],
+  ] as const) {
+    const picked = pickOption(row[key] ?? "", lists.warehouses);
+    if (picked === "blank") values[key] = "";
+    else if (picked === "ambiguous") errors[key] = AMBIGUOUS(label);
+    else if (picked === "none") errors[key] = "없는 창고입니다 — 창고 코드(WH-01 꼴)나 이름을 넣으세요";
+    else values[key] = picked.code;
+  }
+
+  for (const key of ["inspectIn", "inspectOut", "lotManaged"] as const) {
     const v = yesNo(row[key] ?? "");
     if (v === "bad") errors[key] = YES_NO_BAD;
     else if (v === "blank") values[key] = defaults?.[key] ? "on" : "off";
@@ -140,8 +167,9 @@ export function readItemRow(
   row: SheetRow,
   units: readonly CodeOption[],
   classes: Classes = NO_CLASSES,
+  lists: StockLists = NO_STOCK,
 ): { ok: true; value: NewItemInput } | { ok: false; errors: SheetErrors } {
-  const { values, errors, procBlank } = itemRowValues(row, units, classes);
+  const { values, errors, procBlank } = itemRowValues(row, units, classes, lists);
   const parsed = parseNewItem(values);
   if (!parsed.ok) mergeItemErrors(errors, parsed.errors, procBlank);
   if (parsed.ok && Object.keys(errors).length === 0) return { ok: true, value: parsed.value };
@@ -154,8 +182,9 @@ export function readItemEditRow(
   units: readonly CodeOption[],
   classes: Classes,
   current: ItemCurrent,
+  lists: StockLists = NO_STOCK,
 ): { ok: true; value: ItemUpdateInput } | { ok: false; errors: SheetErrors } {
-  const { values, errors, procBlank } = itemRowValues(row, units, classes, current);
+  const { values, errors, procBlank } = itemRowValues(row, units, classes, lists, current);
   const parsed = parseItemUpdate(values);
   if (!parsed.ok) mergeItemErrors(errors, parsed.errors, procBlank);
   if (parsed.ok && Object.keys(errors).length === 0) return { ok: true, value: parsed.value };
@@ -240,26 +269,33 @@ const yn = (b: boolean) => (b ? "Y" : "N");
  * 기존 품목을 시트의 한 줄로 — 고르는 값은 코드로 둔다(이름은 겹칠 수 있어 그대로 저장하면 거절될 수 있다).
  * 숨은 칸에 코드와 불러온 때의 버전을 둔다.
  */
-export function itemSheetRow(item: {
-  code: string;
-  version: string;
-  itemType: string;
-  name: string;
-  spec: string;
-  unit: string;
-  procurement: string;
-  inspectIn: boolean;
-  inspectOut: boolean;
-  leadTimeDays: number;
-  safetyStock: number;
-  minLot: number;
-  lotMultiple: number;
-  cls1: string | null;
-  cls2: string | null;
-  cls3: string | null;
-  note: string;
-  active: boolean;
-}): SheetRow {
+export function itemSheetRow(
+  item: {
+    code: string;
+    version: string;
+    itemType: string;
+    name: string;
+    spec: string;
+    unit: string;
+    procurement: string;
+    inspectIn: boolean;
+    inspectOut: boolean;
+    leadTimeDays: number;
+    safetyStock: number;
+    minLot: number;
+    lotMultiple: number;
+    cls1: string | null;
+    cls2: string | null;
+    cls3: string | null;
+    note: string;
+    active: boolean;
+    lotManaged: boolean;
+    lotRuleCode: string | null;
+    defaultInWarehouseId: number | null;
+    defaultOutWarehouseId: number | null;
+  },
+  lists: Pick<StockLists, "warehouses"> = NO_STOCK,
+): SheetRow {
   return {
     [CODE_KEY]: item.code,
     [VERSION_KEY]: item.version,
@@ -279,6 +315,10 @@ export function itemSheetRow(item: {
     cls3: item.cls3 ?? "",
     note: item.note,
     active: yn(item.active),
+    lotManaged: yn(item.lotManaged),
+    lotRuleCode: item.lotRuleCode ?? "",
+    defaultInWarehouse: warehouseCodeOf(lists, item.defaultInWarehouseId),
+    defaultOutWarehouse: warehouseCodeOf(lists, item.defaultOutWarehouseId),
   };
 }
 
diff --git a/src/lib/warehouse-fields.ts b/src/lib/warehouse-fields.ts
index eecb8ea..ea1f3f1 100644
--- a/src/lib/warehouse-fields.ts
+++ b/src/lib/warehouse-fields.ts
@@ -1,7 +1,7 @@
 // 창고 입력의 칸 이름 — 화면(브라우저)과 서버의 검사(src/lib/warehouse-input.ts)가 함께 쓴다.
 // 검사 도구(zod)를 브라우저로 보내지 않게 따로 둔다.
 
-export const WAREHOUSE_FIELDS = ["name", "active"] as const;
+export const WAREHOUSE_FIELDS = ["name", "isDefect", "active"] as const;
 
 export type WarehouseField = (typeof WAREHOUSE_FIELDS)[number];
 /** 화면이 보낸 그대로의 글자 — 거절하면 이 값으로 입력 칸을 다시 채운다. */
diff --git a/src/lib/warehouse-input.ts b/src/lib/warehouse-input.ts
index 1702d34..c02c8f6 100644
--- a/src/lib/warehouse-input.ts
+++ b/src/lib/warehouse-input.ts
@@ -1,17 +1,18 @@
 import { z } from "zod";
-import { activeFlag, firstErrors, formValues, text } from "./input-common";
+import { activeFlag, firstErrors, formValues, text, toggle } from "./input-common";
 import { WAREHOUSE_FIELDS, type WarehouseErrors, type WarehouseField, type WarehouseValues } from "./warehouse-fields";
 
-// 창고 등록 · 수정의 입력 검사(설계 ③ — 창고명 1 ~ 50자, 사용 여부). 서버가 한다.
+// 창고 등록 · 수정의 입력 검사(설계 ③ — 창고명 1 ~ 50자, 불량창고 표시, 사용 여부). 서버가 한다.
+// 불량창고(조각 「재고 수불」 PR B, ADR 0015) — 그 창고의 재고는 불량이다. 비우면 아니오.
 // 코드는 받지 않는다 — 서버가 붙이고(WH-01 꼴), 등록한 뒤 바뀌지 않는다.
 
 export { WAREHOUSE_FIELDS, type WarehouseErrors, type WarehouseField, type WarehouseValues } from "./warehouse-fields";
 
-export type NewWarehouseInput = { name: string };
-export type WarehouseUpdateInput = { name: string; active: boolean };
+export type NewWarehouseInput = { name: string; isDefect: boolean };
+export type WarehouseUpdateInput = { name: string; isDefect: boolean; active: boolean };
 
-const createSchema = z.object({ name: text("창고명", 1, 50) });
-const updateSchema = z.object({ name: text("창고명", 1, 50), active: activeFlag });
+const createSchema = z.object({ name: text("창고명", 1, 50), isDefect: toggle });
+const updateSchema = z.object({ name: text("창고명", 1, 50), isDefect: toggle, active: activeFlag });
 
 export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: WarehouseErrors };
 
@@ -20,7 +21,8 @@ export function warehouseValues(form: FormData): WarehouseValues {
 }
 
 function parse<T>(schema: z.ZodType<T>, values: WarehouseValues): Parsed<T> {
-  const result = schema.safeParse(values);
+  // 끈 체크 상자는 칸이 오지 않는다 — 불량창고가 아니다.
+  const result = schema.safeParse({ ...values, isDefect: values.isDefect ?? "off" });
   return result.success
     ? { ok: true, value: result.data }
     : { ok: false, errors: firstErrors<WarehouseField>(result.error) };
```

## 이 브리핑이 담지 않은 것

- 실행 결과 · 테스트 통과 여부
- 저장소 설정(브랜치 보호 · 룰셋 · 시크릿 저장소)
- 배포 환경 · 운영 데이터 · 배포 이력
- 본문을 담지 않은 파일(작업트리에서 읽을 것):
  - `docs/adr/0015-stock-calculation-rules.md` (A)
  - `docs/adr/0016-stock-numbers-and-codes.md` (A)
  - `docs/adr/0017-unit-base-factor-decimals.md` (A)
  - `docs/adr/0018-stock-storage.md` (A)
  - `docs/adr/0019-item-types-sub-material-consumable.md` (A)
  - `docs/adr/0020-stock-move-entry-menus.md` (A)
  - `docs/adr/0021-stock-count-rules.md` (A)
  - `"docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md"` ()
  - `"docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/requirements.md"` ()
  - `drizzle/0005_unit_specs.sql` (A)
  - `drizzle/0006_unit_spec_values.sql` (A)
  - `drizzle/0007_number_rules.sql` (A)
  - `drizzle/0008_number_rule_values.sql` (A)
  - `drizzle/0009_default_warehouse_not_defect.sql` (A)
  - `drizzle/0010_stock_move_codes.sql` (A)
  - `drizzle/0011_stock_moves.sql` (A)
  - `drizzle/0012_stock_counts.sql` (A)
  - `drizzle/meta/0005_snapshot.json` (A)
  - `drizzle/meta/0006_snapshot.json` (A)
  - `drizzle/meta/0007_snapshot.json` (A)
  - `drizzle/meta/0008_snapshot.json` (A)
  - `drizzle/meta/0009_snapshot.json` (A)
  - `drizzle/meta/0010_snapshot.json` (A)
  - `drizzle/meta/0011_snapshot.json` (A)
  - `drizzle/meta/0012_snapshot.json` (A)
  - `drizzle/meta/_journal.json` (M)
  - `src/app/inventory/adjustments/page.tsx` (A)
  - `src/app/inventory/counts/[code]/page.tsx` (A)
  - `src/app/inventory/counts/__tests__/count-entry.test.tsx` (A)
  - `src/app/inventory/counts/actions.ts` (A)
  - `src/app/inventory/counts/confirm-panel.tsx` (A)
  - `src/app/inventory/counts/count-entry.tsx` (A)
  - `src/app/inventory/counts/count-form.tsx` (A)
  - `src/app/inventory/counts/count-list.tsx` (A)
  - `src/app/inventory/counts/page.tsx` (A)
  - `src/app/inventory/history/page.tsx` (A)
  - `src/app/inventory/issues/page.tsx` (A)
  - `src/app/inventory/ledger/[code]/page.tsx` (A)
  - `src/app/inventory/ledger/page.tsx` (A)
  - `src/app/inventory/moves/[code]/page.tsx` (A)
  - `src/app/inventory/moves/__tests__/actions.test.ts` (A)
  - `src/app/inventory/moves/__tests__/menus.test.ts` (A)
  - `src/app/inventory/moves/__tests__/move-form.test.tsx` (A)
  - `src/app/inventory/moves/actions.ts` (A)
  - `src/app/inventory/moves/cancel-move.tsx` (A)
  - `src/app/inventory/moves/move-entry-page.tsx` (A)
  - `src/app/inventory/moves/move-entry.tsx` (A)
  - `src/app/inventory/moves/move-form.tsx` (A)
  - `src/app/inventory/moves/move-list.tsx` (A)
  - `src/app/inventory/moves/new/page.tsx` (A)
  - `src/app/inventory/moves/page.tsx` (A)
  - `src/app/inventory/moves/stock-panel.tsx` (A)
  - `src/app/inventory/receipts/page.tsx` (A)
  - `src/app/inventory/transfers/page.tsx` (A)
  - `src/app/inventory/warehouses/__tests__/warehouse-screens.test.tsx` (M)
  - `src/app/master/items/__tests__/item-form.test.tsx` (M)
  - `src/app/master/items/__tests__/item-inquiry.test.tsx` (M)
  - `src/app/master/items/__tests__/item-list.test.tsx` (M)
  - `src/app/system/codes/__tests__/code-screens.test.tsx` (M)
  - `src/app/system/number-rules/[code]/page.tsx` (A)
  - `src/app/system/number-rules/__tests__/number-rule-screens.test.tsx` (A)
  - `src/app/system/number-rules/actions.ts` (A)
  - `src/app/system/number-rules/crumbs.tsx` (A)
  - `src/app/system/number-rules/new/page.tsx` (A)
  - `src/app/system/number-rules/not-found.tsx` (A)
  - `src/app/system/number-rules/number-rule-form.tsx` (A)
  - `src/app/system/number-rules/number-rule-list.tsx` (A)
  - `src/app/system/number-rules/page.tsx` (A)
  - `src/components/__tests__/module-home.test.tsx` (M)
  - `src/components/__tests__/sheet-grid.test.tsx` (M)
  - `src/components/__tests__/sidebar.test.tsx` (M)
  - `src/components/__tests__/sort-pager.test.tsx` (A)
  - `src/components/menu-hint.tsx` (A)
  - `src/components/sort-pager.tsx` (A)
  - `src/content/__tests__/diagrams.test.ts` (M)
  - `src/db/__tests__/codes.test.ts` (M)
  - `src/db/__tests__/deploy.test.ts` (M)
  - `src/db/__tests__/descriptive.test.ts` (M)
  - `src/db/__tests__/inquiry.test.ts` (M)
  - `src/db/__tests__/item-stock.test.ts` (A)
  - `src/db/__tests__/items.test.ts` (M)
  - `src/db/__tests__/number-rules.test.ts` (A)
  - `src/db/__tests__/pglite.ts` (M)
  - `src/db/__tests__/reset.test.ts` (M)
  - `src/db/__tests__/sample.test.ts` (M)
  - `src/db/__tests__/schema.test.ts` (M)
  - `src/db/__tests__/sheet-edit.test.ts` (M)
  - `src/db/__tests__/sheet.test.ts` (M)
  - `src/db/__tests__/stock-counts.test.ts` (A)
  - `src/db/__tests__/stock-history.test.ts` (A)
  - `src/db/__tests__/stock.test.ts` (A)
  - `src/db/__tests__/units.test.ts` (A)
  - `src/db/__tests__/warehouses.test.ts` (M)
  - `src/db/number-rules.ts` (A)
  - `src/db/stock-counts.ts` (A)
  - `src/db/stock-history.ts` (A)
  - `src/db/stock.ts` (A)
  - `src/lib/__tests__/count-input.test.ts` (A)
  - `src/lib/__tests__/item-input.test.ts` (M)
  - `src/lib/__tests__/move-input.test.ts` (A)
  - `src/lib/__tests__/number-rule.test.ts` (A)
  - `src/lib/__tests__/sheet-input.test.ts` (M)
  - `src/lib/__tests__/sheet.test.ts` (M)
  - `src/lib/__tests__/unit-input.test.ts` (A)
  - `src/lib/__tests__/warehouse-input.test.ts` (M)
  - `src/lib/count-input.ts` (A)
  - `src/lib/item-stock.ts` (A)
  - `src/lib/move-input.ts` (A)
  - `src/lib/move-menus.ts` (A)
  - `src/lib/number-rule-fields.ts` (A)
  - `src/lib/number-rule-input.ts` (A)
  - `src/lib/stock-query.ts` (A)
  - `src/lib/today.ts` (A)
  - `src/lib/unit-input.ts` (A)
