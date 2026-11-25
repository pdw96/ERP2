# 시스템 구조 — 지도

**살아 있는 문서**다. 어디를 보면 무엇이 있는지만 든다. 화면 · 표 · 검사의 세부는 코드가 들고, 왜 그렇게 정했는지는 ADR 이 든다 — 여기에 옮겨 적지 않는다(ADR 0039).
폴더를 새로 만들거나 아래 흐름이 바뀔 때만 고친다. 메뉴 하나를 더하는 것으로는 고치지 않는다.

## 폴더

| 어디 | 무엇 |
|---|---|
| `src/app/<모듈>/<메뉴>/` | 화면과 서버 액션. 모듈 주소는 `/master` · `/sales` · `/purchasing` · `/inventory` · `/production` · `/quality` · `/accounting` · `/hr` · `/system` |
| `src/lib/areas.ts` | 모듈 · 메뉴 목록 — 왼쪽 메뉴와 모듈 화면이 함께 읽는다. 지은 메뉴만 주소를 갖는다 |
| `src/lib/*-input.ts` | 화면이 보낸 값의 검사(`zod`) |
| `src/db/` | DB 읽기 · 쓰기. 표의 정의는 `schema.ts`, 마이그레이션은 `drizzle/` |
| `src/db/stock.ts` | **재고를 바꾸는 유일한 길** — 수불 저장 · 취소, 실사 차이, 음수 검사, 잔액을 한 트랜잭션에서 한 잠금을 쥐고 한다. 다른 화면 · 샘플 · 뒤 메뉴는 이 함수를 부른다 |
| `src/db/sample.ts` · `reset.ts` | 샘플 데이터(가상 반도체 후공정 회사)와 매일 밤 되돌림 |
| `src/components/` | 여러 화면이 같이 쓰는 부품(시트 · 조회 표 · 입력 칸 · 쪽 넘김) |
| `src/content/diagrams.ts` | 데모의 「설계도」 화면의 글과 그림 데이터 |
| `scripts/migrate.ts` | 배포 빌드의 첫 단계 — 마이그레이션, 빈 DB 면 샘플 |
| `.github/workflows/` | 자동 검사(`ci.yml`) · 정기 확인(`health-check.yml`) · 미리보기 DB 가지 지우기 |

## 흐름

```
브라우저 ── 웹 앱(Vercel, Next.js) ── 서버 액션 ── 입력 검사 ── src/db ── PostgreSQL(Neon)
                                                     └ 재고를 바꾸면 늘 src/db/stock.ts
PR ── 자동 검사(GitHub Actions) · 미리보기 배포(Vercel) ── Neon 미리보기 가지 DB(빌드가 마이그레이션 · 빈 DB 면 샘플)
PR 머지 · 닫힘 ── 그 PR 의 미리보기 DB 가지를 지움
main 머지 ── 빌드(마이그레이션 · 빈 DB 면 샘플) ── 운영 배포
예약 하루 4번 ── 데모 /health 확인 ── 틀리면 GitHub 가 메일로 알림
예약 하루 1번(한국 04시대) ── Vercel Cron ── /api/cron/reset ── 운영 DB 를 샘플로 되돌림
```

스택 · 배포처의 까닭은 ADR 0001 · 0002, DB 를 다루는 규칙은 `docs/schema.md`, 배포와 되돌리기는 `docs/deploy.md`.

## 시험

화면 부품의 시험은 Vitest 와 Testing Library 로 부품 옆 `__tests__/` 에 둔다. DB 시험은 PGlite(메모리에서 도는 PostgreSQL)에 레포의 마이그레이션을
그대로 적용해 실제 SQL 을 돌린다 — 키 · 접속 정보가 필요 없다(`src/db/__tests__/pglite.ts`). PGlite 는 연결이 하나라 동시 저장(잠금)은 시험하지 못한다(이슈 #66 ②).
