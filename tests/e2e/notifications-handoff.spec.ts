import {expect,test,type APIRequestContext} from '@playwright/test';

const account=(email:string,name:string)=>({email,password:'Password123!',name,ageConfirmed:true,terms:true,privacy:true});
async function signup(request:APIRequestContext,email:string,name:string){const response=await request.post('/api/auth/signup',{data:account(email,name)});expect(response.status()).toBe(201);const body=await response.json();expect((await request.post('/api/auth/verify-email',{data:{code:body.testCode}})).status()).toBe(200);}

test('첫 화면은 시작을 우선하고 로그인은 작게 보인다',async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto('/');
  await expect(page.getByRole('heading',{name:'가족 돌봄을 한곳에서, 놓치지 않게 기록하세요.'})).toBeVisible();
  await expect(page.getByRole('link',{name:'무료로 보호자노트 시작'})).toBeVisible();
  await expect(page.getByRole('link',{name:'가입 없이 마음쉼터 둘러보기'})).toBeVisible();
  const login=page.getByRole('link',{name:'로그인'});await expect(login).toBeVisible();expect((await login.boundingBox())!.width).toBeLessThan(100);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
});

test('알림 읽음과 교대 브리핑 확인이 가족별로 동작한다',async({browser})=>{
  const stamp=Date.now();const ownerEmail=`notify-owner-${stamp}@test.local`;const familyEmail=`notify-family-${stamp}@test.local`;
  const owner=await browser.newContext();const ownerPage=await owner.newPage();await signup(ownerPage.request,ownerEmail,'알림 소유자');
  const created=await ownerPage.request.post('/api/cases',{data:{patientAlias:'알림 테스트',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});const caseId=(await created.json()).case.id;
  const invitation=await (await ownerPage.request.post(`/api/cases/${caseId}/invitations`,{data:{email:familyEmail,role:'CAREGIVER'}})).json();
  const family=await browser.newContext();const familyPage=await family.newPage();await signup(familyPage.request,familyEmail,'교대 가족');await familyPage.request.post('/api/invitations/accept',{data:{token:invitation.invitation.token}});

  const empty=await ownerPage.request.post(`/api/cases/${caseId}/handoffs`,{data:{status:' ',next:''}});expect(empty.status()).toBe(400);
  const handoff=await ownerPage.request.post(`/api/cases/${caseId}/handoffs`,{data:{status:'점심은 절반 먹고 편히 쉬는 중'}});expect(handoff.status()).toBe(201);const handoffId=(await handoff.json()).item.id;
  let overview=await (await familyPage.request.get(`/api/cases/${caseId}/overview`)).json();const notice=overview.notifications.find((item:{category:string})=>item.category==='handoffs');expect(notice.readAt).toBeNull();
  expect((await familyPage.request.patch(`/api/notifications/${notice.id}`,{data:{read:true}})).status()).toBe(200);
  expect((await ownerPage.request.patch(`/api/notifications/${notice.id}`,{data:{read:true}})).status()).toBe(404);
  expect((await familyPage.request.post(`/api/cases/${caseId}/handoffs/${handoffId}/acknowledge`,{data:{}})).status()).toBe(200);
  overview=await (await familyPage.request.get(`/api/cases/${caseId}/overview`)).json();const record=overview.records.find((item:{id:string})=>item.id===handoffId);expect(record.data).toMatchObject({acknowledgedByMe:true,acknowledgementCount:1});
  expect((await familyPage.request.post(`/api/cases/${caseId}/handoffs`,{data:{next:'오후 검사 시간 다시 확인'}})).status()).toBe(201);

  await familyPage.setViewportSize({width:360,height:800});await familyPage.goto('/handoff');await expect(familyPage.getByRole('heading',{name:'30초 교대 브리핑'})).toBeVisible();await expect(familyPage.getByText('점심은 절반 먹고 편히 쉬는 중')).toBeVisible();expect(await familyPage.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  await family.close();await owner.close();
});
