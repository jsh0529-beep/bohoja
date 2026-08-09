import {expect,test,type APIRequestContext} from '@playwright/test';

const account=(email:string,name:string)=>({email,password:'Password123!',name,ageConfirmed:true,terms:true,privacy:true});
async function signup(request:APIRequestContext,email:string,name:string){
  const response=await request.post('/api/auth/signup',{data:account(email,name)});expect(response.status()).toBe(201);
  const body=await response.json();expect((await request.post('/api/auth/verify-email',{data:{code:body.testCode}})).status()).toBe(200);
}

test('가족 권한은 화면과 직접 API 접근에서 동일하게 적용된다',async({page,browser})=>{
  test.setTimeout(90_000);await page.setViewportSize({width:360,height:800});const stamp=Date.now();
  const ownerEmail=`role-owner-${stamp}@test.local`;const managerEmail=`role-manager-${stamp}@test.local`;const viewerEmail=`role-viewer-${stamp}@test.local`;const cancelledEmail=`role-cancelled-${stamp}@test.local`;
  await signup(page.request,ownerEmail,'소유자 보호자');
  const caseResponse=await page.request.post('/api/cases',{data:{patientAlias:'가족 권한 검수',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});expect(caseResponse.status()).toBe(201);const caseId=(await caseResponse.json()).case.id as string;

  const managerContext=await browser.newContext();const managerPage=await managerContext.newPage();await signup(managerPage.request,managerEmail,'공동관리 후보');
  const managerInvite=await page.request.post(`/api/cases/${caseId}/invitations`,{data:{email:managerEmail,role:'CAREGIVER',expiresInHours:48}});expect(managerInvite.status()).toBe(201);expect((await managerPage.request.post('/api/invitations/accept',{data:{token:(await managerInvite.json()).invitation.token}})).status()).toBe(200);

  const viewerContext=await browser.newContext();const viewerPage=await viewerContext.newPage();await signup(viewerPage.request,viewerEmail,'열람 가족');
  const viewerInvite=await page.request.post(`/api/cases/${caseId}/invitations`,{data:{email:viewerEmail,role:'VIEWER',expiresInHours:48}});expect(viewerInvite.status()).toBe(201);expect((await viewerPage.request.post('/api/invitations/accept',{data:{token:(await viewerInvite.json()).invitation.token}})).status()).toBe(200);

  let overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
  const managerId=overview.members.find((item:{email:string})=>item.email===managerEmail).userId as string;const viewerId=overview.members.find((item:{email:string})=>item.email===viewerEmail).userId as string;const ownerId=overview.members.find((item:{email:string})=>item.email===ownerEmail).userId as string;
  expect((await managerPage.request.post(`/api/cases/${caseId}/care-logs`,{data:{note:'보호자 기록'}})).status()).toBe(201);
  expect((await viewerPage.request.post(`/api/cases/${caseId}/care-logs`,{data:{note:'열람자 작성 차단'}})).status()).toBe(403);
  const ownerEvent=await page.request.post(`/api/cases/${caseId}/events`,{data:{title:'권한 검수 일정'}});const eventId=(await ownerEvent.json()).event.id as string;
  const ownerTask=await page.request.post(`/api/cases/${caseId}/tasks`,{data:{title:'권한 검수 할 일'}});const taskId=(await ownerTask.json()).task.id as string;
  expect((await viewerPage.request.patch(`/api/cases/${caseId}/events/${eventId}`,{data:{title:'열람자 변경 차단'}})).status()).toBe(403);
  expect((await viewerPage.request.patch(`/api/cases/${caseId}/tasks/${taskId}`,{data:{status:'DONE'}})).status()).toBe(403);
  expect((await viewerPage.request.delete(`/api/cases/${caseId}/tasks/${taskId}`)).status()).toBe(403);
  const viewerOverview=await (await viewerPage.request.get(`/api/cases/${caseId}/overview`)).json();
  expect(viewerOverview.members.find((item:{userId:string})=>item.userId===viewerId).email).toBe(viewerEmail);
  expect(viewerOverview.members.filter((item:{userId:string})=>item.userId!==viewerId).every((item:{email:string})=>item.email==='')).toBe(true);

  await page.goto('/family');await expect(page.getByLabel('가족 역할 안내')).toBeVisible();
  await expect(page.getByText('소유자 보호자 (나)')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await page.getByLabel('공동관리 후보 권한').selectOption('MANAGER');
  await expect(page.getByText('공동관리 후보님의 권한을 변경했어요.')).toBeVisible();

  await managerPage.goto('/family');await expect(managerPage.getByRole('heading',{name:'가족과 함께'})).toBeVisible();
  await expect(managerPage.getByLabel('초대 권한').locator('option[value="MANAGER"]')).toHaveCount(0);
  await expect(managerPage.getByText('소유자 보호자')).toBeVisible();
  await expect(managerPage.getByLabel('소유자 보호자 권한')).toHaveCount(0);
  expect((await managerPage.request.post(`/api/cases/${caseId}/invitations`,{data:{email:`blocked-${stamp}@test.local`,role:'MANAGER',expiresInHours:48}})).status()).toBe(403);
  expect((await managerPage.request.patch(`/api/cases/${caseId}/members/${viewerId}`,{data:{role:'MANAGER'}})).status()).toBe(403);
  managerPage.once('dialog',dialog=>dialog.accept());await managerPage.getByLabel('열람 가족 권한').selectOption('CAREGIVER');
  await expect(managerPage.getByText('열람 가족님의 권한을 변경했어요.')).toBeVisible();
  expect((await managerPage.request.delete(`/api/cases/${caseId}/members/${ownerId}`)).status()).toBe(403);

  const strangerContext=await browser.newContext();const strangerPage=await strangerContext.newPage();await signup(strangerPage.request,`role-stranger-${stamp}@test.local`,'다른 돌봄방');
  const otherCase=await strangerPage.request.post('/api/cases',{data:{patientAlias:'다른 환자',relationship:'보호자',authority:'CAREGIVER',sensitiveConsent:true}});const otherCaseId=(await otherCase.json()).case.id as string;
  expect([403,404]).toContain((await managerPage.request.get(`/api/cases/${otherCaseId}/overview`)).status());
  expect((await managerPage.request.patch(`/api/cases/${otherCaseId}/members/${viewerId}`,{data:{role:'VIEWER'}})).status()).toBe(404);

  const cancelledInvite=await page.request.post(`/api/cases/${caseId}/invitations`,{data:{email:cancelledEmail,role:'VIEWER',expiresInHours:48}});const cancelled=(await cancelledInvite.json()).invitation;
  await page.reload();const inviteCard=page.locator('.invitation-card').filter({hasText:cancelledEmail});page.once('dialog',dialog=>dialog.accept());await inviteCard.getByRole('button',{name:'초대 취소'}).click();await expect(page.getByText('초대를 취소했어요.')).toBeVisible();
  const cancelledContext=await browser.newContext();const cancelledPage=await cancelledContext.newPage();await signup(cancelledPage.request,cancelledEmail,'취소 초대');expect((await cancelledPage.request.post('/api/invitations/accept',{data:{token:cancelled.token}})).status()).toBe(410);

  expect((await page.request.delete(`/api/cases/${caseId}/members/${managerId}`)).status()).toBe(200);
  expect((await managerPage.request.get(`/api/cases/${caseId}/overview`)).status()).toBe(404);
  overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();expect(overview.members.some((item:{userId:string})=>item.userId===managerId)).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({path:'outputs/guardian-family-permissions-mobile.png',fullPage:true});
  await Promise.all([managerContext.close(),viewerContext.close(),strangerContext.close(),cancelledContext.close()]);
});
