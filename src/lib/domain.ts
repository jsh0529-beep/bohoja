import { randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";

export type Role = "OWNER" | "MANAGER" | "CAREGIVER" | "VIEWER";
export type User = { id: string; email: string; password: string; name: string; isAdmin: boolean; verified: boolean };
export type Agreement = { id: string; userId: string; type: string; version: string; accepted: boolean; at: string; withdrawnAt?: string };
export type Case = { id: string; ownerId: string; patientAlias: string; relationship: string; hospital?: string; consented: boolean; createdAt: string };
export type Member = { caseId: string; userId: string; role: Role };
export type Invitation = { id: string; caseId: string; email: string; role: Role; token: string; expiresAt: string; status: "PENDING" | "ACCEPTED" | "REVOKED" };
export type Analysis = { id: string; caseId: string; fileName: string; status: "DRAFT" | "CONFIRMED" | "FAILED"; fields: Record<string, unknown>; createdAt: string };
export type Payment = { id: string; userId: string; plan: string; amount: number; status: "PAID" | "FAILED" | "REFUNDED"; createdAt: string };
export type LegalDocument = { id: string; slug: string; title: string; version: string; body: string; published: boolean; updatedAt: string };
export type Notice = { id: string; title: string; body: string; published: boolean; updatedAt: string };
export type PrivacyRequest = { id: string; userId: string; type: "EXPORT" | "CORRECTION" | "DELETION" | "SUSPENSION"; detail?: string; status: "RECEIVED" | "PROCESSING" | "COMPLETED" | "REJECTED"; response?: string; createdAt: string; updatedAt: string };

export type Store = {
  users: User[]; sessions: Map<string, string>; agreements: Agreement[]; cases: Case[]; members: Member[];
  invitations: Invitation[]; analyses: Analysis[]; payments: Payment[]; legal: LegalDocument[]; notices: Notice[];
  privacy: PrivacyRequest[]; audit: Array<{ id: string; actorId?: string; action: string; target?: string; at: string }>;
  records: Array<{ id: string; kind: string; caseId: string; userId: string; data: Record<string, unknown>; createdAt: string }>;
  preferences: Array<{ userId: string; channel: string; enabled: boolean }>;
};

const initial = (): Store => ({
  users: [
    { id: "admin", email: (process.env.ADMIN_EMAIL ?? "admin@guardian.local").toLowerCase(), password: hashSync(process.env.ADMIN_PASSWORD ?? "admin1234", 10), name: "관리자", isAdmin: true, verified: true },
    { id: "demo", email: "demo@guardian.local", password: hashSync("demo1234", 10), name: "김보호", isAdmin: false, verified: true },
  ], sessions: new Map(), agreements: [], cases: [], members: [], invitations: [], analyses: [], payments: [],
  legal: [
    { id: "terms-v1", slug: "terms", title: "이용약관", version: "1.0", body: "보호자노트 서비스 이용약관 초안입니다. 출시 전 법률 검토가 필요합니다.", published: true, updatedAt: new Date().toISOString() },
    { id: "privacy-v1", slug: "privacy", title: "개인정보 처리방침", version: "1.0", body: "수집 최소화, 목적 제한, 안전한 파기 원칙을 적용합니다. 출시 전 법률 검토가 필요합니다.", published: true, updatedAt: new Date().toISOString() },
  ],
  notices: [{ id: "notice-1", title: "보호자노트 테스트 서비스 안내", body: "현재 결제와 AI 분석은 안전한 테스트 모드로 제공됩니다.", published: true, updatedAt: new Date().toISOString() }],
  privacy: [], audit: [], records: [], preferences: [],
});

const globalStore = globalThis as typeof globalThis & { __guardianStore?: Store };
export const db = globalStore.__guardianStore ??= initial();
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const audit = (action: string, actorId?: string, target?: string) => db.audit.push({ id: id(), action, actorId, target, at: now() });
export const sessionUser = (token?: string | null) => db.users.find((u) => u.id === db.sessions.get(token ?? ""));
export const caseRole = (caseId: string, userId: string) => db.members.find((m) => m.caseId === caseId && m.userId === userId)?.role;
export const canRead = (caseId: string, userId: string) => {
  const role = caseRole(caseId, userId);
  const active = db.cases.find((item) => item.id === caseId)?.consented;
  return Boolean(role && (active || role === "OWNER"));
};
export const canWrite = (caseId: string, userId: string) => Boolean(db.cases.find((item) => item.id === caseId)?.consented) && ["OWNER", "MANAGER", "CAREGIVER"].includes(caseRole(caseId, userId) ?? "");
export const canManage = (caseId: string, userId: string) => ["OWNER", "MANAGER"].includes(caseRole(caseId, userId) ?? "");
