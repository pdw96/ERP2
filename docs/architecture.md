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
| 품목 화면 | 기준정보 › 품목의 목록(찾기 · 유형 · 조달구분 거르기 · 「사용 안 함 포함」) · 등록 · 수정. 저장은 서버 액션이 받고, 입력 검사(`zod`)와 단위 · 등록 상한 · 코드 번호는 서버가 본다. 실패 로그는 오류 코드만 | `src/app/master/items/` · `src/lib/item-input.ts` · `src/db/items.ts` · `src/db/request.ts` |
| 거래처 · 창고 화면 | 기준정보 › 거래처(찾기 · 매입처 · 매출처 거르기)와 재고 › 재고 기준정보 › 창고(찾기)의 목록 · 등록 · 수정 — 품목 화면과 같은 틀이다. 입력 칸 부품 · 저장 알림, 찾기 · DB 거절 읽기 · 잠금 안의 등록은 세 화면이 같이 쓴다 | `src/app/master/partners/` · `src/app/inventory/warehouses/` · `src/lib/partner-input.ts` · `src/lib/warehouse-input.ts` · `src/lib/input-common.ts` · `src/db/partners.ts` · `src/db/warehouses.ts` · `src/db/master-shared.ts` · `src/components/form-parts.tsx` |
| 공통코드 화면 | 시스템 관리 › 공통코드 — 묶음(Major) 목록과 한 묶음의 값(Minor) 목록, 사용자 코드 묶음의 값 추가 · 수정. 시스템 코드 묶음은 보이기만 하고, 서버도 바꾸는 요청을 거절한다. 묶음 안의 겹침 · 등록 상한은 서버가 본다(ADR 0009) | `src/app/system/codes/` · `src/lib/code-input.ts` · `src/db/codes.ts` |
| 설계도 화면 | 업무 흐름(스윔레인 · Overview) · 데이터 모델(모듈별 전체 지도 · 이 조각의 테이블) · 시스템 구성 그림. 메뉴 판 아래 「설계도」. 그림의 글과 스윔레인 데이터는 한 파일에 있고, 테이블 · 부품 · 흐름을 바꾸는 PR 이 함께 고친다(ADR 0006). 스윔레인은 서버에서 SVG 로, 모듈별 지도는 서버에서 카드로, 나머지는 브라우저의 Mermaid 가 그린다 | `src/app/design/` · `src/content/diagrams.ts` · `src/lib/swimlane.ts` · `src/components/swimlane.tsx` · `src/components/module-map.tsx` · `src/components/mermaid-diagram.tsx` |
| 상태 화면 | DB 에 닿는지 묻고 「연결됨」(DB 시각) 또는 「연결 안 됨」을 보인다. 결과를 1분 재사용하고 검색 로봇을 막는다. 떠 있는 배포의 커밋도 보인다 | `src/app/health/` · `src/db/status.ts` |
| DB 접속 | 환경변수 `DATABASE_URL` 하나로 PostgreSQL 에 닿는다 — Drizzle ORM · postgres 드라이버. 내 컴퓨터의 DB 말고는 암호화하고 인증서를 확인한다 | `src/db/client.ts` |
| 테이블 | 기준정보 다섯(품목 · 창고 · 거래처 · 공통코드 묶음 · 값)과 코드의 꼴 · 참조 제약, 마이그레이션 SQL(`docs/schema.md`) | `src/db/schema.ts` · `drizzle/` |
| DB 준비(배포 빌드) | 빌드의 첫 단계 — 마이그레이션을 적용하고, 빈 DB 면 샘플 데이터를 넣는다. 실패하면 빌드가 멈춰 배포가 나가지 않는다(ADR 0005) | `scripts/migrate.ts` · `src/db/deploy.ts` |
| 샘플 데이터 · 되돌림 | 가상 반도체 후공정 회사의 샘플과, 테이블을 비우고 샘플로 다시 채우는 되돌림. 매일 밤 Vercel Cron 이 `CRON_SECRET` 을 붙여 입구를 부른다 — 비밀값이 틀리면 DB 에 닿지 않는다(ADR 0004) | `src/db/sample.ts` · `src/db/reset.ts` · `src/db/reset-request.ts` · `src/app/api/cron/reset/` · `vercel.json` |
| 코드 번호 | 같은 머리의 가장 큰 번호 + 1 | `src/db/numbering.ts` · 공통코드의 시스템 값 `src/lib/master-codes.ts` |
| 정기 확인 | 하루 4번 데모의 `/health` 가 「연결됨」이고 `main` 의 최신 커밋인지 보고, 아니면 GitHub 가 메일로 알린다 | `.github/workflows/health-check.yml` |
| 자동 검사 | PR 과 `main` 에서 형식 · 린트 · 타입 · 시험 · 문서 모양과, 데모에 실리는 의존성의 알려진 약점(높음 이상)을 본다 | `.github/workflows/ci.yml` |

## 흐름

```
브라우저 ── 웹 앱(Vercel) ── PostgreSQL(Neon 운영 DB)
         └─ 품목 · 거래처 · 창고 · 공통코드 등록 · 수정(서버 액션) ── 입력 검사 ── 운영 DB
PR ── 자동 검사(GitHub Actions)
   └─ 미리보기 배포(Vercel) ── Neon 미리보기 분기 DB
   └─ 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 미리보기 분기 DB
main 머지 ── 빌드: 마이그레이션 · 빈 DB 면 샘플 ── 운영 DB
         └─ 운영 배포(Vercel)
예약(하루 4번) ── 정기 확인(GitHub Actions) ── 데모 /health
예약(하루 1번, 한국 04시대) ── Vercel Cron ── 데모 /api/cron/reset ── 운영 DB 를 샘플로
```

고정 화면(첫 화면 · 모듈 화면 · 설계도)은 빌드 때 만들어 Vercel 이 가까운 곳에서 내보낸다. 상태 화면의 DB 확인, 되돌림 입구, 품목 · 거래처 · 창고 · 공통코드
화면의 DB 읽기 · 쓰기는 요청이 올 때 돈다(상태 확인은 1분 재사용, 기준정보 화면은 늘 새로 읽는다). 기준정보 화면의 틀(머리 · 메뉴)은 빌드 때 만들고 목록 · 입력 칸만 요청 때 채운다.
스택과 배포처를 고른 까닭은 ADR 0001 · 0002, 테이블과 마이그레이션은 `docs/schema.md`, 배포와 되돌리기는 `docs/deploy.md`.

## 시험

화면 부품의 시험은 Vitest 와 Testing Library 로, 부품 옆 `__tests__/` 에 둔다. DB 시험은 PGlite(내 컴퓨터의 메모리에서 도는
PostgreSQL)에 레포의 마이그레이션을 그대로 적용해 실제 SQL 을 돌린다 — 키 · 접속 정보가 필요 없다(`src/db/__tests__/pglite.ts`).
