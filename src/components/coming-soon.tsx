import { areaByHref } from "@/lib/areas";

export function ComingSoon({ href }: { href: string }) {
  const area = areaByHref(href);
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">{area.label}</h1>
      <p className="text-gray-600">준비 중입니다.</p>
    </section>
  );
}
