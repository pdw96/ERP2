import type { Metadata } from "next";
import { DesignTabs } from "@/components/design-tabs";

export const metadata: Metadata = {
  title: "설계도 — ERP2",
  description: "ERP2 의 업무 흐름 · 데이터 모델 · 시스템 구성을 그림으로 본다",
};

export default function DesignLayout({ children }: LayoutProps<"/design">) {
  return (
    <section>
      <h1 className="text-3xl leading-tight font-semibold">설계도</h1>
      <p className="mt-2 max-w-2xl text-muted">
        ERP2 가 어떻게 지어지는지 그림으로 봅니다. 조각이 바뀔 때마다 그 조각의 PR 이 그림도 고칩니다. 그림이 화면보다
        넓으면 옆으로 밀어 보세요.
      </p>
      <DesignTabs />
      <div className="mt-8">{children}</div>
    </section>
  );
}
