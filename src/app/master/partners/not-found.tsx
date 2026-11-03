import Link from "next/link";

export default function PartnerNotFound() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl leading-tight font-semibold">없는 거래처입니다</h1>
      <p className="mt-2 text-muted">코드를 확인하거나 목록에서 다시 고르세요.</p>
      <Link href="/master/partners" className="mt-6 inline-block underline underline-offset-4">
        거래처 목록으로
      </Link>
    </section>
  );
}
