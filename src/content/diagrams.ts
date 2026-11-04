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
    { id: "b2", lane: "구매", row: 10, kind: "step", text: "구매 반품 · 재발주\n매입 차감" },
    { id: "pt", lane: "생산", row: 10, kind: "ends", text: "신규 품목 시생산" },
    { id: "pm", lane: "생산", row: 11, kind: "step", text: "수동 작업지시 입력\n긴급 · 시생산" },
    { id: "p3", lane: "생산", row: 12, kind: "step", text: "작업지시 확정\n라우팅으로 공정 분할" },
    { id: "p4", lane: "생산", row: 13, kind: "step", text: "자재 출고 요청" },
    { id: "i3", lane: "재고", row: 14, kind: "step", text: "현장으로 자재 출고" },
    { id: "p5", lane: "생산", row: 15, kind: "step", text: "공정별 생산 · 실적\n생산 LOT 부여" },
    { id: "q3", lane: "품질", row: 16, kind: "ask", text: "공정검사\n합격?" },
    { id: "i4", lane: "재고", row: 17, kind: "step", text: "완제품 입고" },
    { id: "q4", lane: "품질", row: 18, kind: "step", text: "불량 유형 기록 · 격리" },
    { id: "q8", lane: "품질", row: 19, kind: "ask", text: "처분 판정\n재작업 · 폐기?" },
    { id: "i8", lane: "재고", row: 19, kind: "step", text: "폐기 출고\n불량창고 · 사유" },
    { id: "a6", lane: "회계", row: 19, kind: "step", text: "폐기 손실 전표" },
    { id: "s3", lane: "영업", row: 20, kind: "step", text: "출하 요청" },
    { id: "q5", lane: "품질", row: 21, kind: "ask", text: "출하검사\n합격?" },
    { id: "i5", lane: "재고", row: 22, kind: "step", text: "제품 출고" },
    { id: "s4", lane: "영업", row: 23, kind: "step", text: "매출 확정" },
    { id: "a2", lane: "회계", row: 23, kind: "step", text: "매출 전표" },
    { id: "s5", lane: "영업", row: 24, kind: "ends", text: "고객 반품 요청" },
    { id: "s6", lane: "영업", row: 25, kind: "step", text: "반품 접수\n매출 차감" },
    { id: "a5", lane: "회계", row: 25, kind: "step", text: "매출 차감 전표" },
    { id: "i6", lane: "재고", row: 26, kind: "step", text: "반품 입고\n검사대기" },
    { id: "q6", lane: "품질", row: 27, kind: "ask", text: "반품 판정\n합격?" },
    { id: "i7", lane: "재고", row: 28, kind: "step", text: "가용 재고로" },
    { id: "q7", lane: "품질", row: 28, kind: "step", text: "불량 격리\n처분 판정: 재작업 · 폐기" },
    { id: "a3", lane: "회계", row: 29, kind: "step", text: "월 마감" },
    { id: "a4", lane: "회계", row: 30, kind: "ends", text: "끝" },
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
    { from: "q4", to: "q8" },
    { from: "q8", to: "p5", label: "재작업" },
    { from: "q8", to: "i8", label: "폐기" },
    { from: "i8", to: "a6" },
    { from: "i4", to: "s3" },
    { from: "s3", to: "q5" },
    { from: "q5", to: "i5", label: "예" },
    { from: "q5", to: "q4", label: "아니오" },
    { from: "i5", to: "s4" },
    { from: "s4", to: "a2" },
    { from: "a2", to: "a3" },
    { from: "s5", to: "s6" },
    { from: "s6", to: "a5" },
    { from: "s6", to: "i6" },
    { from: "i6", to: "q6" },
    { from: "q6", to: "i7", label: "예" },
    { from: "q6", to: "q7", label: "아니오" },
    { from: "a5", to: "a3" },
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
  QC -- "합격품 입고 · 불합격 격리 · 폐기" --> INV
  QC -- "반품" --> PUR
  PRD -- "생산품" --> QC
  QC -- "재작업" --> PRD
  SAL -- "출하 요청 · 고객 반품" --> QC
  INV -- "출고" --> SAL
  PUR -- "매입" --> ACC
  SAL -- "매출" --> ACC
  HR -. "사용자 · 권한" .-> SAL
  MD -. "모든 부서가 씀" .-> INV
${CLASSES}`;

// 데이터 모델 ① 모듈별 전체 지도 — 모듈(왼쪽 메뉴 순서)마다 테이블 이름과 그것을 만드는 조각.
// 예정 테이블의 이름과 관계는 그 조각의 착공에서 다시 정한다. 모듈 사이의 선이 많아 그림 대신 카드로 보인다.
export type MapTable = { id: string; name: string; table?: string; slice: string };
export type MapModule = { module: string; tables: readonly MapTable[] };

/** 지금 짓는 조각 — 지도에서 이 조각의 테이블을 따로 표시한다. */
export const CURRENT_SLICE = "기준정보";

export const MODULE_MAP: readonly MapModule[] = [
  {
    module: "기준정보",
    tables: [
      { id: "items", name: "품목", table: "items", slice: "기준정보" },
      { id: "partners", name: "거래처", table: "partners", slice: "기준정보" },
    ],
  },
  {
    module: "영업",
    tables: [
      { id: "sprice", name: "판매 단가", slice: "영업" },
      { id: "so", name: "수주", slice: "영업" },
      { id: "splan", name: "판매계획", slice: "MPS" },
      { id: "shipreq", name: "출하요청", slice: "영업" },
      { id: "ship", name: "출하", slice: "영업" },
      { id: "sales", name: "매출", slice: "영업" },
      { id: "sret", name: "반품(고객)", slice: "영업" },
    ],
  },
  {
    module: "구매",
    tables: [
      { id: "supplier", name: "공급처 · 구매 단가", slice: "구매" },
      { id: "po", name: "발주", slice: "구매" },
      { id: "rcv", name: "입고", slice: "구매" },
      { id: "purch", name: "매입", slice: "구매" },
      { id: "pret", name: "구매 반품", slice: "구매" },
    ],
  },
  {
    module: "재고",
    tables: [
      { id: "warehouses", name: "창고", table: "warehouses", slice: "기준정보" },
      { id: "txn", name: "수불", slice: "재고 수불" },
      { id: "stock", name: "현재고 — 품목 × 창고 × LOT · 상태", slice: "재고 수불" },
      { id: "lot", name: "LOT", slice: "재고 수불" },
      { id: "alloc", name: "할당", slice: "재고 수불" },
      { id: "count", name: "실사", slice: "재고 수불" },
    ],
  },
  {
    module: "생산",
    tables: [
      { id: "bom", name: "BOM", slice: "BOM" },
      { id: "route", name: "공정 · 작업장 · 라우팅", slice: "라우팅" },
      { id: "cal", name: "근무 캘린더 · 작업장 능력", slice: "능력계획(CRP)" },
      { id: "mps", name: "MPS", slice: "MPS" },
      { id: "plo", name: "계획오더", slice: "MRP" },
      { id: "wo", name: "작업지시", slice: "작업지시" },
      { id: "result", name: "생산실적", slice: "생산실적" },
    ],
  },
  {
    module: "품질",
    tables: [
      { id: "defect", name: "불량 유형", slice: "라우팅" },
      { id: "insp", name: "검사 항목 · 기준", slice: "품질" },
      { id: "qrec", name: "검사 기록", slice: "품질" },
      { id: "disp", name: "불량 처분 — 재작업 · 폐기", slice: "품질" },
    ],
  },
  {
    module: "회계",
    tables: [
      { id: "acct", name: "계정과목", slice: "회계" },
      { id: "jv", name: "전표", slice: "회계" },
    ],
  },
  {
    module: "인사",
    tables: [
      { id: "dept", name: "부서 · 직급", slice: "인사" },
      { id: "emp", name: "사원", slice: "인사" },
    ],
  },
  {
    module: "시스템 관리",
    tables: [
      { id: "code_groups", name: "공통코드 묶음", table: "code_groups", slice: "기준정보" },
      { id: "codes", name: "공통코드 값", table: "codes", slice: "기준정보" },
      { id: "company", name: "회사 정보", slice: "인사" },
      { id: "users", name: "사용자 · 권한", slice: "인사" },
    ],
  },
];

/** 모듈 사이의 주요 흐름 — 한 줄이 「앞 테이블의 기록이 뒤 테이블을 만든다」. 품목 · 거래처 · 공통코드는 모두가 써서 뺀다. */
export const MODULE_FLOWS: readonly (readonly string[])[] = [
  ["so", "mps", "plo"],
  ["splan", "mps"],
  ["bom", "plo"],
  ["plo", "wo", "result", "txn", "stock"],
  ["plo", "po", "rcv", "txn"],
  ["wo", "alloc", "stock"],
  ["shipreq", "alloc"],
  ["shipreq", "ship", "txn"],
  ["count", "txn"],
  ["rcv", "qrec"],
  ["qrec", "disp", "txn"],
  ["disp", "jv"],
  ["result", "qrec"],
  ["rcv", "purch", "jv"],
  ["ship", "sales", "jv"],
  ["qrec", "pret", "txn"],
  ["pret", "purch"],
  ["sret", "txn"],
  ["sret", "qrec"],
  ["sret", "sales"],
  ["dept", "emp", "users"],
];

// 데이터 모델 ② 이 조각의 테이블 — 조각 「기준정보」가 만드는 다섯과 그 칸.
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
    text cls1 "공통코드 ITEM_CLS1 — 대분류(종류) · 비워도 됨"
    text cls2 "공통코드 ITEM_CLS2 — 중분류(패키지) · 비워도 됨"
    text cls3 "공통코드 ITEM_CLS3 — 소분류(용도) · 비워도 됨"
    text note "비고"
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
    text country "공통코드 COUNTRY — KR · US · JP …"
    text biz_no "사업자등록번호 — 한국"
    text foreign_biz_no "해외 사업자번호 — 한국 밖"
    text ceo "대표자"
    text biz_type "업태"
    text biz_item "종목"
    text address "주소"
    text phone "전화"
    text email "이메일"
    text contact_name "담당자"
    text contact_phone "담당자 연락처"
    text note "비고"
    boolean active "사용 여부"
  }
  CODE_GROUPS["공통코드 묶음 code_groups (Major)"] {
    text code UK "ITEM_TYPE · PROC_TYPE · UNIT · COUNTRY · ITEM_CLS1 ~ 3"
    text name "이름"
    boolean is_system "시스템 코드 — 화면에서 못 고침"
  }
  CODES["공통코드 값 codes (Minor)"] {
    text group_code FK "묶음 — 묶음 + 코드가 겹치지 않음(UK)"
    text code "RM · BUY · EA · KR …"
    text name "이름"
    int sort_order "정렬 순서"
    boolean active "사용 여부"
  }
  CODE_GROUPS ||--o{ CODES : "묶음의 값"
  CODES ||--o{ ITEMS : "유형 · 조달구분 · 단위 · 분류"
  CODES ||--o{ PARTNERS : "국가"`;

// 시스템 구성 — 화면 · 서버 · DB · 자동 검사 · 알림.
export const SYSTEM = `flowchart LR
  AUTHOR(["저자 pdw96"])
  U(["방문자 · 채용 담당자<br/>브라우저 · 휴대폰"])
  subgraph G["GitHub"]
    PR["PR"]:::done
    CI["자동 검사<br/>형식 · 린트 · 타입 · 시험 · 문서 · 의존성 약점"]:::done
    HC["정기 확인 — 하루 4번<br/>연결됨 · 최신 커밋"]:::done
  end
  subgraph V["Vercel — 앱"]
    PREV["PR 미리보기 배포"]:::done
    APP["데모 — Next.js 앱<br/>화면 + 서버"]:::done
    CRON["매일 밤 되돌림 — 한국 04시대<br/>Vercel Cron · 비밀값"]:::done
  end
  subgraph N["Neon — PostgreSQL"]
    DBP[("미리보기 DB<br/>PR 마다 분기")]:::done
    DBM[("운영 DB<br/>main 분기")]:::done
  end
  AUTHOR -- "PR 을 보고 머지" --> PR
  PR --> CI
  PR -- "올리면" --> PREV
  PR -- "머지하면" --> APP
  PREV -- "읽고 쓰기 · 빌드 때 마이그레이션" --> DBP
  U --> APP
  APP -- "읽고 쓰기 · 빌드 때 마이그레이션" --> DBM
  HC -- "/health" --> APP
  HC -. "실패하면 메일" .-> AUTHOR
  CRON -- "/api/cron/reset" --> APP
  APP -. "샘플로 되돌림" .-> DBM
${CLASSES}`;
