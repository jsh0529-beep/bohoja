export type PolicyRole='OWNER'|'CO_ADMIN'|'CAREGIVER'|'VIEWER';
export const roleAllows=(role:PolicyRole,mode:'read'|'write'|'manage')=>mode==='read'||(mode==='write'?role!=='VIEWER':role==='OWNER'||role==='CO_ADMIN');
export function canAdministerMember(actorRole:PolicyRole,actorId:string,targetRole:PolicyRole,targetId:string,nextRole?:PolicyRole){
  if(actorId===targetId||targetRole==='OWNER'||nextRole==='OWNER')return false;
  if(actorRole==='OWNER')return true;
  return actorRole==='CO_ADMIN'&&targetRole!=='CO_ADMIN'&&nextRole!=='CO_ADMIN';
}
