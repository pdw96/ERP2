// 설계도 화면(/design)의 그림 — 이 파일 하나가 든다(ADR 0006).
// 테이블 · 부품 · 흐름을 바꾸는 PR 이 같은 PR 에서 이 그림도 고친다.

// ── 업무 흐름: 스윔레인 ──────────────────────────────────────────────
// Mermaid 는 칸을 건너는 화살표가 있으면 칸 안의 방향을 지키지 못해, 칸 · 단계 · 화살표를 데이터로 적고
// 앱이 SVG 로 그린다(src/lib/swimlane.ts · src/components/swimlane.tsx).

export type SwimKind = "ends" | "step" | "ask"; // 시작 · 끝 / 작업 / 판단
export type SwimRoute = "r" | "lb" | "bl"; // 기본 길이 겹칠 때만 — r: 칸 오른쪽으로, lb: 왼쪽으로 나가 아래로 들어감, bl: 아래로 내려가 옆으로 들어감

export type SwimNode = { id: string; lane: string; row: number; kind: SwimKind; text: string };
export type SwimEdge = { from: string; to: string; label?: string; route?: SwimRoute; dashed?: boolean };
export type Swimlane = { lanes: readonly string[]; nodes: readonly SwimNode[]; edges: readonly SwimEdge[] };

export const SWIMLANE: Swimlane = {
  lanes: ["인사", "영업", "생산", "품질", "재고", "구매", "회계"],
  nodes: [
    { id: "h0", lane: "인사", row: 0, kind: "ends", text: "입사" },
    { id: "h1", lane: "인사", row: 1, kind: "step", text: "사원 등록" },
    { id: "h2", lane: "인사", row: 2, kind: "step", text: "사용자 · 권한 지정" },
    { id: "s0", lane: "영업", row: 0, kind: "ends", text: "고객 주문 · 예측" },
    { id: "s1", lane: "영업", row: 1, kind: "step", text: "수주 · 판매계획 등록" },
    { id: "s2", lane: "영업", row: 2, kind: "ask", text: "예정된 주문인가?" },
    { id: "p0", lane: "생산", row: 3, kind: "step", text: "MPS 수립\n주별 완제품 계획" },
    { id: "p1", lane: "생산", row: 4, kind: "step", text: "MRP 실행\nBOM 전개 · 순소요" },
    { id: "pc", lane: "생산", row: 5, kind: "ask", text: "작업장 능력\n안인가? (CRP)" },
    { id: "p2", lane: "생산", row: 6, kind: "ask", text: "계획오더의\n조달구분?" },
    { id: "b1", lane: "구매", row: 7, kind: "step", text: "발주 확정\n계획오더 · 긴급" },
    { id: "q1", lane: "품질", row: 8, kind: "ask", text: "수입검사\n합격?" },
    { id: "i2", lane: "재고", row: 9, kind: "step", text: "자재창고 입고\n거래처 LOT 그대로" },
    { id: "b3", lane: "구매", row: 9, kind: "step", text: "매입 확정" },
    { id: "a1", lane: "회계", row: 9, kind: "step", text: "매입 전표" },
    { id: "q2", lane: "품질", row: 10, kind: "step", text: "불량 유형 기록 · 격리\n처분: 반품" },
    { id: "b2", lane: "구매", row: 10, kind: "step", text: "반품 · 재발주" },
    { id: "pt", lane: "생산", row: 10, kind: "ends", text: "신규 품목 시생산" },
    { id: "pm", lane: "생산", row: 11, kind: "step", text: "수동 작업지시 입력\n긴급 · 시생산" },
    { id: "p3", lane: "생산", row: 12, kind: "step", text: "작업지시 확정\n라우팅으로 공정 분할" },
    { id: "p4", lane: "생산", row: 13, kind: "step", text: "자재 출고 요청" },
    { id: "i3", lane: "재고", row: 14, kind: "step", text: "현장으로 자재 출고" },
    { id: "p5", lane: "생산", row: 15, kind: "step", text: "공정별 생산 · 실적\n생산 LOT 부여" },
    { id: "q3", lane: "품질", row: 16, kind: "ask", text: "공정검사\n합격?" },
    { id: "i4", lane: "재고", row: 17, kind: "step", text: "완제품 입고" },
    { id: "q4", lane: "품질", row: 18, kind: "step", text: "불량 유형 기록 · 격리\n처분: 재작업" },
    { id: "s3", lane: "영업", row: 19, kind: "step", text: "출하 요청" },
    { id: "q5", lane: "품질", row: 20, kind: "ask", text: "출하검사\n합격?" },
    { id: "i5", lane: "재고", row: 21, kind: "step", text: "제품 출고" },
    { id: "s4", lane: "영업", row: 22, kind: "step", text: "매출 확정" },
    { id: "a2", lane: "회계", row: 22, kind: "step", text: "매출 전표" },
    { id: "a3", lane: "회계", row: 23, kind: "step", text: "월 마감" },
    { id: "a4", lane: "회계", row: 24, kind: "ends", text: "끝" },
  ],
  edges: [
    { from: "h0", to: "h1" },
    { from: "h1", to: "h2" },
    { from: "h2", to: "s1", label: "담당자", dashed: true },
    { from: "s0", to: "s1" },
    { from: "s1", to: "s2" },
    { from: "s2", to: "p0", label: "예" },
    { from: "s2", to: "pm", label: "아니오 — 긴급", route: "bl" },
    { from: "pt", to: "pm" },
    { from: "pm", to: "p3" },
    { from: "p0", to: "p1" },
    { from: "p1", to: "pc" },
    { from: "pc", to: "p2", label: "예" },
    { from: "pc", to: "p0", label: "아니오 · 조정" },
    { from: "p2", to: "b1", label: "구매" },
    { from: "p2", to: "p3", label: "생산", route: "r" },
    { from: "b1", to: "q1" },
    { from: "q1", to: "i2", label: "예" },
    { from: "q1", to: "q2", label: "아니오" },
    { from: "q2", to: "b2" },
    { from: "b2", to: "b1", route: "r" },
    { from: "i2", to: "b3" },
    { from: "b3", to: "a1" },
    { from: "i2", to: "i3" },
    { from: "p3", to: "p4" },
    { from: "p4", to: "i3" },
    { from: "i3", to: "p5" },
    { from: "p5", to: "q3" },
    { from: "q3", to: "i4", label: "예" },
    { from: "q3", to: "q4", label: "아니오" },
    { from: "q4", to: "p5", label: "재작업" },
    { from: "i4", to: "s3" },
    { from: "s3", to: "q5" },
    { from: "q5", to: "i5", label: "예" },
    { from: "q5", to: "q4", label: "아니오", route: "lb" },
    { from: "i5", to: "s4" },
    { from: "s4", to: "a2" },
    { from: "a2", to: "a3" },
    { from: "a3", to: "a4" },
  ],
};

// ── Mermaid 그림 ────────────────────────────────────────────────────
// 색 이름은 src/app/globals.css 와 같다 — dept·done 은 machine, doing 은 safety.

const CLASSES = `
  classDef dept fill:#2f4a40,stroke:#253b33,color:#ffffff
  classDef data fill:#f4f5f2,stroke:#456356,color:#1c2321
  classDef done fill:#2f4a40,stroke:#253b33,color:#ffffff
  classDef doing fill:#f2c230,stroke:#1c2321,color:#1c2321,stroke-width:2px`;

// 업무 흐름의 Overview — 부서 사이에 무엇이 오가는지 간추린다.
export const OVERVIEW = `flowchart LR
  SAL["<b>영업</b><br/>수주 · 출하 요청 · 매출"]:::dept
  PRD["<b>생산</b><br/>MPS · MRP · 작업지시 · 실적"]:::dept
  QC["<b>품질</b><br/>수입 · 공정 · 출하 검사"]:::dept
  INV["<b>재고</b><br/>입고 · 출고 · 이동 · 격리"]:::dept
  PUR["<b>구매</b><br/>발주 · 반품 · 매입"]:::dept
  ACC["<b>회계</b><br/>전표 · 채권채무 · 마감"]:::dept
  HR["<b>인사</b><br/>부서 · 사원 · 사용자"]:::dept
  MD[("기준정보<br/>품목 · 거래처 · 공통코드")]:::data
  SAL -- "수주 · 판매계획" --> PRD
  PRD -- "자재 출고 요청" --> INV
  PRD -- "구매 계획오더" --> PUR
  INV -. "가용재고 · 입고예정" .-> PRD
  PUR -- "입고품" --> QC
  QC -- "합격품 입고 · 불합격 격리" --> INV
  QC -- "반품" --> PUR
  PRD -- "생산품" --> QC
  QC -- "재작업" --> PRD
  SAL -- "출하 요청" --> QC
  INV -- "출고" --> SAL
  PUR -- "매입" --> ACC
  SAL -- "매출" --> ACC
  HR -. "사용자 · 권한" .-> SAL
  MD -. "모든 부서가 씀" .-> INV
${CLASSES}`;

// 데이터 모델 — 조각 「기준정보」가 만드는 다섯과, 뒤 조각이 더할 표.
export const DATA_MODEL = `erDiagram
  ITEMS["품목 items"] {
    text code UK "RM-0001 · SF-0001 · FG-0001"
    text name "품명"
    text spec "규격"
    text item_type "공통코드 ITEM_TYPE — RM · SF · FG"
    text procurement "공통코드 PROC_TYPE — 구매 · 생산"
    text unit "공통코드 UNIT — EA · M · KG · G …"
    boolean inspect_in "수입검사 대상"
    boolean inspect_out "출하검사 대상"
    int lead_time_days "리드타임(일)"
    numeric safety_stock "안전재고"
    numeric min_lot "최소 발주 · 생산량"
    numeric lot_multiple "발주 · 생산 배수"
    boolean active "사용 여부"
  }
  WAREHOUSES["창고 warehouses"] {
    text code UK "WH-01"
    text name "창고명"
    boolean active "사용 여부"
  }
  PARTNERS["거래처 partners"] {
    text code UK "BP-0001"
    text name "거래처명"
    boolean is_supplier "매입처"
    boolean is_customer "매출처"
    text biz_no "사업자등록번호"
    boolean active "사용 여부"
  }
  CODE_GROUPS["공통코드 묶음 code_groups (Major)"] {
    text code PK "ITEM_TYPE · PROC_TYPE · UNIT"
    text name "이름"
    boolean is_system "시스템 코드 — 화면에서 못 고침"
  }
  CODES["공통코드 값 codes (Minor)"] {
    text group_code FK "묶음"
    text code "RM · BUY · EA …"
    text name "이름"
    int sort_order "정렬 순서"
    boolean active "사용 여부"
  }
  STOCK["재고 수불 (예정)"] { }
  BOM["BOM (예정)"] { }
  PO["발주 (예정)"] { }
  QI["검사 기록 (예정 · 품질)"] { }
  PLAN["MPS · 계획오더 (예정 · MPS · MRP)"] { }
  ROUTE["라우팅 · 공정 · 작업장 (예정 · 라우팅)"] { }
  LOT["LOT (예정 · 재고 수불 · LOT 추적)"] { }
  SO["수주 (예정)"] { }
  CODE_GROUPS ||--o{ CODES : "묶음의 값"
  CODES ||--o{ ITEMS : "유형 · 조달구분 · 단위"
  ITEMS ||--o{ STOCK : "어떤 품목"
  WAREHOUSES ||--o{ STOCK : "어느 창고"
  ITEMS ||--o{ BOM : "모품목 · 자품목"
  PARTNERS ||--o{ PO : "매입처"
  PARTNERS ||--o{ SO : "매출처"
  ITEMS ||--o{ PO : "발주 품목"
  ITEMS ||--o{ SO : "수주 품목"
  ITEMS ||--o{ QI : "검사 품목"
  ITEMS ||--o{ PLAN : "계획 품목"
  ITEMS ||--o{ ROUTE : "공정 순서"
  ITEMS ||--o{ LOT : "LOT"`;

// 시스템 구성 — 화면 · 서버 · DB · 자동 검사 · 알림.
export const SYSTEM = `flowchart LR
  AUTHOR(["저자 pdw96"])
  U(["방문자 · 채용 담당자<br/>브라우저 · 휴대폰"])
  subgraph G["GitHub"]
    PR["PR"]:::done
    CI["자동 검사<br/>형식 · 린트 · 타입 · 시험 · 문서"]:::done
    HC["정기 확인 — 하루 4번<br/>연결됨 · 최신 커밋"]:::done
  end
  subgraph V["Vercel — 앱"]
    PREV["PR 미리보기 배포"]:::done
    APP["데모 — Next.js 앱<br/>화면 + 서버"]:::done
    CRON["매일 밤 되돌림<br/>(기준정보에서)"]:::doing
  end
  subgraph N["Neon — PostgreSQL"]
    DBP[("미리보기 DB<br/>PR 마다 분기")]:::done
    DBM[("운영 DB<br/>main 분기")]:::done
  end
  AUTHOR -- "PR 을 보고 머지" --> PR
  PR --> CI
  PR -- "올리면" --> PREV
  PR -- "머지하면" --> APP
  PREV --> DBP
  U --> APP
  APP --> DBM
  HC -- "/health" --> APP
  HC -. "실패하면 메일" .-> AUTHOR
  CRON -. "샘플로 되돌림" .-> DBM
${CLASSES}`;
