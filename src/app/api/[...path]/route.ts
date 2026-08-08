import {randomInt,randomUUID} from 'node:crypto';
import {compare,hash} from 'bcryptjs';
import {CaseRole,ConsentStatus,DocumentStatus,JobStatus,PaymentStatus,Prisma,PublicationStatus,RequestStatus,SubscriptionStatus,TaskStatus,UserStatus} from '@prisma/client';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {ensureBootstrap,legalVersion,newToken,prisma,sha256} from '@/lib/database';
import {readUpload,removeUpload,storeUpload} from '@/lib/file-storage';
import {createDischargePdf} from '@/lib/discharge-pdf';
import {analyzeUploadedDocument,fixtureAnalysis} from '@/lib/ai-provider';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Authenticated JSON must never be reused by Railway/CDN or the PWA cache.
const ok=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'cache-control':'private, no-store, no-cache, max-age=0, must-revalidate','pragma':'no-cache','vary':'Cookie, Authorization'}});
const fail=(message:string,status=400,code='BAD_REQUEST')=>ok({error:{code,message}},status);
const requestBody=async(request:NextRequest)=>{try{if(request.headers.get('content-type')?.includes('multipart/form-data'))return Object.fromEntries((await request.formData()).entries());return await request.json();}catch{return {};}};
const pathOf=(context:RouteContext)=>context.params.then(value=>value.path);
const parsed=<T>(schema:z.ZodType<T>,value:unknown):T|NextResponse=>{const result=schema.safeParse(value);return result.success?result.data:fail(result.error.issues[0]?.message??'입력값을 확인해 주세요.');};
const isResponse=(value:unknown):value is NextResponse=>value instanceof NextResponse;
const rawToken=(request:NextRequest)=>request.cookies.get('guardian_session')?.value??request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
const clientIp=(request:NextRequest)=>request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??request.headers.get('x-real-ip')??'local';
const secureSessionCookie=(process.env.APP_URL??'http://localhost:3000').startsWith('https://');
const apiRole=(role:CaseRole)=>role===CaseRole.CO_ADMIN?'MANAGER':role;
const dbRole=(role:string)=>role==='MANAGER'?CaseRole.CO_ADMIN:role as CaseRole;
const audit=async(action:string,actorUserId?:string,targetId='system',caseId?:string)=>{await prisma.auditLog.create({data:{actorUserId,actorType:actorUserId?'USER':'SYSTEM',action,targetType:'DOMAIN',targetId,caseId}});};
async function notifyCase(caseId:string,actorId:string,category:string,reference:string){const members=await prisma.caseMember.findMany({where:{caseId,revokedAt:null,userId:{not:actorId}}});for(const member of members)await prisma.notification.upsert({where:{dedupeKey:`${category}:${reference}:${member.userId}`},update:{},create:{userId:member.userId,category,channel:'IN_APP',templateKey:category,dedupeKey:`${category}:${reference}:${member.userId}`,status:'SENT',scheduledAt:new Date(),sentAt:new Date()}});}

function csrfFailure(request:NextRequest){
  if(request.headers.has('authorization'))return null;
  const fetchSite=request.headers.get('sec-fetch-site');
  if(fetchSite==='same-origin'||fetchSite==='none')return null;
  if(fetchSite==='cross-site')return fail('허용되지 않은 출처의 요청입니다.',403,'CSRF_REJECTED');
  const origin=request.headers.get('origin');if(!origin)return null;
  let normalized=origin;try{normalized=new URL(origin).origin;}catch{}
  const allowed=new Set([request.nextUrl.origin,process.env.APP_URL?new URL(process.env.APP_URL).origin:null].filter(Boolean));
  return allowed.has(normalized)?null:fail('허용되지 않은 출처의 요청입니다.',403,'CSRF_REJECTED');
}

async function rateLimit(request:NextRequest,scope:string,identity:string,limit:number,windowMs:number){
  const id=sha256(`${scope}:${identity}:${clientIp(request)}`);const now=new Date();
  const result=await prisma.$transaction(async tx=>{
    const current=await tx.securityThrottle.findUnique({where:{id}});
    if(current?.blockedUntil&&current.blockedUntil>now)return {blockedUntil:current.blockedUntil};
    const reset=!current||now.getTime()-current.windowStart.getTime()>=windowMs;
    const count=reset?1:current.count+1;const blockedUntil=count>limit?new Date(now.getTime()+windowMs):null;
    await tx.securityThrottle.upsert({where:{id},update:{windowStart:reset?now:current!.windowStart,count,blockedUntil},create:{id,windowStart:now,count,blockedUntil}});
    return {blockedUntil};
  });
  if(!result.blockedUntil)return null;const response=fail('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',429,'RATE_LIMITED');response.headers.set('Retry-After',String(Math.max(1,Math.ceil((result.blockedUntil.getTime()-Date.now())/1000))));return response;
}

async function currentUser(request:NextRequest){
  const value=rawToken(request);if(!value)return null;
  const session=await prisma.authSession.findUnique({where:{tokenHash:sha256(value)},include:{user:{include:{profile:true,credential:true}}}});
  return session&&session.expiresAt>new Date()&&session.user.status===UserStatus.ACTIVE?session.user:null;
}
async function issueChallenge(userId:string,purpose:'EMAIL_VERIFY'|'PASSWORD_RESET'){
  const code=String(randomInt(100000,1000000));
  await prisma.verificationChallenge.updateMany({where:{userId,purpose,usedAt:null},data:{usedAt:new Date()}});
  await prisma.verificationChallenge.create({data:{userId,purpose,codeHash:sha256(code),expiresAt:new Date(Date.now()+10*60*1000)}});
  return code;
}
async function consumeChallenge(userId:string,purpose:string,code:string){
  const challenge=await prisma.verificationChallenge.findFirst({where:{userId,purpose,usedAt:null},orderBy:{createdAt:'desc'}});
  if(!challenge||challenge.expiresAt<new Date()||challenge.attempts>=5)return false;
  if(challenge.codeHash!==sha256(code)){await prisma.verificationChallenge.update({where:{id:challenge.id},data:{attempts:{increment:1}}});return false;}
  await prisma.verificationChallenge.update({where:{id:challenge.id},data:{usedAt:new Date()}});return true;
}
async function auth(request:NextRequest){return await currentUser(request)??fail('로그인이 필요합니다.',401,'UNAUTHORIZED');}
async function admin(request:NextRequest){const user=await currentUser(request);return user?.isAdmin?user:fail('관리자 권한이 필요합니다.',403,'FORBIDDEN');}
const publicUser=(user:any)=>({id:user.id,email:user.credential?.email,name:user.profile?.displayName,isAdmin:user.isAdmin,verified:Boolean(user.credential?.verifiedAt)});

async function membership(caseId:string,userId:string){return prisma.caseMember.findFirst({where:{caseId,userId,revokedAt:null},include:{patientCase:{include:{consents:{orderBy:{agreedAt:'desc'}}}}}});}
const active=(member:any)=>member?.patientCase.status===UserStatus.ACTIVE||member?.patientCase.status==='ACTIVE';
const hasConsent=(member:any,kind:string)=>member?.patientCase.consents.find((item:any)=>item.userId===member.userId&&item.kind===kind)?.status===ConsentStatus.GRANTED;
const consented=(member:any)=>member?.patientCase.consents.find((item:any)=>item.kind==='sensitive')?.status===ConsentStatus.GRANTED;
async function permission(caseId:string,userId:string,mode:'read'|'write'|'manage'){
  const member=await membership(caseId,userId);if(!member)return false;
  if(mode==='read')return (active(member)&&consented(member))||member.role===CaseRole.OWNER;
  if(!active(member)||!consented(member))return false;
  return mode==='write'?new Set<CaseRole>([CaseRole.OWNER,CaseRole.CO_ADMIN,CaseRole.CAREGIVER]).has(member.role):new Set<CaseRole>([CaseRole.OWNER,CaseRole.CO_ADMIN]).has(member.role);
}

async function resolveCaseId(userId:string,mode:'read'|'write'|'manage',requested?:unknown){
  if(typeof requested==='string'&&requested)return await permission(requested,userId,mode)?requested:null;
  const memberships=await prisma.caseMember.findMany({where:{userId,revokedAt:null,patientCase:{deletedAt:null}},orderBy:{joinedAt:'desc'},select:{caseId:true,role:true}});
  memberships.sort((a,b)=>Number(b.role===CaseRole.OWNER)-Number(a.role===CaseRole.OWNER));
  for(const member of memberships)if(await permission(member.caseId,userId,mode))return member.caseId;
  return null;
}

async function caseDto(member:any){return {id:member.patientCase.id,ownerId:member.patientCase.createdById,patientAlias:member.patientCase.alias,relationship:member.patientCase.relationship,hospital:member.patientCase.hospitalName??undefined,consented:consented(member),aiConsented:hasConsent(member,'ai_transfer'),createdAt:member.patientCase.createdAt.toISOString(),role:apiRole(member.role)};}
async function documentDto(document:any){const job=document.extractionJobs?.[0];const fields=Object.fromEntries((job?.fields??[]).map((field:any)=>[field.fieldName,field.valueJson]));return {id:document.id,caseId:document.caseId,fileName:document.originalName,mimeType:document.mimeType,byteSize:document.byteSize,pageCount:document.pageCount,originalAvailable:!document.storageKey.includes(':')&&document.byteSize>0,status:document.status===DocumentStatus.CONFIRMED?'CONFIRMED':document.status===DocumentStatus.FAILED?'FAILED':'DRAFT',fields,createdAt:document.createdAt.toISOString()};}
const documentInclude={extractionJobs:{orderBy:{createdAt:'desc' as const},take:1,include:{fields:true}}};

async function overview(caseId:string,userId:string){
  const member=await membership(caseId,userId);if(!member||!await permission(caseId,userId,'read'))return null;
  const [members,invitations,documents,careLogs,handoffs,questions,expenses,plans,events,tasks,notifications]=await Promise.all([
    prisma.caseMember.findMany({where:{caseId,revokedAt:null},include:{user:{include:{profile:true,credential:true}}}}),
    new Set<CaseRole>([CaseRole.OWNER,CaseRole.CO_ADMIN]).has(member.role)?prisma.invitation.findMany({where:{caseId},orderBy:{createdAt:'desc'}}):Promise.resolve([]),
    prisma.sourceDocument.findMany({where:{caseId,deletedAt:null},include:documentInclude,orderBy:{createdAt:'desc'}}),
    prisma.careLog.findMany({where:{caseId},orderBy:{createdAt:'desc'}}),
    prisma.handoffReport.findMany({where:{caseId},orderBy:{createdAt:'desc'}}),
    prisma.roundingQuestion.findMany({where:{caseId},orderBy:{createdAt:'desc'}}),
    prisma.expense.findMany({where:{caseId},orderBy:{createdAt:'desc'}}),
    prisma.dischargePlan.findMany({where:{caseId},include:{items:true},orderBy:{startedAt:'desc'},take:1}),
    prisma.event.findMany({where:{caseId,deletedAt:null},orderBy:{startsAt:'asc'}}),
    prisma.task.findMany({where:{caseId,deletedAt:null},orderBy:[{status:'asc'},{dueAt:'asc'}]}),
    prisma.notification.findMany({where:{userId},orderBy:{createdAt:'desc'},take:10}),
  ]);
  const userIds=new Set<string>();for(const item of [...careLogs,...handoffs,...questions])userIds.add('authorId' in item?item.authorId:'');for(const item of expenses)userIds.add(item.paidById);
  const authors=Object.fromEntries((await prisma.userProfile.findMany({where:{userId:{in:[...userIds].filter(Boolean)}}})).map(item=>[item.userId,item.displayName]));
  const records:any[]=[
    ...careLogs.map(item=>({id:item.id,kind:'care-logs',data:{recordedAt:item.recordedAt.toISOString(),meal:item.meal,pain:item.reportedPain,bowelMovement:item.bowelMovement,sleep:item.sleep,mobility:item.mobility,mood:item.mood,neededItems:item.neededItems,heardFromStaff:item.heardFromStaff,note:item.note,...((item.detailsJson as Record<string,unknown>|null)??{})},createdAt:item.createdAt.toISOString(),authorName:authors[item.authorId]??'보호자'})),
    ...handoffs.map(item=>({id:item.id,kind:'handoffs',data:item.contentJson,createdAt:item.createdAt.toISOString(),authorName:authors[item.authorId]??'보호자'})),
    ...questions.map(item=>({id:item.id,kind:'questions',data:{question:item.question,answer:item.answer},createdAt:item.createdAt.toISOString(),authorName:authors[item.authorId]??'보호자'})),
    ...expenses.map(item=>({id:item.id,kind:'expenses',data:{title:item.title,amount:item.amountKrw,split:'가족 균등 분담'},createdAt:item.createdAt.toISOString(),authorName:authors[item.paidById]??'보호자'})),
    ...(plans[0]?.items??[]).map(item=>({id:item.id,kind:'discharge/items',data:{title:item.title,completed:Boolean(item.completedAt)},createdAt:(item.completedAt??plans[0].startedAt).toISOString(),authorName:'가족'})),
  ].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return {case:await caseDto(member),members:members.map(item=>({caseId,userId:item.userId,role:apiRole(item.role),name:item.user.profile?.displayName??'알 수 없는 구성원',email:item.user.credential?.email??''})),invitations:invitations.map(item=>({id:item.id,email:item.inviteeEmail,role:apiRole(item.role),status:item.revokedAt?'REVOKED':item.acceptedAt?'ACCEPTED':'PENDING',expiresAt:item.expiresAt.toISOString()})),documents:await Promise.all(documents.map(documentDto)),events:events.map(item=>({id:item.id,title:item.title,startsAt:item.startsAt.toISOString(),endsAt:item.endsAt?.toISOString(),location:item.location,important:item.important})),tasks:tasks.map(item=>({id:item.id,title:item.title,description:item.description,status:item.status===TaskStatus.TODO?'OPEN':item.status,dueAt:item.dueAt?.toISOString(),assigneeId:item.assigneeId,priority:item.priority})),notifications:notifications.map(item=>({id:item.id,category:item.category,createdAt:item.createdAt.toISOString()})),records};
}

async function handleGET(request:NextRequest,context:RouteContext){
  const path=await pathOf(context);const key=path.join('/');
  if(key==='health')return ok({ok:true,mode:process.env.AI_PROVIDER??'local',database:'normalized',at:new Date().toISOString()});
  if(key==='legal'){
    const items=await prisma.legalDocumentVersion.findMany({where:{status:PublicationStatus.PUBLISHED,publishedAt:{not:null}},include:{legalDocument:true},orderBy:{publishedAt:'desc'}});
    return ok({items:items.map(item=>({id:item.id,slug:item.legalDocument.type,title:item.legalDocument.title,version:item.version,body:item.bodyMd,published:true,updatedAt:(item.publishedAt??item.createdAt).toISOString()}))});
  }
  if(key==='notices'){const items=await prisma.serviceNotice.findMany({where:{status:PublicationStatus.PUBLISHED},orderBy:{publishedAt:'desc'}});return ok({items:items.map(item=>({id:item.id,title:item.title,body:item.bodyMd,published:true,updatedAt:(item.publishedAt??item.createdAt).toISOString()}))});}
  if(key==='auth/me'){const user=await currentUser(request);return user?ok({user:publicUser(user)}):fail('로그인이 필요합니다.',401,'UNAUTHORIZED');}
  const user=await auth(request);if(isResponse(user))return user;
  if(key==='agreements'){
    const items=await prisma.userAgreement.findMany({where:{userId:user.id},include:{version:{include:{legalDocument:true}}},orderBy:{agreedAt:'desc'}});
    return ok({items:items.map(item=>({id:item.id,userId:item.userId,type:item.version.legalDocument.type,version:item.version.version,accepted:item.status===ConsentStatus.GRANTED,at:item.agreedAt.toISOString(),withdrawnAt:item.withdrawnAt?.toISOString()}))});
  }
  if(key==='preferences'){const items=await prisma.notificationPreference.findMany({where:{userId:user.id}});return ok({items:items.map(item=>({channel:item.channel,enabled:item.marketingEnabled||item.transactionalEnabled}))});}
  if(key==='cases'){
    const memberships=await prisma.caseMember.findMany({where:{userId:user.id,revokedAt:null},include:{patientCase:{include:{consents:{orderBy:{agreedAt:'desc'}}}}},orderBy:{joinedAt:'asc'}});
    return ok({items:await Promise.all(memberships.filter(item=>(active(item)&&consented(item))||item.role===CaseRole.OWNER).map(caseDto))});
  }
  if(path[0]==='cases'&&path.length===2){const member=await membership(path[1],user.id);return member&&await permission(path[1],user.id,'read')?ok({case:await caseDto(member),role:apiRole(member.role)}):fail('케이스를 찾을 수 없습니다.',404,'NOT_FOUND');}
  if(path[0]==='cases'&&path[2]==='overview'){const data=await overview(path[1],user.id);if(data)await audit('sensitive_case_read',user.id,path[1],path[1]);return data?ok(data):fail('돌봄방을 찾을 수 없습니다.',404,'NOT_FOUND');}
  if(path[0]==='cases'&&path[2]==='members'){const data=await overview(path[1],user.id);return data?ok({items:data.members}):fail('접근 권한이 없습니다.',403,'FORBIDDEN');}
  if(path[0]==='cases'&&path[2]==='documents'&&path[4]==='download'){
    if(!await permission(path[1],user.id,'read'))return fail('접근 권한이 없습니다.',403,'FORBIDDEN');const document=await prisma.sourceDocument.findFirst({where:{id:path[3],caseId:path[1],deletedAt:null}});if(!document||document.storageKey.includes(':'))return fail('원본 파일을 찾을 수 없습니다.',404,'NOT_FOUND');const bytes=await readUpload(document.storageKey);await audit('source_document_downloaded',user.id,document.id,document.caseId);return new NextResponse(new Uint8Array(bytes),{headers:{'content-type':document.mimeType,'content-length':String(bytes.length),'cache-control':'private, no-store','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`}});
  }
  if(path[0]==='cases'&&path[2]==='documents'){if(!await permission(path[1],user.id,'read'))return fail('접근 권한이 없습니다.',403,'FORBIDDEN');const documents=await prisma.sourceDocument.findMany({where:{caseId:path[1],deletedAt:null},include:documentInclude});return ok({items:await Promise.all(documents.map(documentDto))});}
  if(key==='payments'){
    const subscriptions=await prisma.subscription.findMany({where:{userId:user.id},include:{plan:true,paymentEvents:{where:{type:'CHECKOUT'},orderBy:{occurredAt:'desc'},take:1}},orderBy:{createdAt:'desc'}});
    return ok({items:subscriptions.map(item=>({id:item.paymentEvents[0]?.id??item.id,userId:user.id,plan:item.plan.code,amount:item.paymentEvents[0]?.amountKrw??item.plan.priceKrw,status:item.status===SubscriptionStatus.ACTIVE?'PAID':item.status===SubscriptionStatus.REFUNDED?'REFUNDED':'FAILED',createdAt:item.createdAt.toISOString()}))});
  }
  if(key==='privacy-requests'){const items=await prisma.privacyRequest.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'}});return ok({items:items.map(privacyDto)});}
  if(key==='privacy/export'){
    const [profile,memberships,agreements,requests]=await Promise.all([prisma.userProfile.findUnique({where:{userId:user.id}}),prisma.caseMember.findMany({where:{userId:user.id,revokedAt:null},include:{patientCase:true}}),prisma.userAgreement.findMany({where:{userId:user.id}}),prisma.privacyRequest.findMany({where:{userId:user.id}})]);
    await audit('personal_data_exported',user.id,user.id);return new NextResponse(JSON.stringify({user:{id:user.id,email:user.credential?.email,name:profile?.displayName},cases:memberships.map(item=>item.patientCase),agreements,privacyRequests:requests,exportedAt:new Date().toISOString()},null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename=guardian-note-export.json'}});
  }
  if(key==='discharge/pdf'||(path[0]==='cases'&&path[2]==='discharge'&&path[3]==='pdf')){const caseId=await resolveCaseId(user.id,'read',path[0]==='cases'?path[1]:undefined);if(!caseId)return fail('접근 권한이 없습니다.',403,'FORBIDDEN');const data=await overview(caseId,user.id);if(!data)return fail('돌봄방을 찾을 수 없습니다.',404,'NOT_FOUND');const bytes=await createDischargePdf({patientAlias:data.case.patientAlias,hospital:data.case.hospital,generatedAt:new Date(),records:data.records});await audit('discharge_pdf_generated',user.id,caseId,caseId);return new NextResponse(new Uint8Array(bytes),{headers:{'content-type':'application/pdf','content-length':String(bytes.length),'cache-control':'private, no-store','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`${data.case.patientAlias}-퇴원패키지.pdf`)}`}});}
  if(key.startsWith('admin/')){
    const actor=await admin(request);if(isResponse(actor))return actor;
    if(key==='admin/dashboard'){const [users,cases,payments,privacyPending]=await Promise.all([prisma.user.count(),prisma.patientCase.count(),prisma.paymentEvent.count(),prisma.privacyRequest.count({where:{status:{not:RequestStatus.COMPLETED}}})]);return ok({users,cases,payments,privacyPending});}
    if(key==='admin/legal'){const items=await prisma.legalDocumentVersion.findMany({include:{legalDocument:true},orderBy:{createdAt:'desc'}});return ok({items:items.map(item=>({id:item.id,slug:item.legalDocument.type,title:item.legalDocument.title,version:item.version,body:item.bodyMd,published:item.status===PublicationStatus.PUBLISHED,updatedAt:item.createdAt.toISOString()}))});}
    if(key==='admin/notices'){const items=await prisma.serviceNotice.findMany({orderBy:{createdAt:'desc'}});return ok({items:items.map(item=>({id:item.id,title:item.title,body:item.bodyMd,published:item.status===PublicationStatus.PUBLISHED,updatedAt:item.createdAt.toISOString()}))});}
    if(key==='admin/privacy-requests'){const items=await prisma.privacyRequest.findMany({orderBy:{createdAt:'desc'}});return ok({items:items.map(privacyDto)});}
    if(key==='admin/audit'){const items=await prisma.auditLog.findMany({orderBy:{createdAt:'desc'},take:200});return ok({items:items.map(item=>({id:item.id,actorId:item.actorUserId,action:item.action,target:item.targetId,at:item.createdAt.toISOString()}))});}
  }
  return fail('API 경로를 찾을 수 없습니다.',404,'NOT_FOUND');
}

async function handlePOST(request:NextRequest,context:RouteContext){
  const path=await pathOf(context);const key=path.join('/');const raw=await requestBody(request);
  if(key==='auth/signup'||key==='auth/register'){
    const normalized={...(raw as any),terms:(raw as any).terms??(raw as any).required0,privacy:(raw as any).privacy??(raw as any).required1,ageConfirmed:(raw as any).ageConfirmed??(raw as any).required2};
    const value=parsed(z.object({email:z.string().email(),password:z.string().min(8),name:z.string().min(2),ageConfirmed:z.literal(true),terms:z.literal(true),privacy:z.literal(true),marketing:z.boolean().optional().default(false)}),normalized);if(isResponse(value))return value;const limited=await rateLimit(request,'signup',value.email.toLowerCase(),5,60*60*1000);if(limited)return limited;
    if(await prisma.userCredential.findUnique({where:{email:value.email.toLowerCase()}}))return fail('이미 가입된 이메일입니다.',409,'CONFLICT');
    const [terms,privacy,age14]=await Promise.all([legalVersion('terms','이용약관'),legalVersion('privacy','개인정보 처리방침'),legalVersion('age14','만 14세 이상 확인')]);
    const created=await prisma.$transaction(async tx=>{
      const user=await tx.user.create({data:{profile:{create:{displayName:value.name,over14ConfirmedAt:new Date()}},credential:{create:{email:value.email.toLowerCase(),passwordHash:await hash(value.password,10)}}},include:{profile:true,credential:true}});
      for(const version of [terms,privacy,age14])await tx.userAgreement.create({data:{userId:user.id,versionId:version.id,status:ConsentStatus.GRANTED,presentedBodySha256:version.bodySha256,channel:'web',agreedAt:new Date()}});
      await tx.marketingConsent.create({data:{userId:user.id,channel:'email',granted:value.marketing,version:'1.0',source:'signup'}});
      return user;
    });
    const code=await issueChallenge(created.id,'EMAIL_VERIFY');const token=newToken();await prisma.authSession.create({data:{userId:created.id,tokenHash:sha256(token),expiresAt:new Date(Date.now()+604800000)}});await audit('signup_completed',created.id,created.id);
    const response=ok({user:publicUser(created),verificationRequired:true,...((process.env.EMAIL_PROVIDER??'fixture')==='fixture'?{testCode:code}:{})},201);response.cookies.set('guardian_session',token,{httpOnly:true,sameSite:'lax',secure:secureSessionCookie,path:'/',maxAge:604800});return response;
  }
  if(key==='auth/verify-email'){
    const user=await auth(request);if(isResponse(user))return user;const value=parsed(z.object({code:z.string().regex(/^\d{6}$/)}),raw);if(isResponse(value))return value;const limited=await rateLimit(request,'verify-email',user.id,6,10*60*1000);if(limited)return limited;if(!await consumeChallenge(user.id,'EMAIL_VERIFY',value.code))return fail('인증번호가 만료되었거나 올바르지 않습니다.',400,'INVALID_VERIFICATION_CODE');await prisma.userCredential.update({where:{userId:user.id},data:{verifiedAt:new Date()}});await audit('email_verified',user.id,user.id);return ok({verified:true});
  }
  if(key==='auth/password-reset/request'){
    const value=parsed(z.object({email:z.string().email()}),raw);if(isResponse(value))return value;const limited=await rateLimit(request,'password-reset',value.email.toLowerCase(),3,60*60*1000);if(limited)return limited;const credential=await prisma.userCredential.findUnique({where:{email:value.email.toLowerCase()}});const code=credential?await issueChallenge(credential.userId,'PASSWORD_RESET'):undefined;return ok({accepted:true,...(code&&(process.env.EMAIL_PROVIDER??'fixture')==='fixture'?{testCode:code}:{})});
  }
  if(key==='auth/password-reset/confirm'){
    const value=parsed(z.object({email:z.string().email(),code:z.string().regex(/^\d{6}$/),password:z.string().min(8)}),raw);if(isResponse(value))return value;const credential=await prisma.userCredential.findUnique({where:{email:value.email.toLowerCase()}});if(!credential||!await consumeChallenge(credential.userId,'PASSWORD_RESET',value.code))return fail('재설정 코드가 만료되었거나 올바르지 않습니다.',400,'INVALID_RESET_CODE');await prisma.$transaction([prisma.userCredential.update({where:{userId:credential.userId},data:{passwordHash:await hash(value.password,10)}}),prisma.authSession.deleteMany({where:{userId:credential.userId}})]);await audit('password_reset',credential.userId,credential.userId);return ok({reset:true});
  }
  if(key==='auth/login'){
    const value=parsed(z.object({email:z.string().email(),password:z.string().min(1)}),raw);if(isResponse(value))return value;const limitId=value.email.toLowerCase();const limited=await rateLimit(request,'login',limitId,5,15*60*1000);if(limited)return limited;
    const credential=await prisma.userCredential.findUnique({where:{email:value.email.toLowerCase()},include:{user:{include:{profile:true,credential:true}}}});if(!credential||credential.user.status!==UserStatus.ACTIVE||!await compare(value.password,credential.passwordHash))return fail('이메일 또는 비밀번호가 올바르지 않습니다.',401,'INVALID_CREDENTIALS');if(!credential.verifiedAt)return fail('이메일 인증을 먼저 완료해 주세요.',403,'EMAIL_VERIFICATION_REQUIRED');
    await prisma.securityThrottle.deleteMany({where:{id:sha256(`login:${limitId}:${clientIp(request)}`)}});const token=newToken();await prisma.authSession.create({data:{userId:credential.userId,tokenHash:sha256(token),expiresAt:new Date(Date.now()+604800000)}});await audit('login',credential.userId,credential.userId);const response=ok({user:publicUser(credential.user)});response.cookies.set('guardian_session',token,{httpOnly:true,sameSite:'lax',secure:secureSessionCookie,path:'/',maxAge:604800});return response;
  }
  if(key==='auth/logout'){const token=rawToken(request);if(token)await prisma.authSession.deleteMany({where:{tokenHash:sha256(token)}});const response=ok({success:true});response.cookies.delete('guardian_session');return response;}
  if(key==='invitations/accept'){
    const user=await auth(request);if(isResponse(user))return user;const value=parsed(z.object({token:z.string().min(10)}),raw);if(isResponse(value))return value;
    const invitation=await prisma.invitation.findUnique({where:{tokenHash:sha256(value.token)}});if(!invitation||invitation.revokedAt||invitation.acceptedAt||invitation.expiresAt<new Date())return fail('초대가 만료되었거나 유효하지 않습니다.',410,'INVITATION_INVALID');if(invitation.inviteeEmail!==user.credential?.email)return fail('초대받은 계정으로 로그인해 주세요.',403,'FORBIDDEN');
    const changed=await prisma.invitation.updateMany({where:{id:invitation.id,acceptedAt:null,revokedAt:null,expiresAt:{gt:new Date()}},data:{acceptedAt:new Date(),acceptedById:user.id}});if(changed.count!==1)return fail('이미 사용된 초대입니다.',410,'INVITATION_INVALID');await prisma.caseMember.upsert({where:{caseId_userId:{caseId:invitation.caseId,userId:user.id}},update:{role:invitation.role,revokedAt:null},create:{caseId:invitation.caseId,userId:user.id,role:invitation.role}});await audit('invitation_accepted',user.id,invitation.id,invitation.caseId);return ok({caseId:invitation.caseId,role:apiRole(invitation.role)});
  }
  const user=await auth(request);if(isResponse(user))return user;
  if(key==='agreements'){
    const value=parsed(z.object({type:z.enum(['terms','privacy','age14','marketing','sensitive','ai_transfer','third_party']),accepted:z.boolean(),version:z.string().default('1.0')}),raw);if(isResponse(value))return value;
    if(value.type==='marketing'){await prisma.marketingConsent.create({data:{userId:user.id,channel:'email',granted:value.accepted,version:value.version,source:'settings'}});return ok({agreement:{type:value.type,accepted:value.accepted,at:new Date().toISOString()}},201);}
    const version=await legalVersion(value.type,value.type);const agreement=await prisma.userAgreement.upsert({where:{userId_versionId:{userId:user.id,versionId:version.id}},update:{status:value.accepted?ConsentStatus.GRANTED:ConsentStatus.WITHDRAWN,withdrawnAt:value.accepted?null:new Date(),agreedAt:new Date(),presentedBodySha256:version.bodySha256},create:{userId:user.id,versionId:version.id,status:value.accepted?ConsentStatus.GRANTED:ConsentStatus.WITHDRAWN,presentedBodySha256:version.bodySha256,channel:'web',agreedAt:new Date(),withdrawnAt:value.accepted?null:new Date()}});
    if(value.type==='sensitive'&&!value.accepted){const owned=await prisma.patientCase.findMany({where:{createdById:user.id}});for(const item of owned){await prisma.caseConsent.updateMany({where:{caseId:item.id,kind:'sensitive',status:ConsentStatus.GRANTED},data:{status:ConsentStatus.WITHDRAWN,withdrawnAt:new Date()}});await prisma.caseMember.updateMany({where:{caseId:item.id,userId:{not:user.id}},data:{revokedAt:new Date()}});await prisma.invitation.updateMany({where:{caseId:item.id,acceptedAt:null,revokedAt:null},data:{revokedAt:new Date()}});await audit('case_sharing_stopped',user.id,item.id,item.id);}}
    await audit(value.accepted?'agreement_accepted':'agreement_withdrawn',user.id,value.type);return ok({agreement:{id:agreement.id,userId:user.id,type:value.type,version:value.version,accepted:value.accepted,at:agreement.agreedAt.toISOString(),withdrawnAt:agreement.withdrawnAt?.toISOString()}},201);
  }
  if(key==='cases'){
    if(!user.credential?.verifiedAt)return fail('이메일 인증을 먼저 완료해 주세요.',403,'EMAIL_VERIFICATION_REQUIRED');const normalized={...(raw as any),authority:(raw as any).authority??((raw as any).authorityConfirmed?'CAREGIVER':undefined)};const value=parsed(z.object({patientAlias:z.string().min(1).max(40),relationship:z.string().min(1),hospital:z.string().max(80).optional(),authority:z.enum(['SELF','LEGAL_REPRESENTATIVE','CAREGIVER']),sensitiveConsent:z.literal(true),aiConsent:z.boolean().optional().default(false)}),normalized);if(isResponse(value))return value;const version=await legalVersion('sensitive','민감정보 처리 동의');const aiVersion=value.aiConsent?await legalVersion('ai_transfer','AI 처리 동의'):null;
    const item=await prisma.$transaction(async tx=>{const patientCase=await tx.patientCase.create({data:{alias:value.patientAlias,relationship:value.relationship,hospitalName:value.hospital,createdById:user.id}});await tx.caseMember.create({data:{caseId:patientCase.id,userId:user.id,role:CaseRole.OWNER}});await tx.caseConsent.create({data:{caseId:patientCase.id,userId:user.id,kind:'sensitive',authorityBasis:value.authority,versionId:version.id,status:ConsentStatus.GRANTED,agreedAt:new Date()}});if(aiVersion)await tx.caseConsent.create({data:{caseId:patientCase.id,userId:user.id,kind:'ai_transfer',authorityBasis:value.authority,versionId:aiVersion.id,status:ConsentStatus.GRANTED,agreedAt:new Date()}});return patientCase;});await audit('case_created',user.id,item.id,item.id);return ok({case:{id:item.id,ownerId:user.id,patientAlias:item.alias,relationship:item.relationship,hospital:item.hospitalName,consented:true,createdAt:item.createdAt.toISOString()}},201);
  }
  if(path[0]==='cases'&&path[2]==='consents'){
    const caseId=path[1];if(!await permission(caseId,user.id,'read'))return fail('돌봄방을 찾을 수 없습니다.',404,'NOT_FOUND');const value=parsed(z.object({kind:z.literal('ai_transfer'),accepted:z.union([z.boolean(),z.literal('true'),z.literal('false')]).transform(item=>item===true||item==='true')}),raw);if(isResponse(value))return value;const version=await legalVersion(value.kind,'AI 처리 동의');await prisma.caseConsent.updateMany({where:{caseId,userId:user.id,kind:value.kind,status:ConsentStatus.GRANTED},data:{status:ConsentStatus.WITHDRAWN,withdrawnAt:new Date()}});const item=await prisma.caseConsent.create({data:{caseId,userId:user.id,kind:value.kind,versionId:version.id,status:value.accepted?ConsentStatus.GRANTED:ConsentStatus.WITHDRAWN,agreedAt:new Date(),withdrawnAt:value.accepted?null:new Date()}});await audit(value.accepted?'ai_consent_granted':'ai_consent_withdrawn',user.id,item.id,caseId);return ok({consent:{kind:value.kind,accepted:value.accepted}},201);
  }
  if(path[0]==='cases'&&path[2]==='documents'&&path[3]==='ocr'){
    const caseId=path[1];
    if(!await permission(caseId,user.id,'write'))return fail('문서 저장 권한이 없습니다.',403,'FORBIDDEN');
    const value=parsed(z.object({fileName:z.string().trim().min(1).max(255),text:z.string().trim().min(1).max(30000),confidence:z.number().min(0).max(100).nullable().optional()}),raw);
    if(isResponse(value))return value;
    const documentId=randomUUID();
    const document=await prisma.sourceDocument.create({data:{
      id:documentId,caseId,uploadedById:user.id,kind:'on-device-ocr',originalName:value.fileName,
      mimeType:'text/plain; charset=utf-8',byteSize:Buffer.byteLength(value.text,'utf8'),
      storageKey:`on-device-ocr:${documentId}`,sha256:sha256(value.text),status:DocumentStatus.CONFIRMED,confirmedAt:new Date(),
      extractionJobs:{create:{provider:'tesseract.js',model:'kor-local-v1',promptVersion:'none',schemaVersion:'ocr-text-v1',status:JobStatus.CONFIRMED,completedAt:new Date(),confirmedAt:new Date(),confirmedById:user.id,fields:{create:[{fieldName:'ocrText',valueJson:value.text,originalText:value.text,confidence:value.confidence==null?null:value.confidence/100}]}}},
    },include:documentInclude});
    await audit('on_device_ocr_saved',user.id,document.id,caseId);
    return ok({analysis:await documentDto(document)},201);
  }
  const requestedCaseId=path[0]==='cases'?path[1]:(raw as any).caseId;
  const explicitCaseId=await resolveCaseId(user.id,'read',requestedCaseId);
  if(path[0]==='cases'&&path.length===3&&path[2]==='events'){
    const caseId=explicitCaseId;if(!caseId||!await permission(caseId,user.id,'write'))return fail('일정 작성 권한이 없습니다.',403,'FORBIDDEN');
    const value=parsed(z.object({title:z.string().trim().min(1).max(200),startsAt:z.coerce.date().optional(),endsAt:z.coerce.date().optional(),location:z.string().trim().max(300).optional(),important:z.boolean().optional().default(false)}).refine(item=>!item.endsAt||!item.startsAt||item.endsAt>=item.startsAt,{message:'종료 시각은 시작 시각 이후여야 합니다.'}),raw);if(isResponse(value))return value;
    const item=await prisma.event.create({data:{caseId,title:value.title,startsAt:value.startsAt??new Date(),endsAt:value.endsAt,location:value.location||null,important:value.important,createdById:user.id}});await audit('event_created',user.id,item.id,caseId);await notifyCase(caseId,user.id,'EVENT_CREATED',item.id);return ok({event:{id:item.id,title:item.title,startsAt:item.startsAt.toISOString(),endsAt:item.endsAt?.toISOString(),location:item.location,important:item.important}},201);
  }
  if(path[0]==='cases'&&path.length===3&&path[2]==='tasks'){
    const caseId=explicitCaseId;if(!caseId||!await permission(caseId,user.id,'write'))return fail('할 일 작성 권한이 없습니다.',403,'FORBIDDEN');
    const value=parsed(z.object({title:z.string().trim().min(1).max(200),description:z.string().trim().max(2000).optional(),dueAt:z.coerce.date().optional(),assigneeId:z.string().optional(),priority:z.coerce.number().int().min(1).max(3).optional().default(2)}),raw);if(isResponse(value))return value;
    if(value.assigneeId&&!await membership(caseId,value.assigneeId))return fail('돌봄방 구성원에게만 할 일을 배정할 수 있습니다.',400,'INVALID_ASSIGNEE');
    const item=await prisma.task.create({data:{caseId,title:value.title,description:value.description,dueAt:value.dueAt,assigneeId:value.assigneeId,priority:value.priority,createdById:user.id}});await audit('task_created',user.id,item.id,caseId);await notifyCase(caseId,user.id,'TASK_CREATED',item.id);return ok({task:{id:item.id,title:item.title,description:item.description,status:'OPEN',dueAt:item.dueAt?.toISOString(),assigneeId:item.assigneeId,priority:item.priority}},201);
  }
  if(key==='documents'||(path[0]==='cases'&&path[2]==='documents'&&path[3]==='analyze')){
    if(process.env.AI_DOCUMENT_ANALYSIS_ENABLED!=='true')return fail('AI 문서 분석은 다음 단계에서 제공할 예정입니다. 지금은 사진 글자 추출을 이용해 주세요.',410,'FEATURE_POSTPONED');
    if(!['fixture','local'].includes(process.env.AI_PROVIDER??'local'))return fail('설정된 AI 공급자 연결이 준비되지 않았습니다.',503,'AI_PROVIDER_NOT_CONFIGURED');
    const caseId=explicitCaseId;if(!caseId||!await permission(caseId,user.id,'write'))return fail('문서 분석 권한이 없습니다.',403,'FORBIDDEN');const aiConsent=await prisma.caseConsent.findFirst({where:{caseId,userId:user.id,kind:'ai_transfer',status:ConsentStatus.GRANTED}});if(!aiConsent)return fail('AI 문서 분석 동의를 먼저 확인해 주세요.',403,'AI_CONSENT_REQUIRED');const paid=await prisma.subscription.findFirst({where:{userId:user.id,status:SubscriptionStatus.ACTIVE}});const used=await prisma.sourceDocument.count({where:{caseId,status:{not:DocumentStatus.FAILED},deletedAt:null}});if(used>=3&&!paid)return fail('무료 문서 분석 3건을 모두 사용했습니다. 플랜을 선택해 주세요.',402,'LIMIT_REACHED');
    const file=(raw as any).file instanceof File?(raw as any).file as File:null;let upload:null|Awaited<ReturnType<typeof storeUpload>>=null;try{upload=file?await storeUpload(caseId,file):null;}catch(error){return fail(error instanceof Error?error.message:'파일 안전 검사를 통과하지 못했습니다.',400,'UPLOAD_REJECTED');}const value=parsed(z.object({fileName:z.string().regex(/\.(pdf|png|jpe?g|heic)$/i,'지원하지 않는 파일 형식입니다.'),fixture:z.enum(['admission','discharge','receipt','failure']).default('admission')}),{fileName:upload?.originalName||(raw as any).fileName||'안내문.pdf',fixture:(raw as any).fixture||'admission'});if(isResponse(value)){if(upload)await removeUpload(upload.storageKey);return value;}const failed=value.fixture==='failure';let analysis;try{if(failed)analysis=null;else{const fixture=value.fixture as 'admission'|'discharge'|'receipt';analysis=file?analyzeUploadedDocument(Buffer.from(await file.arrayBuffer()),value.fileName,fixture):fixtureAnalysis(fixture);}}catch{analysis=null;}const fields=analysis?.fields??{retryable:true,reason:'테스트 AI 분석 실패'};const documentId=randomUUID();
    try{const document=await prisma.sourceDocument.create({data:{id:documentId,caseId,uploadedById:user.id,kind:value.fixture,originalName:value.fileName,mimeType:upload?.mimeType??'application/pdf',byteSize:upload?.byteSize??0,storageKey:upload?.storageKey??`fixture:${documentId}`,sha256:upload?.sha256??sha256(`${documentId}:${value.fileName}`),pageCount:upload?.pageCount,status:failed?DocumentStatus.FAILED:DocumentStatus.NEEDS_REVIEW,extractionJobs:{create:{provider:analysis?.provider??'fixture',model:analysis?.model??'fixture-v1',promptVersion:'1.0',schemaVersion:'1.0',status:failed?JobStatus.FAILED:JobStatus.NEEDS_REVIEW,errorCode:failed?'FIXTURE_FAILURE':null,completedAt:new Date(),fields:{create:Object.entries(fields).map(([fieldName,valueJson])=>({fieldName,valueJson:valueJson as Prisma.InputJsonValue,originalText:analysis?.evidence[fieldName]?.text,confidence:analysis?.evidence[fieldName]?.confidence,evidenceJson:analysis?.evidence[fieldName] as Prisma.InputJsonValue|undefined}))}}}},include:documentInclude});await audit(failed?'extraction_failed':'extraction_completed',user.id,document.id,caseId);return ok({analysis:await documentDto(document)},failed?422:201);}catch(error){if(upload)await removeUpload(upload.storageKey);throw error;}
  }
  if(path[0]==='documents'&&path[2]==='confirm'){
    const document=path[1]==='demo'?await prisma.sourceDocument.findFirst({where:{uploadedById:user.id,status:DocumentStatus.NEEDS_REVIEW},orderBy:{createdAt:'desc'},include:documentInclude}):await prisma.sourceDocument.findUnique({where:{id:path[1]},include:documentInclude});if(!document||!await permission(document.caseId,user.id,'write'))return fail('문서를 찾을 수 없습니다.',404,'NOT_FOUND');if(document.status!==DocumentStatus.NEEDS_REVIEW)return fail('확정 가능한 문서가 아닙니다.');const value=parsed(z.object({fields:z.record(z.string(),z.unknown()).optional(),confirmed:z.boolean().optional()}),raw);if(isResponse(value))return value;
    const currentFields=Object.fromEntries((document.extractionJobs[0]?.fields??[]).map(field=>[field.fieldName,field.valueJson]));const finalFields=value.fields??currentFields;await prisma.$transaction(async tx=>{await tx.sourceDocument.update({where:{id:document.id},data:{status:DocumentStatus.CONFIRMED,confirmedAt:new Date()}});const job=document.extractionJobs[0];if(job){await tx.extractionJob.update({where:{id:job.id},data:{status:JobStatus.CONFIRMED,confirmedAt:new Date(),confirmedById:user.id}});if(value.fields){await tx.extractedField.deleteMany({where:{extractionJobId:job.id}});await tx.extractedField.createMany({data:Object.entries(value.fields).map(([fieldName,valueJson])=>({extractionJobId:job.id,fieldName,valueJson:valueJson as Prisma.InputJsonValue}))});}}const startsAt=typeof finalFields.dateTime==='string'?new Date(finalFields.dateTime):null;if(startsAt&&!Number.isNaN(startsAt.getTime()))await tx.event.create({data:{caseId:document.caseId,sourceDocumentId:document.id,title:`${document.originalName} 일정`,startsAt,location:typeof finalFields.location==='string'?finalFields.location:null,important:true,createdById:user.id}});const tasks=Array.isArray(finalFields.caregiverTasks)?finalFields.caregiverTasks.filter(item=>typeof item==='string'&&item.trim()).slice(0,20) as string[]:[];if(tasks.length)await tx.task.createMany({data:tasks.map(title=>({caseId:document.caseId,sourceDocumentId:document.id,title,createdById:user.id}))});});const updated=await prisma.sourceDocument.findUniqueOrThrow({where:{id:document.id},include:documentInclude});await audit('extraction_confirmed',user.id,document.id,document.caseId);await notifyCase(document.caseId,user.id,'DOCUMENT_CONFIRMED',document.id);return ok({analysis:await documentDto(updated)});
  }
  if(key==='invitations'||(path[0]==='cases'&&path[2]==='invitations')){
    const caseId=explicitCaseId;if(!caseId||!await permission(caseId,user.id,'manage'))return fail('초대 권한이 없습니다.',403,'FORBIDDEN');const input=raw as any;const value=parsed(z.object({email:z.string().email(),role:z.enum(['MANAGER','CAREGIVER','VIEWER']),expiresInHours:z.coerce.number().int().min(1).max(168).default(48)}),{email:input.email??input.recipient,role:input.role==='EDITOR'?'MANAGER':input.role,expiresInHours:input.expiresInHours??48});if(isResponse(value))return value;const token=newToken();const invitation=await prisma.invitation.create({data:{caseId,inviterId:user.id,role:dbRole(value.role),inviteeEmail:value.email.toLowerCase(),tokenHash:sha256(token),expiresAt:new Date(Date.now()+value.expiresInHours*3600000)}});const invited=await prisma.userCredential.findUnique({where:{email:value.email.toLowerCase()}});if(invited)await prisma.notification.create({data:{userId:invited.userId,category:'FAMILY_INVITATION',channel:'IN_APP',templateKey:'family_invitation',dedupeKey:`invite:${invitation.id}`,status:'SENT',scheduledAt:new Date(),sentAt:new Date()}});await audit('family_invited',user.id,invitation.id,caseId);return ok({invitation:{id:invitation.id,caseId,email:invitation.inviteeEmail,role:value.role,token,expiresAt:invitation.expiresAt.toISOString(),status:'PENDING'}},201);
  }
  const legacyKind=['care-logs','handoffs','questions','expenses','discharge/items'].includes(key)?key:null;const explicitKind=path[0]==='cases'&&path.length===3?path[2]==='discharge-items'?'discharge/items':path[2]:null;const kind=legacyKind??explicitKind;
  if(kind&&['care-logs','handoffs','questions','expenses','discharge/items'].includes(kind)){
    const caseId=explicitCaseId;if(!caseId||!await permission(caseId,user.id,'write'))return fail('이 돌봄방에는 작성 권한이 없습니다.',403,'FORBIDDEN');let item:any;
    if(kind==='care-logs'){
      const optionalText=z.preprocess(value=>typeof value==='string'&&value.trim()===''?undefined:value,z.string().trim().max(2000).optional());
      const value=parsed(z.object({
        recordedAt:z.preprocess(value=>value===''?undefined:value,z.coerce.date().optional()),meal:optionalText,mealType:z.enum(['조식','중식','석식','간식','해당 없음','BREAKFAST','LUNCH','DINNER','SNACK','NONE']).optional().transform(value=>(<{[key:string]:string}>{BREAKFAST:'조식',LUNCH:'중식',DINNER:'석식',SNACK:'간식',NONE:'해당 없음'})[value??'']??value),mealAmount:optionalText,
        hydration:optionalText,temperature:z.preprocess(value=>value===''?undefined:value,z.coerce.number().min(30).max(45).optional()),
        pain:z.preprocess(value=>value===''?undefined:value,z.coerce.number().int().min(0).max(10).optional()),medication:optionalText,
        bowelMovement:optionalText,sleep:optionalText,mobility:optionalText,mood:optionalText,neededItems:optionalText,heardFromStaff:optionalText,note:optionalText,
      }).refine(value=>Object.entries(value).some(([key,field])=>key!=='recordedAt'&&field!==undefined),{message:'기록할 내용을 하나 이상 입력해 주세요.'}),raw);
      if(isResponse(value))return value;
      const details={mealType:value.mealType,mealAmount:value.mealAmount,hydration:value.hydration,temperature:value.temperature,medication:value.medication};
      item=await prisma.careLog.create({data:{caseId,authorId:user.id,recordedAt:value.recordedAt,meal:value.meal,reportedPain:value.pain,bowelMovement:value.bowelMovement,sleep:value.sleep,mobility:value.mobility,mood:value.mood,neededItems:value.neededItems,heardFromStaff:value.heardFromStaff,note:value.note,detailsJson:details as Prisma.InputJsonValue}});
    }
    if(kind==='handoffs')item=await prisma.handoffReport.create({data:{caseId,authorId:user.id,contentJson:raw as Prisma.InputJsonValue,periodStart:new Date(),periodEnd:new Date(Date.now()+86400000)}});
    if(kind==='questions'){const value=parsed(z.object({question:z.string().min(1),answer:z.string().optional()}),raw);if(isResponse(value))return value;item=await prisma.roundingQuestion.create({data:{caseId,authorId:user.id,question:value.question,answer:value.answer,answerRecordedById:value.answer?user.id:null,answeredAt:value.answer?new Date():null}});}
    if(kind==='expenses'){const value=parsed(z.object({title:z.string().min(1),amount:z.coerce.number().int().positive(),split:z.unknown().optional()}),raw);if(isResponse(value))return value;item=await prisma.expense.create({data:{caseId,paidById:user.id,title:value.title,amountKrw:value.amount,occurredAt:new Date()}});}
    if(kind==='discharge/items'){const value=parsed(z.object({title:z.string().min(1),completed:z.boolean()}),raw);if(isResponse(value))return value;let plan=await prisma.dischargePlan.findFirst({where:{caseId,completedAt:null},orderBy:{startedAt:'desc'}});plan??=await prisma.dischargePlan.create({data:{caseId}});const old=await prisma.dischargeItem.findFirst({where:{dischargePlanId:plan.id,title:value.title}});item=old?await prisma.dischargeItem.update({where:{id:old.id},data:{completedAt:value.completed?new Date():null,completedById:value.completed?user.id:null}}):await prisma.dischargeItem.create({data:{dischargePlanId:plan.id,phase:'BEFORE',title:value.title,completedAt:value.completed?new Date():null,completedById:value.completed?user.id:null}});}
    await audit(`${kind}_created`,user.id,item.id,caseId);await notifyCase(caseId,user.id,kind,item.id);return ok({item:{...item,kind,caseId,data:raw,createdAt:(item.createdAt??new Date()).toISOString?.()??new Date().toISOString()}},201);
  }
  if(path[0]==='payments'&&path[2]==='refund'){
    const payment=await prisma.paymentEvent.findFirst({where:{id:path[1],subscription:{userId:user.id}},include:{subscription:{include:{plan:true}}}});if(!payment||payment.status!==PaymentStatus.SUCCEEDED)return fail('환불 가능한 결제를 찾을 수 없습니다.',404,'NOT_FOUND');const refundId=`refund:${payment.id}`;const existing=await prisma.paymentEvent.findUnique({where:{provider_providerEventId:{provider:'test',providerEventId:refundId}}});if(existing)return ok({payment:{id:payment.id,status:'REFUNDED'},refunded:true});await prisma.$transaction([prisma.paymentEvent.update({where:{id:payment.id},data:{status:PaymentStatus.REFUNDED}}),prisma.paymentEvent.create({data:{subscriptionId:payment.subscriptionId,provider:'test',providerEventId:refundId,type:'REFUND',status:PaymentStatus.REFUNDED,amountKrw:-payment.amountKrw,occurredAt:new Date(),rawReference:payment.id}}),prisma.subscription.update({where:{id:payment.subscriptionId!},data:{status:SubscriptionStatus.REFUNDED}})]);await audit('payment_refunded',user.id,payment.id);return ok({payment:{id:payment.id,status:'REFUNDED'},refunded:true});
  }
  if(key==='payments/checkout'){
    if(process.env.FREE_SERVICE!=='false')return fail('보호자노트는 현재 모든 기능을 무료로 제공합니다.',410,'SERVICE_IS_FREE');
    if((process.env.PAYMENT_PROVIDER??'test')!=='test')return fail('실결제 공급자 연결과 사업자 고지가 완료되지 않았습니다.',503,'PAYMENT_PROVIDER_NOT_CONFIGURED');
    const normalized={...(raw as any),plan:(raw as any).plan==='HOSPITAL_PASS'?'ADMISSION_PASS':(raw as any).plan};const value=parsed(z.object({plan:z.enum(['ADMISSION_PASS','FAMILY_MONTHLY','FAMILY_YEARLY']),testOutcome:z.enum(['success','failure']).default('success'),idempotencyKey:z.string().min(8).max(100).optional()}),normalized);if(isResponse(value))return value;const providerEventId=value.idempotencyKey?`checkout:${sha256(`${user.id}:${value.idempotencyKey}`).slice(0,40)}`:randomUUID();const duplicate=await prisma.paymentEvent.findUnique({where:{provider_providerEventId:{provider:'test',providerEventId}},include:{subscription:{include:{plan:true}}}});if(duplicate&&duplicate.subscription?.userId===user.id)return ok({payment:{id:duplicate.id,userId:user.id,plan:duplicate.subscription.plan.code,amount:duplicate.amountKrw,status:duplicate.status===PaymentStatus.SUCCEEDED?'PAID':'FAILED',createdAt:duplicate.createdAt.toISOString()},mode:'test',idempotent:true},duplicate.status===PaymentStatus.SUCCEEDED?200:402);const plan=await prisma.plan.findUniqueOrThrow({where:{code:value.plan}});const succeeded=value.testOutcome==='success';const subscription=await prisma.subscription.create({data:{userId:user.id,planId:plan.id,status:succeeded?SubscriptionStatus.ACTIVE:SubscriptionStatus.PAST_DUE,provider:'test',startsAt:succeeded?new Date():null,endsAt:succeeded?new Date(Date.now()+(plan.billingPeriodDays??30)*86400000):null}});const payment=await prisma.paymentEvent.create({data:{subscriptionId:subscription.id,provider:'test',providerEventId,type:'CHECKOUT',status:succeeded?PaymentStatus.SUCCEEDED:PaymentStatus.FAILED,amountKrw:plan.priceKrw,occurredAt:new Date()}});await audit(succeeded?'purchase_completed':'payment_failed',user.id,payment.id);return ok({payment:{id:payment.id,userId:user.id,plan:value.plan,amount:plan.priceKrw,status:succeeded?'PAID':'FAILED',createdAt:payment.createdAt.toISOString()},mode:'test'},succeeded?201:402);
  }
  if(key==='privacy/delete'){
    const requestItem=await createPrivacy(user.id,'DELETION');await prisma.$transaction([prisma.authSession.deleteMany({where:{userId:user.id}}),prisma.caseMember.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}}),prisma.userCredential.update({where:{userId:user.id},data:{email:`deleted-${user.id}@invalid.local`,passwordHash:await hash(newToken(),10)}}),prisma.user.update({where:{id:user.id},data:{status:UserStatus.DELETED,deletedAt:new Date()}})]);await audit('account_deletion_requested',user.id,requestItem.id);return ok({request:privacyDto(requestItem)},201);
  }
  if(key==='privacy-requests'){const value=parsed(z.object({type:z.enum(['EXPORT','CORRECTION','DELETION','SUSPENSION']),detail:z.string().max(1000).optional()}),raw);if(isResponse(value))return value;const item=await createPrivacy(user.id,value.type,value.detail);await audit('privacy_request_created',user.id,item.id);return ok({request:privacyDto(item)},201);}
  if(key==='admin/legal'||key==='admin/notices'){
    const actor=await admin(request);if(isResponse(actor))return actor;
    if(key==='admin/legal'){const value=parsed(z.object({slug:z.string().min(2),title:z.string().min(2),version:z.string().min(1),body:z.string().min(10),published:z.boolean().default(false)}),raw);if(isResponse(value))return value;const document=await prisma.legalDocument.upsert({where:{type:value.slug},update:{title:value.title},create:{type:value.slug,title:value.title}});const version=await prisma.legalDocumentVersion.create({data:{legalDocumentId:document.id,version:value.version,bodyMd:value.body,bodySha256:sha256(value.body),effectiveAt:new Date(),publishedAt:value.published?new Date():null,status:value.published?PublicationStatus.PUBLISHED:PublicationStatus.DRAFT}});await audit('legal_document_created',actor.id,version.id);return ok({document:{id:version.id,slug:value.slug,title:value.title,version:value.version,body:value.body,published:value.published,updatedAt:version.createdAt.toISOString()}},201);}
    const input=raw as any;const value=parsed(z.object({title:z.string().min(2),body:z.string().min(2),published:z.boolean().default(false)}),{...input,body:input.body??input.content,published:input.published??true});if(isResponse(value))return value;const version=(await prisma.serviceNotice.aggregate({_max:{version:true},where:{slug:'service-notice'}}))._max.version??0;const notice=await prisma.serviceNotice.create({data:{slug:'service-notice',version:version+1,category:'SERVICE',title:value.title,bodyMd:value.body,bodySha256:sha256(value.body),status:value.published?PublicationStatus.PUBLISHED:PublicationStatus.DRAFT,publishedAt:value.published?new Date():null}});await audit('notice_created',actor.id,notice.id);return ok({notice:{id:notice.id,title:notice.title,body:notice.bodyMd,published:value.published,updatedAt:notice.createdAt.toISOString()}},201);
  }
  return fail('API 경로를 찾을 수 없습니다.',404,'NOT_FOUND');
}

async function handlePATCH(request:NextRequest,context:RouteContext){
  const path=await pathOf(context);const key=path.join('/');const raw=await requestBody(request);
  if((path[0]==='cases'&&path[2]==='tasks'&&path[3])||(path[0]==='tasks'&&path[1])){
    const user=await auth(request);if(isResponse(user))return user;const taskId=path[0]==='cases'?path[3]:path[1];const task=await prisma.task.findFirst({where:{id:taskId,deletedAt:null}});if(!task||path[0]==='cases'&&task.caseId!==path[1])return fail('할 일을 찾을 수 없습니다.',404,'NOT_FOUND');if(!await permission(task.caseId,user.id,'write'))return fail('할 일 변경 권한이 없습니다.',403,'FORBIDDEN');
    const value=parsed(z.object({status:z.enum(['OPEN','TODO','DOING','DONE'])}),raw);if(isResponse(value))return value;const done=value.status==='DONE';const status=value.status==='OPEN'?TaskStatus.TODO:value.status as TaskStatus;const item=await prisma.task.update({where:{id:task.id},data:{status,completedAt:done?new Date():null,completedById:done?user.id:null}});await audit('task_status_changed',user.id,item.id,item.caseId);await notifyCase(item.caseId,user.id,'TASK_UPDATED',item.id);return ok({task:{id:item.id,title:item.title,status:done?'DONE':item.status==='TODO'?'OPEN':item.status,dueAt:item.dueAt?.toISOString()}});
  }
  if(key==='preferences'){const user=await auth(request);if(isResponse(user))return user;const value=parsed(z.object({channel:z.string().min(1),enabled:z.boolean()}),raw);if(isResponse(value))return value;const marketing=value.channel.startsWith('marketing');const item=await prisma.notificationPreference.upsert({where:{userId_channel:{userId:user.id,channel:value.channel}},update:marketing?{marketingEnabled:value.enabled}:{transactionalEnabled:value.enabled},create:{userId:user.id,channel:value.channel,transactionalEnabled:marketing?true:value.enabled,marketingEnabled:marketing?value.enabled:false}});await audit('preference_updated',user.id,value.channel);return ok({preference:{channel:item.channel,enabled:value.enabled}});}
  const actor=await admin(request);if(!key.startsWith('admin/')||isResponse(actor))return isResponse(actor)?actor:fail('허용되지 않은 요청입니다.',403,'FORBIDDEN');
  if(path[1]==='privacy-requests'){const item=await prisma.privacyRequest.findUnique({where:{id:path[2]}});if(!item)return fail('요청을 찾을 수 없습니다.',404,'NOT_FOUND');const value=parsed(z.object({status:z.enum(['PROCESSING','COMPLETED','REJECTED']),response:z.string().max(2000).optional()}),raw);if(isResponse(value))return value;const updated=await prisma.privacyRequest.update({where:{id:item.id},data:{status:value.status as RequestStatus,resultSummary:value.response,completedAt:value.status==='COMPLETED'?new Date():null}});await prisma.privacyRequestAction.create({data:{privacyRequestId:item.id,actorUserId:actor.id,action:value.status,note:value.response}});await audit('privacy_request_updated',actor.id,item.id);return ok({request:privacyDto(updated)});}
  if(path[1]==='legal'){const value=parsed(z.object({published:z.boolean().optional(),title:z.string().min(2).optional(),body:z.string().min(2).optional()}),raw);if(isResponse(value))return value;const old=await prisma.legalDocumentVersion.findUnique({where:{id:path[2]},include:{legalDocument:true}});if(!old)return fail('항목을 찾을 수 없습니다.',404,'NOT_FOUND');if(value.title)await prisma.legalDocument.update({where:{id:old.legalDocumentId},data:{title:value.title}});const item=await prisma.legalDocumentVersion.update({where:{id:old.id},data:{bodyMd:value.body,bodySha256:value.body?sha256(value.body):undefined,status:value.published===undefined?undefined:value.published?PublicationStatus.PUBLISHED:PublicationStatus.DRAFT,publishedAt:value.published?new Date():value.published===false?null:undefined}});return ok({item});}
  if(path[1]==='notices'){const value=parsed(z.object({published:z.boolean().optional(),title:z.string().min(2).optional(),body:z.string().min(2).optional()}),raw);if(isResponse(value))return value;const item=await prisma.serviceNotice.update({where:{id:path[2]},data:{title:value.title,bodyMd:value.body,bodySha256:value.body?sha256(value.body):undefined,status:value.published===undefined?undefined:value.published?PublicationStatus.PUBLISHED:PublicationStatus.DRAFT,publishedAt:value.published?new Date():value.published===false?null:undefined}});return ok({item});}
  return fail('API 경로를 찾을 수 없습니다.',404,'NOT_FOUND');
}

async function handleDELETE(request:NextRequest,context:RouteContext){const path=await pathOf(context);const user=await auth(request);if(isResponse(user))return user;if(path[0]==='cases'&&path[2]==='documents'){const document=await prisma.sourceDocument.findFirst({where:{id:path[3],caseId:path[1],deletedAt:null}});if(!document||!await permission(path[1],user.id,'write'))return fail('문서를 찾을 수 없습니다.',404,'NOT_FOUND');await prisma.sourceDocument.update({where:{id:document.id},data:{deletedAt:new Date(),status:DocumentStatus.DELETION_PENDING}});if(!document.storageKey.includes(':'))await removeUpload(document.storageKey);await audit('document_deleted',user.id,document.id,document.caseId);return ok({success:true});}if(path[0]==='invitations'){const invitation=await prisma.invitation.findUnique({where:{id:path[1]}});if(!invitation||!await permission(invitation.caseId,user.id,'manage'))return fail('초대를 찾을 수 없습니다.',404,'NOT_FOUND');await prisma.invitation.update({where:{id:invitation.id},data:{revokedAt:new Date()}});await audit('invitation_revoked',user.id,invitation.id,invitation.caseId);return ok({success:true});}return fail('API 경로를 찾을 수 없습니다.',404,'NOT_FOUND');}

async function createPrivacy(userId:string,type:string,detail?:string){const item=await prisma.privacyRequest.create({data:{requestNumber:`PR-${Date.now()}-${randomUUID().slice(0,6)}`,userId,type,status:RequestStatus.RECEIVED,dueAt:new Date(Date.now()+30*86400000),resultSummary:detail}});await prisma.privacyRequestAction.create({data:{privacyRequestId:item.id,actorUserId:userId,action:'RECEIVED',note:detail}});return item;}
async function deleteScheduleResource(request:NextRequest,context:RouteContext){
  const path=await pathOf(context);if(!((path[0]==='cases'&&['events','tasks'].includes(path[2])&&path[3])||(['events','tasks'].includes(path[0])&&path[1])))return null;
  const user=await auth(request);if(isResponse(user))return user;const kind=path[0]==='cases'?path[2]:path[0];const targetId=path[0]==='cases'?path[3]:path[1];const item=kind==='events'?await prisma.event.findFirst({where:{id:targetId,deletedAt:null}}):await prisma.task.findFirst({where:{id:targetId,deletedAt:null}});
  if(!item||path[0]==='cases'&&item.caseId!==path[1])return fail(kind==='events'?'일정을 찾을 수 없습니다.':'할 일을 찾을 수 없습니다.',404,'NOT_FOUND');if(!await permission(item.caseId,user.id,'write'))return fail('삭제 권한이 없습니다.',403,'FORBIDDEN');
  if(kind==='events')await prisma.event.update({where:{id:item.id},data:{deletedAt:new Date()}});else await prisma.task.update({where:{id:item.id},data:{deletedAt:new Date()}});await audit(`${kind.slice(0,-1)}_deleted`,user.id,item.id,item.caseId);return ok({success:true});
}
function privacyDto(item:any){return {id:item.id,userId:item.userId,type:item.type,detail:item.resultSummary,status:item.status==='IN_REVIEW'?'PROCESSING':item.status,response:item.resultSummary,createdAt:item.createdAt.toISOString(),updatedAt:(item.completedAt??item.createdAt).toISOString()};}

type RouteContext={params:Promise<{path:string[]}>};
export async function GET(request:NextRequest,context:RouteContext){await ensureBootstrap();return handleGET(request,context);}
export async function POST(request:NextRequest,context:RouteContext){await ensureBootstrap();const csrf=csrfFailure(request);if(csrf)return csrf;const limited=await rateLimit(request,'mutation',rawToken(request)??'anonymous',180,60_000);return limited??handlePOST(request,context);}
export async function PATCH(request:NextRequest,context:RouteContext){await ensureBootstrap();const csrf=csrfFailure(request);if(csrf)return csrf;const limited=await rateLimit(request,'mutation',rawToken(request)??'anonymous',180,60_000);return limited??handlePATCH(request,context);}
export async function DELETE(request:NextRequest,context:RouteContext){await ensureBootstrap();const csrf=csrfFailure(request);if(csrf)return csrf;const limited=await rateLimit(request,'mutation',rawToken(request)??'anonymous',180,60_000);if(limited)return limited;return await deleteScheduleResource(request,context)??handleDELETE(request,context);}
