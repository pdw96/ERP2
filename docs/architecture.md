# 시스템 구조

**살아 있는 문서**다. ERP2 의 부품과 그 사이의 흐름을 든다. 부품 · 경계 · 흐름을 바꾸는 구현 PR 이 이 문서도 고친다.

## 부품

| 부품 | 무엇 | 어디 |
|---|---|---|
| 웹 앱 | 화면과 서버를 한 앱으로 — Next.js(App Router) · TypeScript · Tailwind CSS | `src/` |
| 화면 틀 | 왼쪽 업무 영역 메뉴 판(넓은 화면). 휴대폰 폭에서는 위 머리줄이 되고 메뉴가 「메뉴」 단추 아래로 접힌다 | `src/app/layout.tsx` · `src/components/sidebar.tsx` |
| 첫 화면 | 자재가 들어와 제품으로 나가는 흐름도 — 단계마다 그 영역으로 간다 | `src/app/page.tsx` |
| 색 · 글꼴 | 색 이름(`machine` · `safety` · `floor` 등)과 IBM Plex Sans KR | `src/app/globals.css` |
| 업무 영역 목록 | 메뉴와 영역 화면이 함께 읽는 영역 여섯(재고 · 생산 · 구매 · 영업 · 회계 · 인사)과 영역마다 한 줄 설명 | `src/lib/areas.ts` |
| 영역 화면 | 영역마다 한 주소(`/inventory` · `/production` · `/purchasing` · `/sales` · `/accounting` · `/hr`) | `src/app/<영역>/` |
| 설계도 화면 | 업무 흐름(스윔레인 · Overview) · 데이터 모델 · 시스템 구성 그림. 메뉴 판 아래 「설계도」. 그림의 글과 스윔레인 데이터는 한 파일에 있고, 테이블 · 부품 · 흐름을 바꾸는 PR 이 함께 고친다(ADR 0006). 스윔레인은 서버에서 SVG 로, 나머지는 브라우저의 Mermaid 가 그린다 | `src/app/design/` · `src/content/diagrams.ts` · `src/lib/swimlane.ts` · `src/components/swimlane.tsx` · `src/components/mermaid-diagram.tsx` |
| 상태 화면 | DB 에 닿는지 묻고 「연결됨」(DB 시각) 또는 「연결 안 됨」을 보인다. 결과를 1분 재사용하고 검색 로봇을 막는다. 떠 있는 배포의 커밋도 보인다 | `src/app/health/` · `src/db/status.ts` |
| DB 접속 | 환경변수 `DATABASE_URL` 하나로 PostgreSQL 에 닿는다 — Drizzle ORM · postgres 드라이버. 내 컴퓨터의 DB 말고는 암호화하고 인증서를 확인한다 | `src/db/client.ts` |
| 정기 확인 | 하루 4번 데모의 `/health` 가 「연결됨」이고 `main` 의 최신 커밋인지 보고, 아니면 GitHub 가 메일로 알린다 | `.github/workflows/health-check.yml` |
| 자동 검사 | PR 과 `main` 에서 형식 · 린트 · 타입 · 시험 · 문서 모양을 본다 | `.github/workflows/ci.yml` |

## 흐름

```
브라우저 ── 웹 앱(Vercel) ── PostgreSQL(Neon 운영 DB)
PR ── 자동 검사(GitHub Actions)
   └─ 미리보기 배포(Vercel) ── Neon 미리보기 분기 DB
main 머지 ── 운영 배포(Vercel)
예약(하루 4번) ── 정기 확인(GitHub Actions) ── 데모 /health
```

고정 화면(첫 화면 · 영역 화면 · 설계도)은 빌드 때 만들어 Vercel 이 가까운 곳에서 내보내고, 상태 화면의 DB 확인만 요청이 올 때 돈다(1분 재사용).
스택과 배포처를 고른 까닭은 ADR 0001 · 0002, 테이블과 마이그레이션은 `docs/schema.md`, 배포와 되돌리기는 `docs/deploy.md`.

## 시험

화면 부품의 시험은 Vitest 와 Testing Library 로, 부품 옆 `__tests__/` 에 둔다.
