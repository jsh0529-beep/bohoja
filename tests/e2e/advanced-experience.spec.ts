import {expect,test,type APIRequestContext} from '@playwright/test';

const account=(email:string,name:string)=>({email,password:'Password123!',name,ageConfirmed:true,terms:true,privacy:true});
async function signup(request:APIRequestContext,email:string,name:string){
  const response=await request.post('/api/auth/signup',{data:account(email,name)});
  expect(response.status()).toBe(201);
  const body=await response.json();
  expect((await request.post('/api/auth/verify-email',{data:{code:body.testCode}})).status()).toBe(200);
}

test('고도화된 홈·기록·교대·병원생활·안심센터가 모바일에서 이어진다',async({page,browser})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width:360,height:800});
  const stamp=Date.now();
  const ownerEmail=`advanced-owner-${stamp}@test.local`;
  await signup(page.request,ownerEmail,'고도화 보호자');
  const created=await page.request.post('/api/cases',{data:{patientAlias:'고도화 검수',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  expect(created.status()).toBe(201);
  const caseId=(await created.json()).case.id as string;

  await page.request.post(`/api/cases/${caseId}/tasks`,{data:{title:'퇴원 서류 챙기기'}});
  await page.request.post(`/api/cases/${caseId}/events`,{data:{title:'오후 검사 안내 확인',startsAt:new Date(Date.now()+3_600_000).toISOString(),location:'본관 2층'}});
  await page.request.post(`/api/cases/${caseId}/care-logs`,{data:{mealType:'중식',mealAmount:'절반',note:'식후 편하게 쉬는 중'}});

  await test.step('맞춤 홈은 지금 필요한 일부터 보여 준다',async()=>{
    await page.goto('/dashboard');
    const focus=page.getByRole('region',{name:'지금 필요한 돌봄 정보'});
    await expect(focus.getByText('지금 할 일')).toBeVisible();
    await expect(focus.getByRole('heading',{name:'퇴원 서류 챙기기'})).toBeVisible();
    await expect(focus.getByText('오후 검사 안내 확인')).toBeVisible();
    await expect(focus.getByText('최근 돌봄 기록')).toBeVisible();
    await expect(focus.getByText('중식')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  });

  await test.step('작성 중 돌봄 기록은 새로고침 뒤 복구되고 안전하게 저장된다',async()=>{
    await page.goto('/records');
    await page.getByLabel('메모').fill('새로고침에도 남아야 하는 임시 기록');
    await page.reload();
    await expect(page.getByText('이 기기에 남아 있던 작성 내용을 복구했어요.')).toBeVisible();
    await expect(page.getByLabel('메모')).toHaveValue('새로고침에도 남아야 하는 임시 기록');
    await page.getByRole('button',{name:'선택한 내용 저장'}).click();
    await expect(page.getByText('가족에게 돌봄 기록을 공유했어요.')).toBeVisible();
    await expect(page.getByText('새로고침에도 남아야 하는 임시 기록')).toBeVisible();
  });

  await test.step('교대 브리핑은 최근 기록을 불러오고 선택 항목만 전달한다',async()=>{
    await page.goto('/handoff');
    await page.getByRole('button',{name:'최근 기록 불러오기'}).click();
    await expect(page.getByText('최근 기록을 불러왔어요. 전달 전에 내용을 확인해 주세요.')).toBeVisible();
    await page.getByRole('button',{name:'선택한 브리핑 전달'}).click();
    await expect(page.getByText('다음 보호자에게 교대 브리핑을 전달했어요.')).toBeVisible();
    await expect(page.getByText('참여 가족이 모두 확인했어요.')).toBeVisible();
  });

  let utilityId='';
  await test.step('병원생활 정보와 필요 물품은 가족 공유와 할 일로 실제 저장된다',async()=>{
    await page.goto('/hospital');
    await page.getByLabel('병원생활 정보 제목').fill('면회는 오후 2시부터');
    await page.getByLabel('상세 내용 (선택)').fill('병동 안내를 다시 확인해 주세요');
    await page.getByRole('button',{name:'가족과 공유'}).click();
    await expect(page.getByText('병원생활 정보를 가족과 공유했어요.')).toBeVisible();
    await page.getByRole('button',{name:'필요 물품 요청'}).first().click();
    await page.getByLabel('필요 물품 요청 제목').fill('생수 준비');
    await page.getByRole('button',{name:'가족과 공유'}).click();
    const card=page.locator('.utility-card').filter({hasText:'생수 준비'});
    await card.getByRole('button',{name:'할 일로 추가'}).click();
    await expect(page.getByText('가족 할 일에도 추가했어요.')).toBeVisible();
    const overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
    expect(overview.tasks.some((item:{title:string})=>item.title==='생수 준비')).toBeTruthy();
    utilityId=overview.utilities.find((item:{title:string})=>item.title==='면회는 오후 2시부터').id;
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  });

  await test.step('열람자는 내용을 보지만 작성·삭제 API는 차단된다',async()=>{
    const viewerEmail=`advanced-viewer-${stamp}@test.local`;
    const invitation=await (await page.request.post(`/api/cases/${caseId}/invitations`,{data:{email:viewerEmail,role:'VIEWER'}})).json();
    const viewer=await browser.newContext();
    const viewerPage=await viewer.newPage();
    await signup(viewerPage.request,viewerEmail,'열람 가족');
    await viewerPage.request.post('/api/invitations/accept',{data:{token:invitation.invitation.token}});
    expect((await viewerPage.request.post(`/api/cases/${caseId}/utilities`,{data:{kind:'HOSPITAL_INFO',title:'차단'}})).status()).toBe(403);
    expect((await viewerPage.request.delete(`/api/cases/${caseId}/utilities/${utilityId}`)).status()).toBe(403);
    await viewerPage.setViewportSize({width:360,height:800});
    await viewerPage.goto('/hospital');
    await expect(viewerPage.getByText('면회는 오후 2시부터')).toBeVisible();
    await expect(viewerPage.getByRole('button',{name:'가족과 공유'})).toHaveCount(0);
    await viewer.close();
  });

  await test.step('큰 글씨·간편 모드·방해 금지 시간은 저장 후 유지된다',async()=>{
    await page.goto('/settings');
    await page.getByRole('checkbox',{name:/큰 글씨 모드/}).check();
    await page.getByRole('checkbox',{name:/간편 모드/}).check();
    await page.getByLabel('시작').fill('22:00');
    await page.getByLabel('종료').fill('07:00');
    await page.getByRole('button',{name:'방해 금지 시간 저장'}).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-large-text','true');
    await expect(page.locator('html')).toHaveAttribute('data-simple-mode','true');
    await expect(page.getByLabel('시작')).toHaveValue('22:00');
    await expect(page.getByLabel('종료')).toHaveValue('07:00');
  });

  await test.step('알림센터와 안심센터가 실제 기록과 권리요청을 처리한다',async()=>{
    await page.goto('/notifications');
    await expect(page.getByRole('heading',{name:'알림센터'})).toBeVisible();
    await expect(page.getByText('가족·병원')).toBeVisible();
    await page.goto('/trust');
    await expect(page.getByRole('heading',{name:'안심센터'})).toBeVisible();
    await page.getByLabel('요청 종류').selectOption('CORRECTION');
    await page.getByLabel('요청 내용 (선택)').fill('표시 이름을 확인해 주세요');
    await page.getByRole('button',{name:'요청 접수'}).click();
    await expect(page.getByText('요청을 접수했어요. 처리 상태를 여기에서 확인할 수 있습니다.')).toBeVisible();
    await expect(page.getByText('CORRECTION')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  });
});
