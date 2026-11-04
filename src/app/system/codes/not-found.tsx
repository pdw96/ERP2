import Link from "next/link";

export default function CodeNotFound() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl leading-tight font-semibold">없는 묶음이나 값입니다</h1>
      <p className="mt-2 text-muted">
        코드를 확인하거나 목록에서 다시 고르세요. 시스템 코드 묶음에는 값을 더하거나 고치는 화면이 없습니다.
      </p>
      <Link href="/system/codes" className="mt-6 inline-block underline underline-offset-4">
        공통코드 목록으로
      </Link>
    </section>
  );
}
