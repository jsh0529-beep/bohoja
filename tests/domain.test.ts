import { beforeEach, describe, expect, it } from "vitest";
import { canManage, canRead, canWrite, caseRole, db } from "@/lib/domain";

describe("case role policy", () => {
  beforeEach(() => { db.members.splice(0); db.cases.splice(0); });
  it("rejects non-members", () => { expect(canRead("case", "stranger")).toBe(false); });
  it("separates viewer, caregiver and owner permissions", () => {
    db.cases.push({id:"case",ownerId:"owner",patientAlias:"환자",relationship:"가족",consented:true,createdAt:new Date().toISOString()});
    db.members.push({ caseId:"case", userId:"viewer", role:"VIEWER" }, { caseId:"case", userId:"caregiver", role:"CAREGIVER" }, { caseId:"case", userId:"owner", role:"OWNER" });
    expect(caseRole("case","viewer")).toBe("VIEWER"); expect(canRead("case","viewer")).toBe(true); expect(canWrite("case","viewer")).toBe(false);
    expect(canWrite("case","caregiver")).toBe(true); expect(canManage("case","caregiver")).toBe(false); expect(canManage("case","owner")).toBe(true);
  });
});
