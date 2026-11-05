import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadFailed } from "@/components/load-failed";
import { countryOptions, getPartner, partnersSharingBizNo, type Partner } from "@/db/partners";
import { withDb } from "@/db/request";
import type { PartnerValues } from "@/lib/partner-fields";
import { updatePartnerAction } from "../actions";
import { PartnerForm } from "../partner-form";

export const metadata: Metadata = { title: "거래처 수정 — ERP2" };

// 기준정보 › 거래처 등록 › 한 거래처의 수정. 주소는 거래처 코드다 — 코드는 바뀌지 않는다.
export default function EditPartnerPage({ params }: PageProps<"/master/partners/[code]">) {
  return (
    <section>
      <p className="text-sm text-muted">
        <Link href="/master" className="underline-offset-4 hover:underline">
          기준정보
        </Link>{" "}
        ›{" "}
        <Link href="/master/partners" className="underline-offset-4 hover:underline">
          거래처 등록
        </Link>{" "}
        › 수정
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">불러오는 중입니다.</p>}>
        <EditPartner params={params} />
      </Suspense>
    </section>
  );
}

const asValues = (p: Partner): PartnerValues => ({
  name: p.name,
  isSupplier: p.isSupplier ? "on" : "off",
  isCustomer: p.isCustomer ? "on" : "off",
  country: p.country,
  bizNo: p.bizNo ?? "",
  foreignBizNo: p.foreignBizNo ?? "",
  ceo: p.ceo,
  bizType: p.bizType,
  bizItem: p.bizItem,
  address: p.address,
  phone: p.phone,
  email: p.email,
  contactName: p.contactName,
  contactPhone: p.contactPhone,
  note: p.note,
  active: p.active ? "Y" : "N",
});

async function EditPartner({ params }: Pick<PageProps<"/master/partners/[code]">, "params">) {
  const { code } = await params;
  await connection();
  let data;
  try {
    data = await withDb(async (db) => {
      const partner = await getPartner(db, decodeURIComponent(code));
      return (
        partner && {
          partner,
          sharedBizNo: await partnersSharingBizNo(db, partner),
          countries: await countryOptions(db, partner.country),
        }
      );
    });
  } catch (error) {
    return <LoadFailed what="거래처" error={error} />;
  }
  if (!data) notFound();
  const { partner, sharedBizNo, countries } = data;
  return (
    <>
      <h1 className="mt-1 text-3xl leading-tight font-semibold wrap-anywhere">
        <span className="font-mono">{partner.code}</span> {partner.name}
      </h1>
      <PartnerForm
        mode="edit"
        code={partner.code}
        action={updatePartnerAction.bind(null, partner.code)}
        initial={asValues(partner)}
        sharedBizNo={sharedBizNo}
        countries={countries}
      />
    </>
  );
}
