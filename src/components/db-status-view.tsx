import type { DbStatus } from "@/db/status";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

// 「마지막 되돌림」은 정기 확인(.github/workflows/health-check.yml)이 글자로 읽는다 — `YYYY-MM-DD HH:MM`(한국 시간) 꼴을 바꾸지 않는다.
const resetFormat = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Seoul",
});

export function DbStatusView({ status }: { status: DbStatus }) {
  if (status.state === "connected") {
    return (
      <div className="border-l-4 border-machine bg-white px-5 py-4">
        <p className="font-semibold">연결됨</p>
        <p className="mt-1 text-sm text-muted">DB 시각 {timeFormat.format(status.now)} (한국 시간)</p>
        <p className="mt-1 text-sm text-muted">
          {status.lastReset
            ? `마지막 되돌림 ${resetFormat.format(status.lastReset)} (한국 시간) — 매일 새벽 4시에 샘플 데이터로 돌아갑니다`
            : "마지막 되돌림 알 수 없음 — 샘플 데이터가 들어 있지 않습니다"}
        </p>
      </div>
    );
  }
  return (
    <div className="border-l-4 border-safety bg-white px-5 py-4">
      <p className="font-semibold">연결 안 됨</p>
      <p className="mt-1 text-sm text-muted">
        {status.state === "unset"
          ? "DB 접속 정보가 설정되지 않았습니다. 배포 설정의 환경변수 DATABASE_URL을 확인하세요."
          : "DB에 닿지 못했습니다. 잠시 뒤 새로고침하고, 계속되면 배포 기록의 오류를 확인하세요."}
      </p>
    </div>
  );
}
