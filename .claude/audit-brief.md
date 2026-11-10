# 감사 브리핑

- 만든 시각: 2026-11-10 08:16:13 UTC
- 기준: `26e3a9a` = `26e3a9a` (2026-11-10 Merge pull request #35 from pdw96/claude/compassionate-keller-lu068h), 머지 베이스 `26e3a9a7b0f8d903171130f837aecdf3c495c587`
- 대상: `f0fb318` (브랜치 `claude/compassionate-keller-lu068h`, 닫는 PR pdw96/ERP2#36 의 머리)
- 커밋 안 된 변경: 없음
- 추적 안 된 파일: 없음
- 자름: 없음
- 대장: `docs/audit/nc-ledger.md` · `docs/audit/nc-ledger-history.md` 와 `.claude/audits` · `.claude/briefs` 는 diff 에서 뺐다(지난 기록으로 따로 읽는다)
- 검사: PASS (verify-brief.py, --exclude docs/audit/nc-ledger.md --exclude docs/audit/nc-ledger-history.md)

## 변경 파일

```
 docs/adr/0015-stock-calculation-rules.md                                   |   5 +++++
 docs/adr/0021-stock-count-rules.md                                         |   5 +++++
 docs/adr/0022-stock-slice-closing-corrections.md                           |  53 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/architecture.md                                                       |   4 ++--
 docs/schema.md                                                             |  19 ++++++++++++-------
 "docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md" |  18 ++++++++++++++++++
 src/app/health/page.tsx                                                    |   2 +-
 src/app/inventory/moves/move-form.tsx                                      |   4 ++--
 src/app/master/items/item-form.tsx                                         |   2 +-
 src/db/__tests__/stock-counts.test.ts                                      | 115 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/db/schema.ts                                                           |   2 +-
 src/db/stock-counts.ts                                                     |  71 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/db/stock.ts                                                            |   2 +-
 src/lib/__tests__/count-input.test.ts                                      |   5 +++--
 src/lib/areas.ts                                                           |   2 +-
 src/lib/count-input.ts                                                     |   8 +++-----
 16 files changed, 268 insertions(+), 49 deletions(-)
```

## 커밋

```
f0fb318 닫는 PR 의 고침 — 실사 저장의 장부 줄을 서버가 정함(NC-20, 시험), ADR 0022, 문서 · 표기(NC-18 · 19 · 21 ~ 25)
b5ba9d1 감사 회차 25(audit-internal) — NC-21 ~ 25 · U-21 · U-22 등록, U-21 · U-22 근거(메인 세션)
509f6d2 감사 브리핑 — 회차 25 용(대상 c362eca, 코드 diff 는 같음)
c362eca 감사 회차 24(audit-secrets) — NC-20 · U-20 등록, U-19 · U-20 근거(메인 세션)
f481395 감사 브리핑 — 회차 24 용으로 대상을 새 머리로(코드 diff 는 같음)
6469405 감사 회차 23(audit-data) — 조각 「재고 수불」 닫기 전, NC-18 · NC-19 등록(저자 판정 대기)
1294727 감사 브리핑 — 조각 「재고 수불」 닫기 전 감사 회차(3e7977a…26e3a9a)
```

## diff

```diff
diff --git a/docs/adr/0015-stock-calculation-rules.md b/docs/adr/0015-stock-calculation-rules.md
index a696014..66a3ad5 100644
--- a/docs/adr/0015-stock-calculation-rules.md
+++ b/docs/adr/0015-stock-calculation-rules.md
@@ -100,3 +100,8 @@ ADR 0008 의 상태(검사대기 · 가용 · 불량)를 이렇게 가른다.
 - 재고 · 생산 계산을 바꾸는 PR 은 시험 없이 머지하지 않는다(`CLAUDE.md`). 규칙마다의 시험 규칙은 조각 「재고 수불」 설계 ⑤.
 - 회계의 재고 금액 · 단가는 조각 「회계」 · 「생산 원가」가 정한다(ADR 0008).
 - 이 규칙을 바꾸려면 저자에게 먼저 묻는다(`CLAUDE.md` 앵커볼트).
+
+## 대체 (2026-11-10)
+
+- 「품목의 기본 창고」의 「수불 등록에서 그 품목을 고르면 창고 칸을 미리 채울 뿐 바꿀 수 있다」는 ADR 0022 의 1 이 대체했다 — 기본 입고 창고는 기타입고가
+  창고 칸을 미리 채우고, 기본 출고 창고는 이 조각의 등록 화면이 쓰지 않으며 뒤 조각(생산실적의 자재 출고 · 영업 출고)이 읽는다.
diff --git a/docs/adr/0021-stock-count-rules.md b/docs/adr/0021-stock-count-rules.md
index e025014..11e8f7d 100644
--- a/docs/adr/0021-stock-count-rules.md
+++ b/docs/adr/0021-stock-count-rules.md
@@ -48,3 +48,8 @@ Claude 가 위 판정을 칸으로 옮긴 것(업무에 영향이 없는 기술
 - 창고의 장부가 100줄을 넘으면 실사를 나눠 할 길이 없다 — 데모의 창고는 많아야 열 줄 남짓이라 지금은 그대로 두고, 상한을 크게 올리는 조각에서
   다시 본다.
 - 재고 · 생산 계산을 바꾸는 PR 은 시험 없이 머지하지 않는다(`CLAUDE.md`) — 시험 규칙은 조각 「재고 수불」 설계 ⑤ 의 R1 ~ R4.
+
+## 대체 (2026-11-10)
+
+- 맥락의 「그래서 「실사 차이」 전표는 늘 실사 번호를 가리킨다」와 결과 첫 줄은 ADR 0022 의 2 가 대체했다 — 「실사 차이」 전표는 실사를 가리키고, 그 전표의
+  취소 전표는 사유가 같고 원래 전표를 가리킨다.
diff --git a/docs/adr/0022-stock-slice-closing-corrections.md b/docs/adr/0022-stock-slice-closing-corrections.md
new file mode 100644
index 0000000..1f65471
--- /dev/null
+++ b/docs/adr/0022-stock-slice-closing-corrections.md
@@ -0,0 +1,53 @@
+# ADR 0022 — 조각 「재고 수불」을 닫으며 바로잡은 결정 셋: 기본 출고 창고 · 실사 차이의 취소 전표 · 실사의 장부 줄
+
+- 날짜: 2026-11-10
+- 상태: 정함
+- 조각: 재고 수불(닫는 PR — 대장 NC-20 · NC-22 · NC-24 의 「고침」)
+- ADR 0015 「품목의 기본 창고」의 「수불 등록에서 그 품목을 고르면 창고 칸을 미리 채울 뿐」을 대체한다(1).
+- ADR 0021 의 「「실사 차이」 전표는 늘 실사 번호를 가리킨다」를 대체한다(2).
+
+## 맥락
+
+조각을 닫기 전 감사(회차 23 ~ 25)가 앵커볼트 「재고 계산 규칙」 · 「업무 용어 · 코드 체계」의 문서와 코드가 어긋난 자리를 셋 냈다. 저자가 셋 다
+추천대로 고치기로 했다(2026-11-10).
+
+- **NC-24** — PR F 검토에서 기타출고 · 재고이동 · 재고조정은 전표 머리에서 창고를 먼저 고르게 됐다(ADR 0020, 저자 판정). 그 뒤 품목을 고르면
+  창고가 채워지는 것은 기타입고(기본 입고 창고)에만 남았고, 기본 출고 창고는 화면 어디에도 쓰이지 않는다. 그런데 ADR 0015 와 요구사항 성공 기준 2,
+  품목 화면의 도움말은 옛 동작을 말했다.
+- **NC-22** — 「실사 차이」 전표를 취소하면, 취소 전표는 원래 전표의 사유(`COUNT`)를 그대로 옮기고 원래 전표를 가리킨다. 설계(「PR E 를 열기 전에
+  정한 것」)는 그 예외를 적었으나 ADR 0021 은 「늘 실사 번호를 가리킨다」로 적었다.
+- **NC-20** — 실사 저장이 「장부에서 불려 온 줄인가」를 화면이 보낸 표시(`added`)로만 가려, 화면을 건너뛴 요청이 장부 줄을 빼거나 「사용 안 함」 품목을
+  장부 줄로 꾸며 넣을 수 있었다. 설계 ③ 「화면의 검사를 건너뛴 요청도 같은 규칙으로 거절」과 「불려 온 줄은 지우지 못한다」를 어겼다.
+
+## 대안
+
+- 1(기본 출고 창고) — (가) 기록만 맞춘다: 이 조각의 화면은 기본 출고 창고를 쓰지 않고 뒤 조각이 쓴다. (나) 첫 품목을 고르면 비어 있는 머리 창고를
+  그 품목의 기본 출고 창고로 채운다.
+- 2(취소 전표) — (가) ADR 의 「늘」을 설계처럼 좁힌다. (나) 취소 전표의 사유 · 관련전표를 바꾼다.
+- 3(장부 줄) — 서버가 장부 줄의 키(품목 · LOT · 상태)로 정한다. 새 실사의 장부를 무엇으로 볼지 — (가) 처음 저장하는 순간의 장부, (나) 연 때의 장부
+  (화면이 보낸 줄 번호로 되짚기). (나) 는 화면이 보낸 줄 번호를 믿어야 해 꾸민 값에 다시 열린다.
+
+## 결정
+
+1. **기본 출고 창고는 이 조각의 등록 화면이 쓰지 않는다**(저자 판정 (가)). 기타입고는 품목을 고르면 기본 입고 창고를 창고 칸에 미리 채운다(바꿀 수
+   있다). 기타출고 · 재고이동 · 재고조정은 머리에서 창고를 먼저 고르므로 품목으로 채울 자리가 없다. 기본 출고 창고는 뒤 조각(생산실적의 자재 출고 ·
+   영업 출고)이 읽는다. 품목 화면의 도움말과 주석을 이에 맞춘다. 요구사항 성공 기준 2 는 기록이라 그대로 두고, 그 「기본 출고 창고가 미리 채워진다」는
+   이 결정이 고친다.
+2. **「실사 차이」 전표는 실사를 가리키고, 그 전표의 취소 전표는 사유가 같고 원래 전표를 가리킨다**(저자 판정 (가)). 취소는 원래 전표의 반대 수량이라
+   사유도 그대로 옮긴다(설계 「2026-11-09 — PR E 를 열기 전에 정한 것」 그대로). 손으로 넣는 조정은 여전히 `COUNT` 를 받지 않는다.
+3. **실사 줄이 장부 줄인지는 서버가 정한다**(Claude — 저자가 고친다고 정한 NC-20 의 고침을 칸으로 옮긴 것, 업무에 영향이 없는 기술 결정). 장부 줄의
+   키는 작성 중 실사면 처음 저장 때 불려 온 줄(더한 줄이 아닌 것), 새 실사면 처음 저장하는 순간 그 창고의 잔액(0 보다 큰 것)이다(대안 (가)). 저장은
+   - 장부 줄이 하나라도 빠졌으면 거절하고 빠진 줄(품목 · LOT)을 보인다. 새 실사에서 빠졌으면 「그 사이 이 창고의 장부가 바뀌었습니다 — 화면을 새로
+     여세요」(연 뒤 처음 저장 전에 그 창고에 수불이 있었다).
+   - 장부에 없는 줄은 더한 줄로 정한다 — 「사용」인 품목만, 상태는 가용만 받는다. 장부에 없는 검사대기 줄은 거절한다(전에는 화면이 더한 줄로 표시한
+     검사대기 줄을 가용으로 바꿔 받았다 — 화면은 더한 줄에 늘 가용을 보내므로 정상 사용에는 걸리지 않는다).
+   - 화면이 보낸 `added` 는 읽지 않는다.
+
+## 결과
+
+- 대장 NC-20 · NC-22 · NC-24 의 「고침」이다. 재감사(담당 `audit-secrets` · `audit-internal`)가 닫는다.
+- 꾸민 요청 세 가지(장부 줄 빼기 · 더한 줄 표시 지우기 · 「사용 안 함」 품목)와 「연 뒤 장부가 바뀜」을 거절하는 시험이 `src/db/__tests__/stock-counts.test.ts`
+  「장부 줄인지는 화면이 아니라 서버가 정한다(대장 NC-20)」에 있다. 고침을 되돌리면 그 시험이 떨어진다(설계 ⑤ R1 · R2).
+- 연 뒤 처음 저장하기 전에 그 창고에 수불이 있으면 처음 저장이 거절돼 화면을 새로 열어야 한다 — 넣던 실물 수량은 다시 넣는다. 데모는 한 창고를 여럿이
+  동시에 세지 않으니 드물다. 잦아지면 연 때의 장부를 서버가 들고 있는 길(실사를 열 때 번호를 먼저 받기)을 다시 본다.
+- 재고 · 생산 계산을 바꾸는 PR 은 시험 없이 머지하지 않는다(`CLAUDE.md`).
diff --git a/docs/architecture.md b/docs/architecture.md
index 04cc5ab..84f02bd 100644
--- a/docs/architecture.md
+++ b/docs/architecture.md
@@ -23,7 +23,7 @@
 | 재고 실사 화면 | 재고 › 수불관리 › 재고 실사 — 누르면 바로 입력이다. 창고를 고르면(주소의 `?warehouse=`) 그 창고의 작성 중 실사가, 없으면 장부(잔액이 0 보다 큰 품목 · LOT · 상태)를 불러온 새 실사가 열린다 — 읽기만 하고, 처음 저장할 때 번호가 붙는다. 줄마다 장부 · 실물 · 차이, 장부에 없는 것은 「줄 더하기」(늘 가용). 「작성 중으로 저장」 · 「확정…」(저장한 뒤 지금의 장부로 다시 센 차이 · 연 뒤의 수불 · 줄 밖의 재고 · 비운 줄을 보이고, 한 번 더 「확정」) · 「실사 취소」. 확정은 재고 계산의 `recordCountAdjustment` 를 같은 트랜잭션에서 불러 「실사 차이」 조정 전표 한 장(확정한 날)을 남긴다(ADR 0021). 아래에 최근 실사 20건(모든 창고 · 상태). 실사 보기는 `/inventory/counts/<실사 번호>` | `src/app/inventory/counts/` · `src/lib/count-input.ts` · `src/db/stock-counts.ts` |
 | 공통코드 화면 | 시스템 관리 › 공통코드 — 묶음(Major) 목록과 한 묶음의 값(Minor) 목록, 사용자 코드 묶음의 값 추가 · 수정. 시스템 코드 묶음은 보이기만 하고, 서버도 바꾸는 요청을 거절한다. 프로그램이 기대는 사용자 코드 값(국가 `KR` · 조정 사유 `COUNT`)은 「사용 안 함」으로 바꾸지 못한다. 묶음 안의 겹침 · 등록 상한은 서버가 본다(ADR 0009). 단위(`UNIT`) 묶음은 값마다 기준 단위 · 배수 · 소수 자릿수(단위 사양)를 함께 보이고, 새 단위는 셋을 함께 넣고 수정은 자릿수만 고친다(ADR 0017) — 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만 | `src/app/system/codes/` · `src/lib/code-input.ts` · `src/lib/unit-input.ts` · `src/db/codes.ts` |
 | 설계도 화면 | 업무 흐름(스윔레인 · Overview) · 데이터 모델(모듈별 전체 지도 · 이 조각의 테이블) · 시스템 구성 그림. 메뉴 판 아래 「설계도」. 그림의 글과 스윔레인 데이터는 한 파일에 있고, 테이블 · 부품 · 흐름을 바꾸는 PR 이 함께 고친다(ADR 0006). 스윔레인은 서버에서 SVG 로, 모듈별 지도는 서버에서 카드로, 나머지는 브라우저의 Mermaid 가 그린다 | `src/app/design/` · `src/content/diagrams.ts` · `src/lib/swimlane.ts` · `src/components/swimlane.tsx` · `src/components/module-map.tsx` · `src/components/mermaid-diagram.tsx` |
-| 상태 화면 | DB 에 닿는지 묻고 「연결됨」(DB 시각) 또는 「연결 안 됨」을 보인다. 「마지막 되돌림」(샘플을 마지막으로 넣은 시각 — 공통코드 묶음의 가장 이른 등록 시각)도 보인다. 결과를 1분 재사용하고 검색 로봇을 막는다. 떠 있는 배포의 커밋도 보인다 | `src/app/health/` · `src/db/status.ts` |
+| 상태 화면 | DB 에 닿는지 묻고 「연결됨」(DB 시각) 또는 「연결 안 됨」을 보인다. 「마지막 되돌림」(샘플을 마지막으로 넣은 시각 — 공통코드 묶음의 가장 이른 등록 시각)도 보인다. 결과를 재사용하고(1분이 지나면 다음 요청 때 새로 묻고, 최대 2분 지난 결과를 보일 수 있다) 검색 로봇을 막는다. 떠 있는 배포의 커밋도 보인다 | `src/app/health/` · `src/db/status.ts` |
 | DB 접속 | 환경변수 `DATABASE_URL` 하나로 PostgreSQL 에 닿는다 — Drizzle ORM · postgres 드라이버. 내 컴퓨터의 DB 말고는 암호화하고 인증서를 확인한다 | `src/db/client.ts` |
 | 테이블 | 기준정보 다섯(품목 · 창고 · 거래처 · 공통코드 묶음 · 값)과 재고 수불의 단위 사양 · 번호 규칙 · 번호 규칙의 일련 · 수불 전표 · 수불 줄 · 잔액 · 실사 · 실사 줄, 코드의 꼴 · 참조 제약, 마이그레이션 SQL(`docs/schema.md`) | `src/db/schema.ts` · `drizzle/` |
 | DB 준비(배포 빌드) | 빌드의 첫 단계 — 마이그레이션을 적용하고, 빈 DB 면 샘플 데이터를 넣는다. 실패하면 빌드가 멈춰 배포가 나가지 않는다(ADR 0005) | `scripts/migrate.ts` · `src/db/deploy.ts` |
@@ -53,7 +53,7 @@ main 머지 ── 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 운영
 ```
 
 고정 화면(첫 화면 · 모듈 화면 · 설계도)은 빌드 때 만들어 Vercel 이 가까운 곳에서 내보낸다. 상태 화면의 DB 확인, 되돌림 입구, 품목 · 거래처 · 창고 · 공통코드
-· 번호 규칙 · 수불 화면의 DB 읽기 · 쓰기는 요청이 올 때 돈다(상태 확인은 1분 재사용, 기준정보 화면은 늘 새로 읽는다). 기준정보 화면의 틀(머리 · 메뉴)은 빌드 때 만들고 목록 · 입력 칸만 요청 때 채운다.
+· 번호 규칙 · 수불 화면의 DB 읽기 · 쓰기는 요청이 올 때 돈다(상태 확인은 결과를 최대 2분 재사용, 기준정보 화면은 늘 새로 읽는다). 기준정보 화면의 틀(머리 · 메뉴)은 빌드 때 만들고 목록 · 입력 칸만 요청 때 채운다.
 스택과 배포처를 고른 까닭은 ADR 0001 · 0002, 테이블과 마이그레이션은 `docs/schema.md`, 배포와 되돌리기는 `docs/deploy.md`.
 
 ## 시험
diff --git a/docs/schema.md b/docs/schema.md
index 5eae02a..ab8f00f 100644
--- a/docs/schema.md
+++ b/docs/schema.md
@@ -53,23 +53,23 @@
   (`cancels_move_id` 유일) — 취소 전표는 취소되지 않는다: 취소의 참조가 (원래 전표, 늘 `false` 인 칸 `cancels_cancel`)로 (`id`, 저절로 정해지는
   `is_cancel`)을 가리킨다(`stock_moves_cancels_fk`). 줄의 수량 · 넣은 수량은 0 보다 크고, 출고창고 · 입고창고 가운데 하나는 있고 서로 다르다.
   LOT 는 영문 · 숫자 · `-` · `_` · `.` 30자까지, 상태는 `AVAILABLE` · `QC`. 잔액은 0 밑으로 가지 못하고(`stock_balances_qty_not_negative`)
-  (품목, 창고, LOT, 상태)마다 한 행이다. 전표 · 줄 · 품목 · 창고는 지울 수 없다(참조).
+  (품목, 창고, LOT, 상태)마다 한 행이다. 전표 · 품목 · 창고는 지울 수 없다(참조). 수불 줄 · 잔액은 DB 가 막지 않는다 — 아래 「서버가 막는 것」(대장 NC-19).
 - **재고 실사**(조각 「재고 수불」 PR E, ADR 0021) — 실사 번호는 `^PI-[0-9]{8}-[0-9]{3,}$` 이고 가운데 여덟 자리가 처음 저장한 날이다
   (`stock_counts_code_date`). 창고 하나에 작성 중인 실사는 하나다(부분 유일 인덱스 `stock_counts_one_draft_per_warehouse`). 확정한 날은
   확정한 실사에만 있고, 조정 전표는 확정한 실사만 가리키며 한 전표는 한 실사만 가리킨다. 실사 줄은 1 ~ 100 번이고 (실사, 품목, LOT, 상태)마다 한 줄,
   더한 줄은 가용이며(`stock_count_lines_added_available`), 실물 수량 · 장부는 0 이상이다.
 
-DB 가 막지 않고 서버가 막는 것(조각 「기준정보」 PR C · D · E) — 수량의 소수 넷째 자리(DB 는 `numeric(12,3)` 이라 거절하지 않고 셋째 자리로 반올림한다) · 수량의 상한, 코드 · 품목 유형을 등록 뒤 바꾸지 않음, 「사용 안 함」 단위를
+DB 가 막지 않고 서버가 막는 것(조각 「기준정보」 PR C · D · E) — 수량의 소수 넷째 자리(DB 는 `numeric(12,3)` 이라 거절하지 않고 셋째 자리로 반올림한다 — 재고 수량은 `numeric(14,3)`, ADR 0018) · 수량의 상한, 코드 · 품목 유형을 등록 뒤 바꾸지 않음, 「사용 안 함」 단위를
 새 품목에 쓰지 않음, 「사용 안 함」 분류를 새 품목에 쓰지 않음(PR H), 「사용 안 함」 국가를 새 거래처에 쓰지 않음, 시스템 코드 묶음을 바꾸지 않음, 국가 `KR` 을 「사용 안 함」으로 바꾸지
 않음(PR G), 테이블마다 등록 상한. 조각 「재고 수불」 PR A 부터 — 단위를 더할 때 사양을 함께 넣음(단위마다 사양이 있음), 사양의 기준 단위 ·
 배수를 등록 뒤 바꾸지 않음, 「사용 안 함」 단위를 새 단위의 기준으로 받지 않음. PR B 부터 — 유형의 기본 규칙을 「사용 안 함」으로 바꾸거나
 떼지 않음(다른 규칙을 기본으로 고르면 옮겨 감), 「사용 안 함」 규칙 · 창고를 품목에 새로 고르지 않음, 불량창고를 품목의 기본 창고로 고르지 않음,
 품목의 기본 창고인 창고를 불량창고로 바꾸지 않음. PR C 부터 — 음수 재고(지난 날짜로 넣어 그 뒤 어느 때든 0 밑으로 가는 것까지), 미래 일자, 단위의
 자릿수(넣은 수량은 넣은 단위의, 쌓는 수량은 품목 단위의)와 같은 기준의 단위만으로 넣음, LOT 관리 품목의 LOT · 사 오는 품목의 거래처 LOT,
-불량창고에서 내보내지 않음, 수불이 있는 품목의 LOT 관리 · 단위를 바꾸지 않음, 재고가 있는 창고의 불량창고 표시를 바꾸지 않음, 단위의 자릿수를
+불량창고에서 내보내지 않음, 수불 줄 · 잔액을 고치거나 지우지 않음(쓰는 곳은 `src/db/stock.ts` 하나, 바로잡는 길은 취소 전표 — ADR 0018, 대장 NC-19), 수불이 있는 품목의 LOT 관리 · 단위를 바꾸지 않음, 재고가 있는 창고의 불량창고 표시를 바꾸지 않음, 단위의 자릿수를
 그 단위의 수불 수량이 맞지 않게 줄이지 않음, 조정 사유 `COUNT` 를 「사용 안 함」으로 바꾸지 않음, 수불 전표 5,000 · 줄 50,000 의 등록 상한.
 PR E 부터 — 조정 사유 `COUNT`(실사 차이)는 실사의 확정만 쓰고 손으로 넣는 조정은 거절함, 실사의 확정은 실물 수량을 비운 줄이 없을 때만, 작성 중
-실사의 저장 · 확정은 버전이 맞을 때만(그 사이 다른 사람이 저장했으면 거절), 장부에 없는 검사대기 줄을 받지 않음, 실사 500 · 실사 줄 50,000 의 등록 상한,
+실사의 저장 · 확정은 버전이 맞을 때만(그 사이 다른 사람이 저장했으면 거절), 장부에 없는 검사대기 줄을 받지 않음, 장부 줄인지(더한 줄인지)는 화면이 보낸 표시가 아니라 장부와 견줘 정하고 장부 줄을 뺀 저장을 거절함(대장 NC-20), 실사 500 · 실사 줄 50,000 의 등록 상한,
 작성 중 실사에 든 품목의 LOT 관리 · 단위를 바꾸지 않음과 단위의 자릿수를 작성 중 실사의 실물 수량이 맞지 않게 줄이지 않음(수불이 있는 품목과 같은
 규칙 — 확정하면 그 수량이 수불이 된다, PR E 리뷰 1회차).
 수불의 저장 · 취소, 실사의 저장 · 취소 · 확정과 이 고침들, 그리고 매일 밤 되돌림은 한 DB 잠금(`REGISTER_LOCK.stock`)을 쥐고 차례로 돈다 — 잠금은 늘 트랜잭션의
@@ -112,7 +112,10 @@ PR E 부터 — 조정 사유 `COUNT`(실사 차이)는 실사의 확정만 쓰
 ## 마이그레이션
 
 - 테이블은 Drizzle 의 TypeScript 스키마(`src/db/schema.ts`)로 쓰고, `npm run db:generate` 가 SQL 마이그레이션 파일을 `drizzle/`
-  에 만든다. 파일은 레포에 올려 리뷰에서 바뀌는 SQL 이 보이게 한다. 만든 SQL 은 손으로 고치지 않는다.
+  에 만든다. 파일은 레포에 올려 리뷰에서 바뀌는 SQL 이 보이게 한다. 만든 SQL 은 손으로 고치지 않는다 — 예외는 둘이고, 고쳤으면 파일 머리
+  주석과 PR 본문에 적는다: 아래 「잠금」의 `NOT VALID`, 그리고 drizzle-kit 이 차례를 틀리게 낸 것(참조가 가리키는 열쇠를 참조보다 뒤에 만듦)을
+  옮기는 것(예: `0009_default_warehouse_not_defect`, 대장 NC-23). 새 참조를 걸기 전에 어긋난 행을 비우는 데이터 SQL 은 그 파일에 섞지 않고
+  다음 항목의 custom 파일로 앞에 둔다 — 0009 는 이 규칙이 서기 전에 섞었다.
 - 데이터를 옮기거나 채우는 SQL(예: 새 참조가 가리킬 공통코드 값)은 `npx drizzle-kit generate --custom --name <이름>` 으로 만든 빈 파일에
   손으로 쓰고, 스키마의 마이그레이션 앞에 둔다(예: `0001_country_codes` → `0002_partner_country`, `0003_item_class_codes` → `0004_master_descriptive`). 새 테이블을 채우는
   것이면 그 테이블을 만드는 마이그레이션 뒤에 둔다(예: `0005_unit_specs` → `0006_unit_spec_values`). 빈 DB 에서는 아무것도 하지 않게 쓴다 —
@@ -133,8 +136,10 @@ PR E 부터 — 조정 사유 `COUNT`(실사 차이)는 실사의 확정만 쓰
     손으로 쓴 마이그레이션에서 `VALIDATE CONSTRAINT` 로 검사한다(쓰기를 멈추지 않는다).
   - **이미 있는 칸에 `NOT NULL` 을 걸 때** — `SET NOT NULL` 은 전체를 검사하며 읽기 · 쓰기를 멈춘다. 위의 틀로 `CHECK (칸 IS NOT NULL) NOT VALID`
     를 더하고, 다음 PR 에서 `VALIDATE` 한 뒤 `SET NOT NULL` 을 한다 — 검증된 검사가 있으면 `SET NOT NULL` 은 다시 읽지 않는다.
-  - **인덱스 · 유일 제약을 더할 때** — `CONCURRENTLY` 없는 인덱스는 만드는 동안 쓰기를 멈춘다(읽기는 된다). 이 마이그레이터에는 피하는 길이
-    없으므로, 테이블을 만드는 마이그레이션에서 함께 만든다. 나중에 꼭 더해야 하면 쓰기가 멈추는 것을 PR 본문에 적고 받아들인다.
+  - **인덱스 · 유일 제약을 더할 때** — 스키마의 `index()` · `uniqueIndex()` 는 `CREATE [UNIQUE] INDEX` 라 만드는 동안 쓰기만 멈춘다(읽기는 된다).
+    `unique()` 는 `ALTER TABLE … ADD CONSTRAINT … UNIQUE` 라 읽기 · 쓰기를 다 멈춘다(대장 NC-18). `CONCURRENTLY` 는 이 마이그레이터에서 쓸 수 없으므로,
+    테이블을 만드는 마이그레이션에서 함께 만든다. 이미 행이 있는 테이블에 나중에 꼭 유일을 더해야 하면 `uniqueIndex()` 로 쓰거나, 다 멈추는 것을
+    PR 본문에 적고 받아들인다. 이미 있는 테이블에 칸을 더하는 `ADD COLUMN` 도 짧게나마 읽기 · 쓰기를 다 멈춘다(상수 기본값이면 다시 쓰지는 않는다).
   - **표를 다시 쓰는 변경** — 칸의 타입 변경, 휘발성 기본값(`random()` · `gen_random_uuid()` 따위)을 단 `ADD COLUMN` 은 읽기 · 쓰기를 멈추고
     전체를 다시 쓴다. 쓰지 않는다 — 새 칸을 더하고, 나눠서 채우고, 코드를 옮기는 차례로 한다.
 - **앞 배포의 코드와도 함께 돌게 쓴다**(ADR 0005) — 배포를 앞 배포로 되돌려도(Instant Rollback) DB 는 돌아가지 않는다.
diff --git "a/docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md" "b/docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md"
index c935bc0..d5ec0d8 100644
--- "a/docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md"
+++ "b/docs/slices/3-\354\236\254\352\263\240\354\210\230\353\266\210/design.md"
@@ -587,3 +587,21 @@ DB 는 PGlite(내 컴퓨터에서 도는 PostgreSQL)에 레포의 마이그레
   전표 보기가 실사 차이 전표에서 그 실사로 잇는다.
 - **휴대폰 폭**(Claude) — 머리는 세로로 쌓이고 줄 표는 옆으로 민다 — 수불 등록 화면과 같다(성공 기준 14).
 - **등록 상한의 셈**(Claude) — 실사 500 은 취소한 실사도 센다. 실사 줄 50,000 은 작성 중 실사를 다시 저장할 때 옛 줄을 빼고 센다.
+
+## 2026-11-10 — 닫는 PR 에서 정한 것
+
+닫기 전 감사(회차 23 ~ 25)가 낸 부적합을 저자가 「고침」으로 판정했다(2026-11-10, 모두 추천대로). 이 PR 이 싣는 고침과 그 까닭이다.
+
+- **실사의 장부 줄은 서버가 정한다**(NC-20, ADR 0022 의 3) — `saveCount` 가 화면이 보낸 `added` 를 읽지 않고, 장부 줄의 키(작성 중이면 처음 저장 때 불려 온
+  줄, 새 실사면 처음 저장하는 순간의 잔액)와 견준다. 장부 줄이 빠지면 거절하고, 장부에 없는 줄은 더한 줄(「사용」 품목 · 가용만)이다. 위 「PR E 에서 정한 것」의
+  「더한 줄은 「사용」인 품목만 … 불려 온 줄은 지우지 못한다」가 이제 서버에서도 참이다.
+- **기본 출고 창고**(NC-24, ADR 0022 의 1) — 이 조각의 등록 화면은 쓰지 않고 뒤 조각이 읽는다. 품목 화면 도움말 · 주석을 맞췄다.
+- **「실사 차이」의 취소 전표**(NC-22, ADR 0022 의 2) — 사유가 같고 원래 전표를 가리킨다(위 「PR E 를 열기 전에 정한 것」 그대로). ADR 0021 의 「늘」을 좁혔다.
+- **PR B 의 잠금 설명을 바로잡는다**(NC-18) — 위 「PR B 를 열기 전에 정한 것」은 `warehouses` 를 「쓰기를 멈춘다」고만 적었으나, 0007 의 `ADD COLUMN "is_defect"` 는
+  그 빌드의 마이그레이션이 끝날 때까지 `warehouses` 의 읽기도 멈췄다. 리뷰에서 더한 0009 는 `warehouses`(`ADD CONSTRAINT … UNIQUE`) · `items`(`ADD COLUMN`)의
+  읽기 · 쓰기를 멈췄다. 둘 다 상한 있는 표(창고 99 · 품목 2,000)라 멈춤이 짧았다. 0011 은 `items` · `warehouses` · `codes`, 0012 는 `items` · `warehouses` ·
+  `stock_moves` 의 쓰기를 커밋까지 멈췄다(새 표의 참조). 규칙은 `docs/schema.md` 「잠금」이 고쳐 든다.
+- **0009 의 손 고침**(NC-23) — 0009 는 만든 SQL 에 데이터 `UPDATE` 둘을 섞고 열쇠를 참조보다 앞으로 옮겼다. 이미 운영에 적용돼 파일은 그대로 두고
+  (`docs/schema.md` 「잘못된 마이그레이션은 새 마이그레이션으로 덮는다」), 규칙에 예외(차례 옮김)를 적고 데이터 SQL 은 앞으로 custom 파일로 따로 둔다.
+- **메뉴 「할당 현황」의 조각**(NC-21) — `src/lib/areas.ts` 를 마스터플랜대로 「작업지시」로 고쳤다.
+- **상태 화면의 재사용 시간**(NC-25) — 주석과 `docs/architecture.md` 를 「최대 2분」으로 맞췄다. 조각 「기반」 설계 `:120` 은 기록이라 그대로 둔다.
diff --git a/src/app/health/page.tsx b/src/app/health/page.tsx
index a541d4c..9f9d472 100644
--- a/src/app/health/page.tsx
+++ b/src/app/health/page.tsx
@@ -31,7 +31,7 @@ async function DatabaseStatus() {
   return <DbStatusView status={await cachedDatabaseStatus()} />;
 }
 
-// 같은 결과를 1분 동안 돌려준다 — 자주 열어도 DB 는 1분에 한 번만 묻는다.
+// 결과를 재사용한다 — 1분이 지나면 다음 요청 때 새로 묻고, 그 사이 최대 2분 지난 결과를 보일 수 있다(대장 NC-16 · NC-25).
 // 수명이 5분보다 짧아 빌드 때 미리 만들지 않고 요청이 올 때 채운다.
 async function cachedDatabaseStatus() {
   "use cache";
diff --git a/src/app/inventory/moves/move-form.tsx b/src/app/inventory/moves/move-form.tsx
index 7bc479a..3527424 100644
--- a/src/app/inventory/moves/move-form.tsx
+++ b/src/app/inventory/moves/move-form.tsx
@@ -15,8 +15,8 @@ import { onHandAction, type MoveFormState } from "./actions";
 import { StockPanel } from "./stock-panel";
 
 // 수불 등록의 입력(성공 기준 2 ~ 6 · 12) — 일자 · 비고를 한 번 쓰고 줄을 「줄 더하기」로 한 줄씩 늘린다(설계 「2026-11-09 — PR C 를 열기 전에
-// 정한 것」). 수불구분은 메뉴가 정하고(ADR 0020) 그 구분의 칸만 보인다. 품목을 고르면 기본 창고가 미리 채워지고(이동은 입고 창고 → 출고 창고),
-// 출고 · 이동은 그 창고의 LOT 를 가용 수량과 함께 고른다. 검사는 서버가 하고 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않는다 — 화면은 틀린
+// 정한 것」). 수불구분은 메뉴가 정하고(ADR 0020) 그 구분의 칸만 보인다. 기타입고는 품목을 고르면 기본 입고 창고가 미리
+// 채워진다(기본 출고 창고는 이 조각의 화면이 쓰지 않는다 — ADR 0022 의 1). 출고 · 이동은 그 창고의 LOT 를 가용 수량과 함께 고른다. 검사는 서버가 하고 — 줄이 하나라도 틀리면 아무 줄도 저장되지 않는다 — 화면은 틀린
 // 칸 · 줄과 까닭을 보인다. 저장 상태는 부르는 쪽(move-entry.tsx)이 쥐고, 저장되면 이 입력을 새로 그려 비운다.
 // 기타출고 · 재고이동 · 재고조정은 창고를 전표 머리에서 고르고(이동은 출고창고 → 입고창고) 모든 줄이 그 창고이며, 그 창고의 현재고 표에서
 // 골라 줄로 넣는다(설계 「2026-11-09 — PR F 검토 중 정한 것」). 기타입고는 줄마다 창고를 고른다. 머리의 창고도 부르는 쪽이 쥐어 저장 뒤에도 남는다.
diff --git a/src/app/master/items/item-form.tsx b/src/app/master/items/item-form.tsx
index fdf3131..05858a8 100644
--- a/src/app/master/items/item-form.tsx
+++ b/src/app/master/items/item-form.tsx
@@ -227,7 +227,7 @@ function Fields(props: Props & { values: ItemValues; errors: ItemErrors }) {
 
       <Section
         title="재고"
-        note="수불관리의 등록 화면(기타입고 · 기타출고 · 재고이동 · 재고조정)이 씁니다. 기본 창고는 품목을 고르면 창고 칸에 미리 채워지고, 그 화면에서 바꿀 수 있습니다."
+        note="수불관리의 등록 화면(기타입고 · 기타출고 · 재고이동 · 재고조정)이 씁니다. 기본 입고 창고는 기타입고에서 품목을 고르면 창고 칸에 미리 채워지고, 그 화면에서 바꿀 수 있습니다. 기본 출고 창고는 뒤에 지을 화면(생산실적의 자재 출고 · 영업 출고)이 씁니다."
       >
         <div>
           <Check name="lotManaged" checked={lotManaged} onChange={setLotManaged} error={errors.lotManaged}>
diff --git a/src/db/__tests__/stock-counts.test.ts b/src/db/__tests__/stock-counts.test.ts
index 805cf67..2d90009 100644
--- a/src/db/__tests__/stock-counts.test.ts
+++ b/src/db/__tests__/stock-counts.test.ts
@@ -271,31 +271,35 @@ describe("저장(작성 중)", () => {
     expect(errors[0][field as "item"]).toContain(message);
   });
 
-  it("「사용 안 함」 품목은 더하지 못하고, 장부에서 불려 온 줄은 그대로 저장된다", async () => {
+  it("「사용 안 함」 품목은 더하지 못하고(더한 줄 표시를 지워 보내도), 장부에서 불려 온 줄은 그대로 저장된다", async () => {
     await db.update(items).set({ active: false }).where(eq(items.code, "CS-0001"));
     const sheet = await open("WH-01");
     expect(sheet.lines.some((l) => l.itemCode === "CS-0001")).toBe(true);
     await saved(saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
-    const sheet2 = await open("WH-02");
-    const r = await expectRejected(() =>
+    // 불량창고의 장부에는 CS-0001 이 없다 — 더한 줄이다
+    const sheet2 = await open("WH-04");
+    for (const added of ["1", ""]) {
+      const r = await expectRejected(() =>
+        saveCount(db, valuesOf(sheet2, [...linesOf(sheet2), { item: "CS-0001", counted: "1", added }]), TODAY),
+      );
+      expect(Object.values(r.errors.lines)[0].item).toContain("사용 안 함");
+    }
+  });
+
+  it("더한 줄은 늘 가용이다 — 장부에 없는 줄을 검사대기로 보내면 거절한다(저자 판정, 대장 NC-20)", async () => {
+    const sheet = await open("WH-01");
+    const qc = await expectRejected(() =>
       saveCount(
         db,
-        valuesOf(sheet2, [
-          ...linesOf(sheet2).filter((l) => l.item !== "CS-0001"),
-          { item: "CS-0001", counted: "1", added: "1" },
-        ]),
+        valuesOf(sheet, [...linesOf(sheet), { item: "SF-0001", lot: "", status: "QC", counted: "3", added: "1" }]),
         TODAY,
       ),
     );
-    expect(Object.values(r.errors.lines)[0].item).toContain("사용 안 함");
-  });
-
-  it("더한 줄은 상태를 보내도 늘 가용이다(저자 판정)", async () => {
-    const sheet = await open("WH-01");
+    expect(Object.values(qc.errors.lines)[0].row).toContain("검사대기");
     const r = await saved(
       saveCount(
         db,
-        valuesOf(sheet, [...linesOf(sheet), { item: "SF-0001", lot: "", status: "QC", counted: "3", added: "1" }]),
+        valuesOf(sheet, [...linesOf(sheet), { item: "SF-0001", lot: "", counted: "3", added: "1" }]),
         TODAY,
       ),
     );
@@ -330,6 +334,91 @@ describe("저장(작성 중)", () => {
   });
 });
 
+describe("장부 줄인지는 화면이 아니라 서버가 정한다(대장 NC-20)", () => {
+  it("새 실사에서 장부 줄을 빼고 저장하면 거절한다 — 빠진 줄을 보인다", async () => {
+    const sheet = await open("WH-01");
+    const r = await expectRejected(() =>
+      saveCount(
+        db,
+        valuesOf(
+          sheet,
+          linesOf(sheet).filter((l) => l.item !== "RM-0001"),
+        ),
+        TODAY,
+      ),
+    );
+    expect(r.formError).toContain("장부 줄 1개가 빠졌습니다(RM-0001 MW-A1021)");
+  });
+
+  it("작성 중 실사를 다시 저장하며 장부 줄을 빼면 거절한다 — 불려 온 줄은 지우지 못한다", async () => {
+    const sheet = await open("WH-03");
+    expect(sheet.code).toBe("PI-20261108-002");
+    const r = await expectRejected(() =>
+      saveCount(
+        db,
+        valuesOf(
+          sheet,
+          linesOf(sheet).filter((l) => l.item !== "FG-0001"),
+        ),
+        TODAY,
+      ),
+    );
+    expect(r.formError).toContain("장부 줄 1개가 빠졌습니다(FG-0001 FG-261102-001)");
+    expect(r.formError).toContain("지우지 못합니다");
+  });
+
+  it("더한 줄 표시는 믿지 않는다 — 장부 줄에 붙여도 장부 줄, 장부에 없는 줄에서 지워도 더한 줄로 남는다", async () => {
+    const sheet = await open("WH-04");
+    const forged = [
+      ...linesOf(sheet).map((l) => ({ ...l, added: "1" })),
+      { item: "RM-0003", lot: "NW-25-0799", counted: "5", added: "" },
+    ];
+    const r = await saved(saveCount(db, valuesOf(sheet, forged), TODAY));
+    const view = (await getCount(db, r.code))!;
+    expect(view.lineRows.map((l) => [l.itemCode, l.added])).toEqual([
+      ["SF-0002", false],
+      ["RM-0003", true],
+    ]);
+    // 다시 저장해도 같다 — 작성 중 실사의 장부 줄은 처음 저장한 장부에서 온다
+    const reopened = await open("WH-04");
+    const again = await saved(
+      saveCount(
+        db,
+        valuesOf(
+          reopened,
+          linesOf(reopened).map((l) => ({ ...l, added: l.added ? "" : "1" })),
+        ),
+        TODAY,
+      ),
+    );
+    expect((await getCount(db, again.code))!.lineRows.map((l) => [l.itemCode, l.added])).toEqual([
+      ["SF-0002", false],
+      ["RM-0003", true],
+    ]);
+  });
+
+  it("연 뒤 처음 저장하기 전에 그 창고에 장부 줄이 새로 생기면 처음 저장을 거절한다 — 화면을 새로 연다", async () => {
+    const sheet = await open("WH-04");
+    expect(
+      (
+        await saveMove(
+          db,
+          {
+            moveDate: TODAY,
+            moveType: "XFER",
+            lines: [{ item: "SM-0001", lot: "", warehouse: "WH-02", toWarehouse: "WH-04", qty: "1" }],
+          },
+          TODAY,
+        )
+      ).ok,
+    ).toBe(true);
+    const r = await expectRejected(() => saveCount(db, valuesOf(sheet, linesOf(sheet)), TODAY));
+    expect(r.formError).toContain("장부가 바뀌었습니다");
+    const fresh = await open("WH-04");
+    await saved(saveCount(db, valuesOf(fresh, linesOf(fresh)), TODAY));
+  });
+});
+
 describe("취소 — 작성 중 실사를 「취소」로 남긴다(저자 판정)", () => {
   it("작성 중은 취소되고, 그 창고에 새 실사를 열 수 있다. 수불은 바뀌지 않는다", async () => {
     const before = await state();
diff --git a/src/db/schema.ts b/src/db/schema.ts
index 91af6f4..6824c5c 100644
--- a/src/db/schema.ts
+++ b/src/db/schema.ts
@@ -211,7 +211,7 @@ export const items = pgTable(
     cls3: text("cls3"),
     note: text("note").notNull().default(""),
     // 재고 수불(PR B, ADR 0015 · 0016) — LOT 관리 여부, LOT 번호 규칙(반제품 · 완제품만, 비우면 유형의 기본 규칙),
-    // 기본 입고 · 출고 창고(비우면 없음, 수불 등록이 창고 칸을 미리 채운다).
+    // 기본 입고 · 출고 창고(비우면 없음 — 기본 입고 창고는 기타입고가 창고 칸을 미리 채우고, 기본 출고 창고는 뒤 조각이 쓴다, ADR 0022 의 1).
     lotManaged: boolean("lot_managed").notNull().default(true),
     lotRuleCode: text("lot_rule_code"),
     defaultInWarehouseId: integer("default_in_warehouse_id"),
diff --git a/src/db/stock-counts.ts b/src/db/stock-counts.ts
index f0f0e1a..557c163 100644
--- a/src/db/stock-counts.ts
+++ b/src/db/stock-counts.ts
@@ -277,13 +277,47 @@ export type CountSaveResult =
   | { ok: true; code: string; version: string }
   | { ok: false; errors: CountErrors; formError?: string; values: CountValues };
 
-type ResolvedLine = ParsedCountLine & { itemId: number };
+type ResolvedLine = ParsedCountLine & { itemId: number; added: boolean };
 
-/** 실사 줄을 DB 에 대어 본다 — 품목 · LOT · 상태 · 자릿수. 잠금 안에서 부른다. */
+/** 장부 줄의 키(품목 · LOT · 상태)와 그 이름(「RM-0001 MW-A1021」) — 저장한 실사가 지워서는 안 되는 줄이다. */
+type BookKeys = Map<string, string>;
+
+const bookLabel = (code: string, lot: string, status: string) =>
+  [code, lot, status === "QC" ? "검사대기" : ""].filter(Boolean).join(" ");
+
+/** 새 실사의 장부 줄 — 지금 그 창고의 잔액(0 보다 큰 것). 화면이 연 장부와 같아야 한다. */
+async function bookKeysNow(tx: Db, warehouseId: number): Promise<BookKeys> {
+  const rows = await tx
+    .select({ itemId: stockBalances.itemId, code: items.code, lot: stockBalances.lot, status: stockBalances.status })
+    .from(stockBalances)
+    .innerJoin(items, eq(items.id, stockBalances.itemId))
+    .where(and(eq(stockBalances.warehouseId, warehouseId), gt(stockBalances.qty, 0)));
+  return new Map(rows.map((r) => [keyOf(r.itemId, r.lot, r.status), bookLabel(r.code, r.lot, r.status)]));
+}
+
+/** 작성 중 실사의 장부 줄 — 처음 저장할 때 장부에서 불려 온 줄(더한 줄이 아닌 것). */
+async function bookKeysOfCount(tx: Db, countId: number): Promise<BookKeys> {
+  const rows = await tx
+    .select({
+      itemId: stockCountLines.itemId,
+      code: items.code,
+      lot: stockCountLines.lot,
+      status: stockCountLines.status,
+    })
+    .from(stockCountLines)
+    .innerJoin(items, eq(items.id, stockCountLines.itemId))
+    .where(and(eq(stockCountLines.countId, countId), eq(stockCountLines.added, false)));
+  return new Map(rows.map((r) => [keyOf(r.itemId, r.lot, r.status), bookLabel(r.code, r.lot, r.status)]));
+}
+
+/**
+ * 실사 줄을 DB 에 대어 본다 — 품목 · LOT · 상태 · 자릿수. 잠금 안에서 부른다.
+ * 장부 줄인지(`added`)는 화면이 보낸 값이 아니라 장부 줄의 키로 정한다(대장 NC-20) — 장부에 없는 줄은 더한 줄이라 「사용」인 품목 · 가용만 받는다.
+ */
 async function resolveCountLines(
   tx: Db,
-  warehouseId: number,
   lines: ParsedCountLine[],
+  book: BookKeys,
 ): Promise<{ ok: true; lines: ResolvedLine[] } | { ok: false; lines: Record<number, CountLineErrors> }> {
   const codes = [...new Set(lines.map((l) => l.itemCode))];
   const itemRows = codes.length
@@ -293,30 +327,26 @@ async function resolveCountLines(
         .leftJoin(unitSpecs, eq(unitSpecs.unit, items.unit))
         .where(inArray(items.code, codes))
     : [];
-  // 검사대기 줄은 장부에서 불려 온 줄뿐이다 — 그 키의 잔액 행이 있어야 한다(이 조각은 검사대기를 만들지 않는다, 설계 ②).
-  const qcRows = await tx
-    .select({ itemId: stockBalances.itemId, lot: stockBalances.lot })
-    .from(stockBalances)
-    .where(and(eq(stockBalances.warehouseId, warehouseId), eq(stockBalances.status, "QC")));
   const errors: Record<number, CountLineErrors> = {};
   const out: ResolvedLine[] = [];
   for (const l of lines) {
     const e: CountLineErrors = {};
     const item = itemRows.find((i) => i.code === l.itemCode);
+    const added = !item || !book.has(keyOf(item.id, l.lot, l.status));
     if (!item) e.item = "없는 품목입니다 — 목록에서 고르세요";
     else {
-      if (l.added && !item.active) e.item = "「사용 안 함」인 품목입니다 — 다른 품목을 고르세요";
+      if (added && !item.active) e.item = "「사용 안 함」인 품목입니다 — 다른 품목을 고르세요";
       if (!item.lotManaged && l.lot) e.lot = "LOT 관리를 하지 않는 품목입니다 — LOT 를 비우세요";
       else if (item.lotManaged && !l.lot && !isMadeType(item.itemType)) e.lot = "사 오는 품목은 LOT 를 넣어 주세요";
       const decimals = item.decimals ?? 3;
       if (l.counted !== null && l.countedDecimals > decimals)
         e.counted =
           decimals === 0 ? `${eun(item.unit)} 정수로 넣습니다` : `${eun(item.unit)} 소수 ${decimals}자리까지 넣습니다`;
-      if (l.status === "QC" && !qcRows.some((q) => q.itemId === item.id && q.lot === l.lot))
-        e.row = "장부에 없는 검사대기 줄입니다 — 더한 줄은 가용입니다";
+      // 검사대기 줄은 장부에서 불려 온 줄뿐이다 — 이 조각은 검사대기를 만들지 않고, 더한 줄은 늘 가용이다(저자 판정, 설계 ②).
+      if (added && l.status === "QC") e.row = "장부에 없는 검사대기 줄입니다 — 더한 줄은 가용입니다";
     }
     if (Object.keys(e).length || !item) errors[l.index] = e;
-    else out.push({ ...l, itemId: item.id });
+    else out.push({ ...l, itemId: item.id, added });
   }
   return Object.keys(errors).length ? { ok: false, lines: errors } : { ok: true, lines: out };
 }
@@ -344,6 +374,7 @@ export async function saveCount(db: Db, values: CountValues, today: string): Pro
       let countId: number;
       let code: string;
       let oldLines = 0;
+      let book: BookKeys;
       if (p.code) {
         const [head] = await tx
           .select({ id: stockCounts.id, status: stockCounts.status, warehouseId: stockCounts.warehouseId })
@@ -363,6 +394,7 @@ export async function saveCount(db: Db, values: CountValues, today: string): Pro
           .select({ n: count() })
           .from(stockCountLines)
           .where(eq(stockCountLines.countId, head.id));
+        book = await bookKeysOfCount(tx, head.id);
       } else {
         if (!wh.active) return fail("「사용 안 함」인 창고입니다 — 다른 창고를 고르세요");
         const [draft] = await tx
@@ -372,6 +404,7 @@ export async function saveCount(db: Db, values: CountValues, today: string): Pro
         if (draft) return fail(`이 창고에 작성 중인 실사 ${draft.code} 가 있습니다 — 화면을 새로 열어 이어 넣으세요`);
         const [{ n }] = await tx.select({ n: count() }).from(stockCounts);
         if (n >= COUNT_LIMIT) return fail(limitMessage("재고 실사", COUNT_LIMIT));
+        book = await bookKeysNow(tx, wh.id);
         const prefix = `PI-${today.replaceAll("-", "")}-`;
         const [{ max }] = await tx
           .select({ max: sql<number | string | null>`max(substring(${stockCounts.code} from 13)::int)` })
@@ -391,8 +424,20 @@ export async function saveCount(db: Db, values: CountValues, today: string): Pro
       if (allLines - oldLines + p.lines.length > COUNT_LINE_LIMIT)
         throw new CountRollback(fail(limitMessage("재고 실사 줄", COUNT_LINE_LIMIT)));
 
-      const r = await resolveCountLines(tx, wh.id, p.lines);
+      const r = await resolveCountLines(tx, p.lines, book);
       if (!r.ok) throw new CountRollback(fail(undefined, r.lines));
+      // 장부에서 불려 온 줄은 지우지 못한다 — 모두 세는 것이 실사다(설계 「PR E 에서 정한 것」, 대장 NC-20).
+      const sent = new Set(r.lines.map((l) => keyOf(l.itemId, l.lot, l.status)));
+      const missing = [...book].filter(([key]) => !sent.has(key)).map(([, label]) => label);
+      if (missing.length)
+        throw new CountRollback(
+          fail(
+            `장부 줄 ${missing.length}개가 빠졌습니다(${missing.slice(0, 3).join(" · ")}${missing.length > 3 ? " …" : ""}) — ` +
+              (p.code
+                ? "장부에서 불려 온 줄은 지우지 못합니다. 화면을 새로 여세요"
+                : "그 사이 이 창고의 장부가 바뀌었습니다. 화면을 새로 여세요"),
+          ),
+        );
 
       await tx.delete(stockCountLines).where(eq(stockCountLines.countId, countId));
       await tx.insert(stockCountLines).values(
diff --git a/src/db/stock.ts b/src/db/stock.ts
index c251200..ac1024c 100644
--- a/src/db/stock.ts
+++ b/src/db/stock.ts
@@ -779,7 +779,7 @@ export type WarehouseStockRow = {
 };
 
 /**
- * 한 창고의 현재고 — 잔액이 0 보다 큰 품목 · LOT · 상태마다 한 줄, 품목코드 · LOT 차례(ADR 0020 의 「PR F 검토 중 정한 것」).
+ * 한 창고의 현재고 — 잔액이 0 보다 큰 품목 · LOT · 상태마다 한 줄, 품목코드 · LOT 차례(설계 「2026-11-09 — PR F 검토 중 정한 것」, ADR 0020).
  * 기타출고 · 재고이동 · 재고조정 등록이 그 창고의 재고를 보며 골라 줄로 넣는다. 읽기만 한다 — 상태별 · 창고별로 보는 메뉴는 조각 「재고 현황」이다.
  */
 export async function warehouseStock(db: Db, warehouseCode: string): Promise<WarehouseStockRow[]> {
diff --git a/src/lib/__tests__/count-input.test.ts b/src/lib/__tests__/count-input.test.ts
index 6b3df2b..abb9900 100644
--- a/src/lib/__tests__/count-input.test.ts
+++ b/src/lib/__tests__/count-input.test.ts
@@ -28,9 +28,10 @@ describe("parseCount", () => {
     ]);
   });
 
-  it("더한 줄은 상태를 보내도 늘 가용이다(저자 판정)", () => {
+  it("상태는 보낸 대로 읽고, 더한 줄인지는 읽지 않는다 — 서버가 장부와 견줘 정한다(대장 NC-20)", () => {
     const r = parseCount(base([{ item: "SF-0001", status: "QC", counted: "1", added: "1" }]));
-    expect(r.ok && r.value.lines[0]).toMatchObject({ status: "AVAILABLE", added: true });
+    expect(r.ok && r.value.lines[0]).toMatchObject({ status: "QC" });
+    expect(r.ok && r.value.lines[0]).not.toHaveProperty("added");
   });
 
   it("품목 · LOT · 실물 수량이 모두 빈 줄은 없는 줄로 친다", () => {
diff --git a/src/lib/areas.ts b/src/lib/areas.ts
index 664a1b5..33b8d2b 100644
--- a/src/lib/areas.ts
+++ b/src/lib/areas.ts
@@ -102,7 +102,7 @@ export const AREAS: readonly Area[] = [
           { label: "창고별 재고", slice: "재고 현황" },
           { label: "LOT별 재고", slice: "재고 현황" },
           { label: "예상재고", slice: "재고 현황" },
-          { label: "할당 현황", slice: "재고 현황" },
+          { label: "할당 현황", slice: "작업지시" },
         ],
       },
     ],
diff --git a/src/lib/count-input.ts b/src/lib/count-input.ts
index 2d43a15..e151f96 100644
--- a/src/lib/count-input.ts
+++ b/src/lib/count-input.ts
@@ -36,8 +36,6 @@ export type ParsedCountLine = {
   itemCode: string;
   lot: string;
   status: "AVAILABLE" | "QC";
-  /** 장부에 없어 더한 줄 — 늘 가용(저자 판정). */
-  added: boolean;
   /** 실물 수량(천분의 일 단위) — 비우면 null(작성 중에만). */
   counted: Milli | null;
   countedDecimals: number;
@@ -85,8 +83,8 @@ export function parseCount(values: CountValues): CountParseResult {
     const lot = t(line.lot);
     if (lot && !LOT.test(lot)) e.lot = "LOT 는 영문 · 숫자 · - · _ · . 30자까지입니다";
 
-    const added = t(line.added) === "1";
-    const status = t(line.status) === "QC" && !added ? "QC" : "AVAILABLE";
+    // 「더한 줄」인지는 화면이 보낸 `added` 를 믿지 않고 서버가 장부와 견줘 정한다(대장 NC-20) — 여기서는 상태만 읽는다.
+    const status = t(line.status) === "QC" ? "QC" : "AVAILABLE";
 
     const countedText = t(line.counted);
     let counted: Milli | null = null;
@@ -107,7 +105,7 @@ export function parseCount(values: CountValues): CountParseResult {
     seen.add(key);
 
     if (Object.keys(e).length) errors.lines[index] = e;
-    else lines.push({ index, itemCode, lot, status, added, counted, countedDecimals });
+    else lines.push({ index, itemCode, lot, status, counted, countedDecimals });
   });
 
   if (!formError && count === 0) formError = "줄을 하나 이상 넣으세요";
```

## 이 브리핑이 담지 않은 것

- 실행 결과 · 테스트 통과 여부
- 저장소 설정(브랜치 보호 · 룰셋 · 시크릿 저장소)
- 배포 환경 · 운영 데이터 · 배포 이력
