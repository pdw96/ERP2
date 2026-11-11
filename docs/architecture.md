# 시스템 구조

**살아 있는 문서**다. ERP2 의 부품과 그 사이의 흐름을 든다. 부품 · 경계 · 흐름을 바꾸는 구현 PR 이 이 문서도 고친다.

## 부품

| 부품 | 무엇 | 어디 |
|---|---|---|
| 웹 앱 | 화면과 서버를 한 앱으로 — Next.js(App Router) · TypeScript · Tailwind CSS | `src/` |
| 화면 틀 | 왼쪽 모듈 메뉴 판(넓은 화면) — 지금 보는 모듈의 메뉴를 펼치고, 짓지 않은 모듈 · 메뉴는 「준비 중」. 휴대폰 폭에서는 위 머리줄이 되고 메뉴가 「메뉴」 단추 아래로 접힌다 | `src/app/layout.tsx` · `src/components/sidebar.tsx` |
| 첫 화면 | 자재가 들어와 제품으로 나가는 흐름도 — 단계마다 그 영역으로 간다 | `src/app/page.tsx` |
| 색 · 글꼴 | 색 이름(`machine` · `safety` · `floor` 등)과 IBM Plex Sans KR | `src/app/globals.css` |
| 모듈과 메뉴 | 메뉴와 모듈 화면이 함께 읽는 모듈 아홉(기준정보 · 영업 · 구매 · 재고 · 생산 · 품질 · 회계 · 인사 · 시스템 관리, 마스터플랜 순서)과 그 메뉴 · 짓는 조각. 지은 메뉴만 주소를 갖는다 | `src/lib/areas.ts` |
| 모듈 화면 | 모듈마다 한 주소(`/master` · `/sales` · `/purchasing` · `/inventory` · `/production` · `/quality` · `/accounting` · `/hr` · `/system`) — 그 모듈의 메뉴를 묶음대로 보인다 | `src/app/<모듈>/` · `src/components/module-home.tsx` |
| 품목 화면 | 기준정보 › 품목 등록 — 고칠 품목을 찾는 목록(찾기 · 유형 · 조달구분 · 분류 거르기 · 「사용 안 함 포함」) · 등록 · 수정. 저장은 서버 액션이 받고, 입력 검사(`zod`)와 단위 · 등록 상한 · 코드 번호는 서버가 본다. 실패 로그는 오류 코드만. 재고 칸(LOT 관리 · LOT 번호 규칙 · 기본 입고 · 출고 창고)은 한 건 등록 · 수정 · 시트가 같은 검사로 DB 의 규칙 · 창고 목록에 대어 본다 | `src/app/master/items/` · `src/lib/item-input.ts` · `src/lib/item-stock.ts` · `src/db/items.ts` · `src/db/request.ts` |
| 거래처 · 창고 화면 | 기준정보 › 거래처 등록(찾기 · 매입처 · 매출처 거르기, 국가 — 한국이면 사업자등록번호, 아니면 해외 사업자번호)와 재고 › 재고 기준정보 › 창고(찾기)의 목록 · 등록 · 수정 — 품목 화면과 같은 틀이다. 입력 칸 부품 · 저장 알림, 찾기 · DB 거절 읽기 · 잠금 안의 등록은 세 화면이 같이 쓴다 | `src/app/master/partners/` · `src/app/inventory/warehouses/` · `src/lib/partner-input.ts` · `src/lib/warehouse-input.ts` · `src/lib/input-common.ts` · `src/db/partners.ts` · `src/db/warehouses.ts` · `src/db/master-shared.ts` · `src/components/form-parts.tsx` |
| 시트형 등록 | 기준정보 › 품목 · 거래처의 「시트형 등록」 — 칸 · 줄로 된 시트에 넣거나 엑셀에서 붙여넣어 한 번에 등록한다(100줄까지). 칸의 규칙은 한 건 등록의 검사를 그대로 쓰고, 고르는 값은 이름 · 코드 둘 다, 빈 칸은 한 건 등록의 기본값. 맞는 줄은 한 트랜잭션에서 잠금을 쥐고 줄 차례로 코드를 받아 저장하고(줄마다 저장점), 틀린 줄은 까닭과 함께 시트에 남는다 | `src/components/sheet-grid.tsx` · `src/app/master/items/sheet/` · `src/app/master/partners/sheet/` · `src/lib/sheet.ts` · `src/lib/sheet-columns.ts` · `src/lib/sheet-input.ts` · `src/db/master-shared.ts` |
| 조회 화면 | 기준정보 › 품목 조회 · 거래처 조회 — 모든 칸을 넓은 표로 보는, 고칠 수 없는 화면(ADR 0013). 휴대폰 폭에서는 표를 옆으로 밀고 코드 · 이름 칸이 왼쪽에 남는다. 찾기는 글 칸 전체, 거르기는 등록과 같고 거래처에 국가. 코드를 누르면 등록의 수정 화면 | `src/components/inquiry-table.tsx` · `src/app/master/items/inquiry/` · `src/app/master/partners/inquiry/` · `src/db/items.ts` · `src/db/partners.ts` |
| 번호 규칙 화면 | 시스템 관리 › 번호 규칙 — LOT 번호 규칙의 목록(꼴과 오늘의 첫 번호) · 등록 · 수정(ADR 0016). 칸을 바꾸면 번호의 예가 바로 바뀐다. 유형(반제품 · 완제품)마다 기본 규칙이 하나이고, 다른 규칙을 기본으로 고르면 옮겨 간다 — 기본 규칙은 「사용 안 함」으로 바꾸지 못한다. 겹침 · 등록 상한(50)은 서버가 본다. LOT 번호를 내는 함수(`issueLotNumber`)는 수불관리의 등록 화면이 부른다 | `src/app/system/number-rules/` · `src/lib/number-rule-fields.ts` · `src/lib/number-rule-input.ts` · `src/db/number-rules.ts` |
| 재고 계산 | 수불을 남기는 한 곳(설계 ②) — 전표 저장 · 취소, 재고 실사의 「실사 차이」 조정(`recordCountAdjustment` — 사유 `COUNT` 는 이 길만 쓴다), 단위 환산(같은 기준의 단위만, 반올림 없이), 만드는 품목의 LOT 저절로(번호 규칙), 음수 검사(줄을 넣은 뒤 나가는 쪽 키마다 (일자, 줄 번호) 차례의 누계에서 그 일자부터의 가장 작은 누계), 잔액 고치기를 한 트랜잭션에서 한 DB 잠금을 쥐고 한다(ADR 0015 · 0016 · 0018). 품목의 LOT 관리 · 단위, 창고의 불량창고 표시, 단위의 자릿수를 고칠 때도 같은 잠금을 쥐고 재고를 센다. 화면 · 샘플 · 뒤 조각은 이 함수를 불러 수불을 남긴다 | `src/db/stock.ts` · `src/lib/move-input.ts` |
| 수불 등록 화면 | 재고 › 수불관리의 등록 메뉴 넷 — 기타입고 · 기타출고 · 재고이동 · 재고조정 등록(ADR 0020). 메뉴가 수불구분을 정하고, 누르면 바로 입력(일자 · 비고, 조정은 사유와 「줄 더하기」로 늘리는 줄 표)이며, 기타출고 · 재고이동 · 재고조정은 머리에서 창고(이동은 출고창고 → 입고창고)를 고르면 그 창고의 현재고 표가 보이고 골라 줄로 넣는다(`stock-panel.tsx`, 서버에서 `warehouseStock` 을 읽음). 기타입고는 줄마다 창고를 고른다. 그 아래에 그 구분의 최근 전표 20장이 있다. 저장하면 같은 화면에 남아 전표번호를 보이고 입력을 비운다. 전표 보기 · 취소는 `/inventory/moves/<전표번호>` 이고 왼쪽 메뉴는 그 전표의 등록 메뉴를 가리킨다(화면이 알림, `src/components/menu-hint.tsx`). 옛 주소 `/inventory/moves` 는 기타입고 등록으로 넘긴다. 구분마다 칸이 바뀌고, 기타입고는 품목을 고르면 기본 입고 창고가 채워진다. 출고 · 이동의 LOT 는 그 창고의 가용 재고를 서버에서 읽어 수량과 함께 고른다. 줄이 하나라도 틀리면 아무 줄도 저장되지 않고 틀린 칸 · 줄과 까닭(모자란 수량)이 보인다. 휴대폰 폭에서는 줄 표를 옆으로 민다 | `src/app/inventory/{receipts,issues,transfers,adjustments}/` · `src/app/inventory/moves/` · `src/lib/move-menus.ts` · `src/db/stock.ts` |
| 수불 이력 · 수불부 화면 | 재고 › 수불관리 › 수불 이력 · 수불부 — 수불 줄을 읽기만 한다(재고를 바꾸는 길은 재고 계산 하나). 수불 이력은 수불 줄 한 건마다, 조회기간 · 품목 · 창고(출고창고 · 입고창고 어느 쪽이든) · LOT번호 · 수불구분으로 거른다. 수불부는 품목마다 기초재고 · 입고(수불구분마다 · 입고계) · 출고(수불구분마다 · 출고계) · 기말재고 — 창고를 고르면 그 창고의 몫(이동이 들고 남), 고르지 않으면 모든 창고의 합(이동이 빠진다). 취소 줄은 창고를 원래 쪽으로 되돌려 원래 유형의 칸에서 뺀다. 품목을 누르면 그 기간의 거래와 재고수량(기초재고에서 기말재고까지). 처음 기간은 한국 시각의 최근 30일, 칸 머리를 누르면 거른 줄 전체를 그 칸으로 세우고(다시 누르면 거꾸로), 100줄씩 쪽을 넘긴다 — 거르기 · 칸 · 차례 · 쪽은 화면 주소에 남는다 | `src/app/inventory/history/` · `src/app/inventory/ledger/` · `src/db/stock-history.ts` · `src/lib/stock-query.ts` · `src/components/sort-pager.tsx` |
| 재고 실사 화면 | 재고 › 수불관리 › 재고 실사 — 누르면 바로 입력이다. 창고를 고르면(주소의 `?warehouse=`) 그 창고의 작성 중 실사가, 없으면 장부(잔액이 0 보다 큰 품목 · LOT · 상태)를 불러온 새 실사가 열린다 — 읽기만 하고, 처음 저장할 때 번호가 붙는다. 줄마다 장부 · 실물 · 차이, 장부에 없는 것은 「줄 더하기」(늘 가용). 「작성 중으로 저장」 · 「확정…」(저장한 뒤 지금의 장부로 다시 센 차이 · 연 뒤의 수불 · 줄 밖의 재고 · 비운 줄을 보이고, 한 번 더 「확정」) · 「실사 취소」. 확정은 재고 계산의 `recordCountAdjustment` 를 같은 트랜잭션에서 불러 「실사 차이」 조정 전표 한 장(확정한 날)을 남긴다(ADR 0021). 아래에 최근 실사 20건(모든 창고 · 상태). 실사 보기는 `/inventory/counts/<실사 번호>` | `src/app/inventory/counts/` · `src/lib/count-input.ts` · `src/db/stock-counts.ts` |
| 재고 현황 화면 | 재고 › 재고관리 › 품목별 재고 — 잔액(`stock_balances`)을 묶어 더하기만 한다(재고를 바꾸는 길은 재고 계산 하나, ADR 0023). 품목마다 실재고 · 검사대기 · 불량 · 가용재고 — 불량 · 검사대기 · 가용은 재고 계산이 내보내는 상태 구분(`stockBucket` — 불량창고가 먼저, 다음이 상태 검사대기, 나머지가 가용) 한 곳으로 가른다. 안전재고와 「미달」(안전재고 > 0 이고 가용재고 < 안전재고, 모자란 수량). 「사용」인 품목은 재고가 0 이어도, 「사용 안 함」 품목은 재고가 있을 때만 보인다. 찾기(품목코드 · 품목명) · 품목 유형 · 「미달만」으로 거르고, 칸 머리로 세우고 100줄씩 — 수불 이력과 같은 틀(거르기 · 칸 · 차례 · 쪽은 화면 주소에). 요청마다 읽고 결과를 재사용하지 않는다. 휴대폰 폭에서는 표를 옆으로 밀고 품목코드 · 품목명이 왼쪽에 남는다 | `src/app/inventory/status/` · `src/db/stock-status.ts` · `src/db/stock.ts` · `src/lib/stock-query.ts` |
| 공통코드 화면 | 시스템 관리 › 공통코드 — 묶음(Major) 목록과 한 묶음의 값(Minor) 목록, 사용자 코드 묶음의 값 추가 · 수정. 시스템 코드 묶음은 보이기만 하고, 서버도 바꾸는 요청을 거절한다. 프로그램이 기대는 사용자 코드 값(국가 `KR` · 조정 사유 `COUNT`)은 「사용 안 함」으로 바꾸지 못한다. 묶음 안의 겹침 · 등록 상한은 서버가 본다(ADR 0009). 단위(`UNIT`) 묶음은 값마다 기준 단위 · 배수 · 소수 자릿수(단위 사양)를 함께 보이고, 새 단위는 셋을 함께 넣고 수정은 자릿수만 고친다(ADR 0017) — 자릿수를 줄이는 것은 그 단위의 수불 수량이 다 맞을 때만 | `src/app/system/codes/` · `src/lib/code-input.ts` · `src/lib/unit-input.ts` · `src/db/codes.ts` |
| 설계도 화면 | 업무 흐름(스윔레인 · Overview) · 데이터 모델(모듈별 전체 지도 · 이 조각의 테이블) · 시스템 구성 그림. 메뉴 판 아래 「설계도」. 그림의 글과 스윔레인 데이터는 한 파일에 있고, 테이블 · 부품 · 흐름을 바꾸는 PR 이 함께 고친다(ADR 0006). 스윔레인은 서버에서 SVG 로, 모듈별 지도는 서버에서 카드로, 나머지는 브라우저의 Mermaid 가 그린다 | `src/app/design/` · `src/content/diagrams.ts` · `src/lib/swimlane.ts` · `src/components/swimlane.tsx` · `src/components/module-map.tsx` · `src/components/mermaid-diagram.tsx` |
| 상태 화면 | DB 에 닿는지 묻고 「연결됨」(DB 시각) 또는 「연결 안 됨」을 보인다. 「마지막 되돌림」(샘플을 마지막으로 넣은 시각 — 공통코드 묶음의 가장 이른 등록 시각)도 보인다. 결과를 재사용하고(1분이 지나면 다음 요청 때 새로 묻고, 최대 2분 지난 결과를 보일 수 있다) 검색 로봇을 막는다. 떠 있는 배포의 커밋도 보인다 | `src/app/health/` · `src/db/status.ts` |
| DB 접속 | 환경변수 `DATABASE_URL` 하나로 PostgreSQL 에 닿는다 — Drizzle ORM · postgres 드라이버. 내 컴퓨터의 DB 말고는 암호화하고 인증서를 확인한다 | `src/db/client.ts` |
| 테이블 | 기준정보 다섯(품목 · 창고 · 거래처 · 공통코드 묶음 · 값)과 재고 수불의 단위 사양 · 번호 규칙 · 번호 규칙의 일련 · 수불 전표 · 수불 줄 · 잔액 · 실사 · 실사 줄, 코드의 꼴 · 참조 제약, 마이그레이션 SQL(`docs/schema.md`) | `src/db/schema.ts` · `drizzle/` |
| DB 준비(배포 빌드) | 빌드의 첫 단계 — 마이그레이션을 적용하고, 빈 DB 면 샘플 데이터를 넣는다. 실패하면 빌드가 멈춰 배포가 나가지 않는다(ADR 0005) | `scripts/migrate.ts` · `src/db/deploy.ts` |
| 샘플 데이터 · 되돌림 | 가상 반도체 후공정 회사의 샘플과, 테이블을 비우고 샘플로 다시 채우는 되돌림. 샘플 수불 · 실사는 재고 계산 · 실사의 저장을 불러 되돌린 날에서 센 며칠 앞 날짜로 넣는다. 매일 밤 Vercel Cron 이 `CRON_SECRET` 을 붙여 입구를 부른다 — 비밀값이 틀리면 DB 에 닿지 않는다(ADR 0004) | `src/db/sample.ts` · `src/db/reset.ts` · `src/db/reset-request.ts` · `src/app/api/cron/reset/` · `vercel.json` |
| 코드 번호 | 같은 머리의 가장 큰 번호 + 1 | `src/db/numbering.ts` · 공통코드의 시스템 값 `src/lib/master-codes.ts` |
| 한국 날짜 | 서버의 시계(UTC)로 한국 시각의 오늘을 낸다 — 번호의 예와 수불 일자가 기댄다 | `src/lib/today.ts` |
| 정기 확인 | 하루 4번 데모의 `/health` 가 「연결됨」이고 `main` 의 최신 커밋이며 「마지막 되돌림」이 30시간 안인지 보고, 아니면 GitHub 가 메일로 알린다 | `.github/workflows/health-check.yml` |
| 자동 검사 | PR 과 `main` 에서 형식 · 린트 · 타입 · 시험 · 문서 모양과, 데모에 실리는 의존성의 알려진 약점(높음 이상)을 본다 | `.github/workflows/ci.yml` |
| 미리보기 DB 가지 지우기 | PR 이 머지되거나 닫히면 그 PR 의 미리보기 DB 가지(Neon `preview/<가지>`)를 지운다 — 무료 요금제의 가지 10개 한도가 차지 않게. 열쇠는 이 Neon 프로젝트 하나로 좁힌 API 키(GitHub 비밀값) | `.github/workflows/preview-db-cleanup.yml` |

## 흐름

```
브라우저 ── 웹 앱(Vercel) ── PostgreSQL(Neon 운영 DB)
         └─ 품목 · 거래처 · 창고 · 공통코드 · 번호 규칙 등록 · 수정, 품목 · 거래처 시트형 등록(서버 액션) ── 입력 검사 ── 운영 DB
         └─ 등록 메뉴 넷 · 취소(서버 액션) ── 꼴 검사 ── 재고 계산(잠금 · 수불 줄 · 음수 검사 · 잔액, 한 트랜잭션) ── 운영 DB
         └─ 재고 실사 저장 · 취소 · 확정(서버 액션) ── 꼴 검사 ── 실사 · 확정이면 재고 계산(같은 잠금 · 실사 차이 전표, 한 트랜잭션) ── 운영 DB
         └─ 수불 이력 · 수불부(주소의 거르기 · 칸 · 쪽) ── 수불 줄 읽기 ── 운영 DB
PR ── 자동 검사(GitHub Actions)
   └─ 미리보기 배포(Vercel) ── Neon 미리보기 분기 DB
   └─ 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 미리보기 분기 DB
PR 머지 · 닫힘 ── 미리보기 DB 가지 지우기(GitHub Actions) ── Neon API ── 그 PR 의 미리보기 분기 DB 를 지움
main 머지 ── 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 운영 DB
         └─ 운영 배포(Vercel)
예약(하루 4번) ── 정기 확인(GitHub Actions) ── 데모 /health
예약(하루 1번, 한국 04시대) ── Vercel Cron ── 데모 /api/cron/reset ── 운영 DB 를 샘플로
```

고정 화면(첫 화면 · 모듈 화면 · 설계도)은 빌드 때 만들어 Vercel 이 가까운 곳에서 내보낸다. 상태 화면의 DB 확인, 되돌림 입구, 품목 · 거래처 · 창고 · 공통코드
· 번호 규칙 · 수불 화면의 DB 읽기 · 쓰기는 요청이 올 때 돈다(상태 확인은 결과를 최대 2분 재사용, 기준정보 화면은 늘 새로 읽는다). 기준정보 화면의 틀(머리 · 메뉴)은 빌드 때 만들고 목록 · 입력 칸만 요청 때 채운다.
스택과 배포처를 고른 까닭은 ADR 0001 · 0002, 테이블과 마이그레이션은 `docs/schema.md`, 배포와 되돌리기는 `docs/deploy.md`.

## 시험

화면 부품의 시험은 Vitest 와 Testing Library 로, 부품 옆 `__tests__/` 에 둔다. DB 시험은 PGlite(내 컴퓨터의 메모리에서 도는
PostgreSQL)에 레포의 마이그레이션을 그대로 적용해 실제 SQL 을 돌린다 — 키 · 접속 정보가 필요 없다(`src/db/__tests__/pglite.ts`).
