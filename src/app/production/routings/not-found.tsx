import Link from "next/link";

export default function RoutingNotFound() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl leading-tight font-semibold">없는 라우팅입니다</h1>
      <p className="mt-2 text-muted">품목코드를 확인하거나 목록에서 다시 고르세요.</p>
      <Link href="/production/routings" className="mt-6 inline-block underline underline-offset-4">
        라우팅 목록으로
      </Link>
    </section>
  );
}
