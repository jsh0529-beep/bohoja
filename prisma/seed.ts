import { PrismaClient, PublicationStatus } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  await Promise.all([
    prisma.plan.upsert({ where: { code: "free" }, update: {}, create: { code: "free", name: "무료", priceKrw: 0, benefitsJson: { activeCases: 1, familyMembers: 5, documents: 3 } } }),
    prisma.plan.upsert({ where: { code: "hospital-pass" }, update: {}, create: { code: "hospital-pass", name: "입원 패스", priceKrw: 6900, billingPeriodDays: 60, benefitsJson: { aiExtractions: 30, familyMembers: "unlimited", pdfExport: true, zipExport: true } } }),
    prisma.plan.upsert({ where: { code: "family-care-monthly" }, update: {}, create: { code: "family-care-monthly", name: "가족 케어 월간", priceKrw: 4900, billingPeriodDays: 30, benefitsJson: { activeCases: 3, retentionDays: 365 } } }),
    prisma.plan.upsert({ where: { code: "family-care-yearly" }, update: {}, create: { code: "family-care-yearly", name: "가족 케어 연간", priceKrw: 39000, billingPeriodDays: 365, benefitsJson: { activeCases: 3, retentionDays: 365 } } }),
  ]);

  const policyBody = "[개발용 초안] 실제 출시 전 법률 전문가 검토와 사업자 정보 확정이 필요합니다.";
  const legal = await prisma.legalDocument.upsert({ where: { type: "TERMS" }, update: {}, create: { type: "TERMS", title: "이용약관", required: true } });
  await prisma.legalDocumentVersion.upsert({
    where: { legalDocumentId_version_locale: { legalDocumentId: legal.id, version: "dev-1", locale: "ko-KR" } },
    update: {},
    create: { legalDocumentId: legal.id, version: "dev-1", bodyMd: policyBody, bodySha256: sha256(policyBody), effectiveAt: new Date("2026-01-01T00:00:00+09:00"), status: PublicationStatus.DRAFT },
  });

  const events = ["landing_cta_clicked","signup_completed","identity_verified","legal_agreement_completed","case_created","consent_completed","document_uploaded","extraction_completed","extraction_confirmed","family_invited","invitation_accepted","task_assigned","handoff_created","handoff_acknowledged","discharge_plan_started","paywall_viewed","checkout_started","purchase_completed","partner_lead_submitted","data_exported","account_deletion_requested"];
  for (const name of events) await prisma.analyticsEventDefinition.upsert({ where: { name_version: { name, version: 1 } }, update: {}, create: { name, version: 1, description: `${name} v1`, allowedProperties: [], prohibitedProperties: ["patient_name","disease","hospital_name","document_text","free_text"] } });
}

main().finally(() => prisma.$disconnect());
