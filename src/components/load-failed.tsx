import Link from "next/link";
import { DatabaseUnsetError } from "@/db/request";
import { describeFailure } from "@/db/status";
import { eul } from "@/lib/josa";

// DB 를 읽지 못했을 때의 화면. 로그에는 오류 코드만 남긴다(대장 NC-6).
export function LoadFailed({ what, error }: { what: string; error: unknown }) {
  const unset = error instanceof DatabaseUnsetError;
  console.error(`${what} 불러오기 실패: ${describeFailure(error, "code-only")}`);
  return (
    <div role="alert" className="mt-8 border-l-4 border-red-700 bg-white px-5 py-4">
      <p className="font-semibold">{eul(what)} 불러오지 못했습니다.</p>
      <p className="mt-1 text-sm text-muted">
        {unset ? "DB 가 설정되지 않았습니다. " : "잠시 뒤 다시 열어 보세요. "}
        <Link href="/health" prefetch={false} className="underline underline-offset-4">
          시스템 상태
        </Link>
        에서 DB 연결을 볼 수 있습니다.
      </p>
    </div>
  );
}
