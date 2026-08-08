import {expect,test} from '@playwright/test';

const account=(email:string)=>({email,password:'Password123!',name:'보안검수 보호자',ageConfirmed:true,terms:true,privacy:true});

test('보안 헤더·요청 위조 방지·로그인 호출 제한·민감 접근 감사가 작동한다',async({page,browser})=>{
  const home=await page.request.get('/');
  expect(home.headers()['x-content-type-options']).toBe('nosniff');
  expect(home.headers()['x-frame-options']).toBe('DENY');
  expect(home.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

  const email=`security-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  const created=await page.request.post('/api/cases',{data:{patientAlias:'보안 검수',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  const caseId=(await created.json()).case.id as string;
  expect((await page.request.post('/api/cases',{headers:{Origin:'https://attacker.example'},data:{patientAlias:'위조 요청',relationship:'타인',authority:'CAREGIVER',sensitiveConsent:true}})).status()).toBe(403);
  expect((await page.request.get(`/api/cases/${caseId}/overview`)).status()).toBe(200);

  const attackContext=await browser.newContext();const attack=await attackContext.newPage();
  for(let attempt=0;attempt<5;attempt++)expect((await attack.request.post('/api/auth/login',{data:{email,password:'wrong-password'}})).status()).toBe(401);
  const blocked=await attack.request.post('/api/auth/login',{data:{email,password:'wrong-password'}});
  expect(blocked.status()).toBe(429);expect(blocked.headers()['retry-after']).toBeTruthy();await attackContext.close();

  const adminContext=await browser.newContext();const admin=await adminContext.newPage();
  expect((await admin.request.post('/api/auth/login',{data:{email:'admin@guardian.local',password:'admin1234'}})).status()).toBe(200);
  const audit=await (await admin.request.get('/api/admin/audit')).json();
  expect(audit.items).toEqual(expect.arrayContaining([expect.objectContaining({action:'sensitive_case_read',target:caseId})]));
  await adminContext.close();
});
