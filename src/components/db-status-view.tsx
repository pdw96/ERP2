import type { DbStatus } from "@/db/status";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});

export function DbStatusView({ status }: { status: DbStatus }) {
  if (status.state === "connected") {
    return (
      <div className="border-l-4 border-machine bg-white px-5 py-4">
        <p className="font-semibold">연결됨</p>
        <p className="mt-1 text-sm text-muted">DB 시각 {timeFormat.format(status.now)} (한국 시간)</p>
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
