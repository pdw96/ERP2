import { areaByHref } from "@/lib/areas";

export function ComingSoon({ href }: { href: string }) {
  const area = areaByHref(href);
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl leading-tight font-semibold">{area.label}</h1>
      <p className="mt-2 text-muted">{area.summary}</p>
      <div className="mt-8 border-l-4 border-safety bg-white px-5 py-4">
        <p className="font-semibold">준비 중입니다.</p>
        <p className="mt-1 text-sm text-muted">이 영역의 화면과 샘플 데이터는 차례로 열립니다.</p>
      </div>
    </section>
  );
}
