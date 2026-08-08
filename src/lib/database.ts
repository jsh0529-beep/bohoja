import {createHash,randomUUID} from 'node:crypto';
import {hashSync} from 'bcryptjs';
import {PrismaClient,PublicationStatus} from '@prisma/client';

type DatabaseGlobal=typeof globalThis&{__guardianDatabase?:PrismaClient;__guardianBootstrap?:Promise<void>};
const state=globalThis as DatabaseGlobal;
export const prisma=state.__guardianDatabase??=new PrismaClient();
export const sha256=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export const newToken=()=>randomUUID()+randomUUID();

export async function legalVersion(type:string,title=type,body=`${title} 동의문`){
  const document=await prisma.legalDocument.upsert({where:{type},update:{title},create:{type,title,required:type!=='marketing'}});
  return prisma.legalDocumentVersion.upsert({
    where:{legalDocumentId_version_locale:{legalDocumentId:document.id,version:'1.0',locale:'ko-KR'}},
    update:{},
    create:{legalDocumentId:document.id,version:'1.0',bodyMd:body,bodySha256:sha256(body),effectiveAt:new Date(0),publishedAt:new Date(),status:PublicationStatus.PUBLISHED},
  });
}

async function seedLegalAndPlans(){
  await legalVersion('terms','이용약관','보호자노트 서비스 이용약관 초안입니다. 출시 전 법률 검토가 필요합니다.');
  await legalVersion('privacy','개인정보 처리방침','수집 최소화, 목적 제한, 안전한 파기 원칙을 적용합니다. 출시 전 법률 검토가 필요합니다.');
  await legalVersion('age14','만 14세 이상 확인','만 14세 이상임을 확인합니다.');
  await legalVersion('sensitive','민감정보 처리 동의','건강정보를 돌봄 기록과 문서 분석 목적으로 처리하는 데 동의합니다.');
  await legalVersion('ai_transfer','AI 처리 동의','문서 분석을 위해 AI 처리 공급자에게 필요한 범위의 정보를 전달하는 데 동의합니다.');
  for(const plan of [
    {code:'ADMISSION_PASS',name:'입원 패스',priceKrw:6900,billingPeriodDays:60,benefitsJson:{documents:30}},
    {code:'FAMILY_MONTHLY',name:'가족 월간',priceKrw:4900,billingPeriodDays:30,benefitsJson:{documents:30}},
    {code:'FAMILY_YEARLY',name:'가족 연간',priceKrw:39000,billingPeriodDays:365,benefitsJson:{documents:360}},
  ])await prisma.plan.upsert({where:{code:plan.code},update:plan,create:plan});
  const existing=await prisma.serviceNotice.findUnique({where:{slug_version:{slug:'test-service',version:1}}});
  if(!existing){const body='현재 결제와 AI 분석은 안전한 테스트 모드로 제공됩니다.';await prisma.serviceNotice.create({data:{slug:'test-service',version:1,category:'SERVICE',title:'보호자노트 테스트 서비스 안내',bodyMd:body,bodySha256:sha256(body),status:PublicationStatus.PUBLISHED,publishedAt:new Date()}});}
}

async function createSeedUser(id:string,email:string,password:string,name:string,isAdmin=false){
  await prisma.user.upsert({where:{id},update:{},create:{id,isAdmin,profile:{create:{displayName:name,over14ConfirmedAt:new Date()}},credential:{create:{email:email.toLowerCase(),passwordHash:hashSync(password,10),verifiedAt:new Date()}}}});
}

async function migrateRuntimeState(){
  if(await prisma.userCredential.count())return;
  const runtime=await prisma.runtimeState.findUnique({where:{id:'default'}});
  const payload=runtime?.payload as Record<string,unknown>|undefined;
  const users=(payload?.users as Array<Record<string,unknown>>|undefined)??[];
  if(!users.length){
    await createSeedUser('admin',(process.env.ADMIN_EMAIL??'admin@guardian.local').toLowerCase(),process.env.ADMIN_PASSWORD??'admin1234','관리자',true);
    await createSeedUser('demo','demo@guardian.local','demo1234','김보호');
    return;
  }
  for(const item of users){
    const id=String(item.id);const email=String(item.email).toLowerCase();
    await prisma.user.upsert({where:{id},update:{},create:{id,isAdmin:Boolean(item.isAdmin),profile:{create:{displayName:String(item.name??'보호자'),over14ConfirmedAt:new Date()}},credential:{create:{email,passwordHash:String(item.password),verifiedAt:item.verified===false?null:new Date()}}}});
  }
  const cases=(payload?.cases as Array<Record<string,unknown>>|undefined)??[];
  for(const item of cases){
    const ownerId=String(item.ownerId);if(!await prisma.user.findUnique({where:{id:ownerId}}))continue;
    await prisma.patientCase.upsert({where:{id:String(item.id)},update:{},create:{id:String(item.id),alias:String(item.patientAlias),relationship:String(item.relationship),hospitalName:item.hospital?String(item.hospital):null,createdById:ownerId,createdAt:new Date(String(item.createdAt))}});
  }
  const members=(payload?.members as Array<Record<string,unknown>>|undefined)??[];
  for(const item of members){
    const role=String(item.role)==='MANAGER'?'CO_ADMIN':String(item.role) as 'OWNER'|'CO_ADMIN'|'CAREGIVER'|'VIEWER';
    try{await prisma.caseMember.upsert({where:{caseId_userId:{caseId:String(item.caseId),userId:String(item.userId)}},update:{role,revokedAt:null},create:{caseId:String(item.caseId),userId:String(item.userId),role}});}catch{}
  }
  const sensitive=await legalVersion('sensitive','민감정보 처리 동의');
  for(const item of cases.filter(candidate=>candidate.consented!==false)){
    try{await prisma.caseConsent.create({data:{caseId:String(item.id),userId:String(item.ownerId),kind:'sensitive',authorityBasis:String(item.relationship??'CAREGIVER'),versionId:sensitive.id,agreedAt:new Date()}});}catch{}
  }
}

export function ensureBootstrap(){
  state.__guardianBootstrap??=(async()=>{await seedLegalAndPlans();await migrateRuntimeState();})();
  return state.__guardianBootstrap;
}
