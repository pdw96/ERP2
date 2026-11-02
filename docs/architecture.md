# 시스템 구조

**살아 있는 문서**다. ERP2 의 부품과 그 사이의 흐름을 든다. 부품 · 경계 · 흐름을 바꾸는 구현 PR 이 이 문서도 고친다.

## 부품

| 부품 | 무엇 | 어디 |
|---|---|---|
| 웹 앱 | 화면과 서버를 한 앱으로 — Next.js(App Router) · TypeScript · Tailwind CSS | `src/` |
| 화면 틀 | 위 머리줄과 왼쪽 업무 영역 메뉴. 휴대폰 폭에서는 메뉴가 「메뉴」 단추 아래로 접힌다 | `src/app/layout.tsx` · `src/components/sidebar.tsx` |
| 업무 영역 목록 | 메뉴와 영역 화면이 함께 읽는 영역 여섯(재고 · 생산 · 구매 · 영업 · 회계 · 인사) | `src/lib/areas.ts` |
| 영역 화면 | 영역마다 한 주소(`/inventory` · `/production` · `/purchasing` · `/sales` · `/accounting` · `/hr`) | `src/app/<영역>/` |
| 자동 검사 | PR 과 `main` 에서 형식 · 린트 · 타입 · 시험 · 문서 모양을 본다 | `.github/workflows/ci.yml` |

## 흐름

```
브라우저 ── 웹 앱(Vercel)
PR ── 자동 검사(GitHub Actions) · 미리보기 배포(Vercel)
main 머지 ── 운영 배포(Vercel)
```

DB(PostgreSQL · Neon)와 배포는 조각 「기반」 설계 ⑥ 의 PR B 가 이 문서에 더한다. 스택과 배포처를 고른 까닭은 ADR 0001 · 0002.

## 시험

화면 부품의 시험은 Vitest 와 Testing Library 로, 부품 옆 `__tests__/` 에 둔다.
