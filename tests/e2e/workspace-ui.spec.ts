import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const account=(email:string)=>({email,password:'Password123!',name:'화면검수 보호자',ageConfirmed:true,terms:true,privacy:true});

test('모바일 UI에서 선택한 돌봄방에만 실제 기록이 저장된다',async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:360,height:800});
  const email=`ui-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});expect(signup.status()).toBe(201);expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  const firstResponse=await page.request.post('/api/cases',{data:{patientAlias:'첫 번째 보호대상자',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  const secondResponse=await page.request.post('/api/cases',{data:{patientAlias:'두 번째 보호대상자',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  const firstId=(await firstResponse.json()).case.id as string;
  const secondId=(await secondResponse.json()).case.id as string;

  await page.goto('/dashboard');
  await expect(page.getByLabel('현재 돌봄방')).toBeVisible();
  const dashboardAccessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(dashboardAccessibility.violations,JSON.stringify(dashboardAccessibility.violations,null,2)).toEqual([]);
  await page.getByLabel('현재 돌봄방').selectOption(secondId);
  await expect(page.getByText('두 번째 보호대상자 돌봄방')).toBeVisible();

  await page.goto('/records');
  await expect(page.getByText('필수 항목은 없어요.')).toBeVisible();
  await page.getByRole('button',{name:'조식',exact:true}).click();
  await page.getByRole('button',{name:'절반',exact:true}).click();
  await page.getByLabel('통증 (0~10)').fill('3');
  await page.getByLabel('메모').fill('두 번째 돌봄방 전용 기록');
  await page.getByRole('button',{name:'선택한 내용 저장'}).click();
  await expect(page.getByText('두 번째 돌봄방 전용 기록')).toBeVisible();

  await page.getByRole('button',{name:'선택한 내용 저장'}).click();
  await expect(page.getByText('아직 적힌 내용이 없어요. 한 항목만 골라도 저장할 수 있어요.')).toBeVisible();

  const firstOverview=await (await page.request.get(`/api/cases/${firstId}/overview`)).json();
  const secondOverview=await (await page.request.get(`/api/cases/${secondId}/overview`)).json();
  expect(firstOverview.records).toHaveLength(0);
  expect(secondOverview.records).toEqual(expect.arrayContaining([expect.objectContaining({kind:'care-logs',data:expect.objectContaining({note:'두 번째 돌봄방 전용 기록'})})]));

  await page.getByLabel('현재 돌봄방').selectOption(firstId);
  await expect(page.getByText('두 번째 돌봄방 전용 기록')).toHaveCount(0);
  await expect(page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).resolves.toBe(true);
  await page.screenshot({path:'outputs/guardian-stage1-mobile.png',fullPage:true});
});

test('모바일 홈에서 시간 미정 일정과 담당 할 일을 수정·완료·삭제한다',async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:360,height:800});
  const email=`planner-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});expect(signup.status()).toBe(201);
  expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  const caseResponse=await page.request.post('/api/cases',{data:{patientAlias:'일정 테스트',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  expect(caseResponse.status()).toBe(201);
  const caseId=(await caseResponse.json()).case.id as string;

  await page.goto('/dashboard');
  const planner=page.locator('.advanced-planner');
  await expect(planner.getByText('병원 안내와 의료진에게 다시 확인해 주세요.')).toBeVisible();

  await planner.getByLabel('제목').fill('시간 미정 회진');
  await planner.getByRole('button',{name:'추가',exact:true}).click();
  const eventItem=planner.locator('.planner-item',{hasText:'시간 미정 회진'});
  await expect(eventItem.getByText('시간 미정',{exact:true})).toBeVisible();

  await eventItem.getByRole('button',{name:'수정'}).click();
  const eventEdit=planner.locator('form.planner-edit');
  await eventEdit.getByLabel('제목').fill('오전 회진');
  await eventEdit.getByLabel('시간 (KST, 선택)').fill('2030-01-02T10:30');
  await eventEdit.getByLabel('장소 (선택)').fill('본관 2층');
  await eventEdit.getByRole('button',{name:'수정 저장'}).click();
  const editedEvent=planner.locator('.planner-item',{hasText:'오전 회진'});
  await expect(editedEvent.getByText(/본관 2층/)).toBeVisible();
  await expect(editedEvent.getByText(/1월 2일.*10:30/)).toBeVisible();

  await planner.getByRole('button',{name:'할 일',exact:true}).click();
  await planner.getByLabel('제목').fill('물티슈 가져오기');
  await planner.getByRole('button',{name:'추가',exact:true}).click();
  const taskItem=planner.locator('.planner-item',{hasText:'물티슈 가져오기'});
  await expect(taskItem.getByText(/마감 없음.*담당자 없음/)).toBeVisible();

  await taskItem.getByRole('button',{name:'수정'}).click();
  const taskEdit=planner.locator('form.planner-edit');
  await taskEdit.getByLabel('마감 (KST, 선택)').fill('2030-01-02T11:00');
  await taskEdit.getByLabel('담당 가족 (선택)').selectOption({label:'화면검수 보호자'});
  await taskEdit.getByRole('button',{name:'수정 저장'}).click();
  await expect(taskItem.getByText(/담당 화면검수 보호자/)).toBeVisible();

  await taskItem.getByRole('button',{name:'물티슈 가져오기 완료'}).click();
  await expect(taskItem.getByRole('button',{name:'물티슈 가져오기 완료 취소'})).toBeVisible();
  await expect(taskItem.getByText(/화면검수 보호자 완료/)).toBeVisible();
  await taskItem.getByRole('button',{name:'물티슈 가져오기 완료 취소'}).click();
  await expect(taskItem.getByRole('button',{name:'물티슈 가져오기 완료'})).toBeVisible();
  await expect(taskItem.getByText(/화면검수 보호자 완료/)).toHaveCount(0);

  const overdue=await page.request.post(`/api/cases/${caseId}/tasks`,{data:{title:'기한 지난 준비',dueAt:new Date(Date.now()-3600000).toISOString()}});
  expect(overdue.status()).toBe(201);
  await page.reload();
  await expect(planner.locator('.planner-item',{hasText:'기한 지난 준비'}).getByText('마감 지남')).toBeVisible();

  page.once('dialog',dialog=>{expect(dialog.message()).toContain('실제 돌봄 조치가 취소되는 것은 아니에요');dialog.accept()});
  await taskItem.getByRole('button',{name:'삭제'}).click();
  await expect(planner.getByText('물티슈 가져오기')).toHaveCount(0);
  page.once('dialog',dialog=>{expect(dialog.message()).toContain('병원 예약이나 검사는 취소되지 않아요');dialog.accept()});
  await editedEvent.getByRole('button',{name:'삭제'}).click();
  await expect(planner.getByText('오전 회진')).toHaveCount(0);

  const overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
  expect(overview.events).toHaveLength(0);
  expect(overview.tasks).toEqual(expect.arrayContaining([expect.objectContaining({title:'기한 지난 준비',status:'OPEN'})]));
  expect(page.viewportSize()).toEqual({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({path:'outputs/guardian-schedule-tasks-mobile.png',fullPage:true});
});
test('모바일에서 돌봄 기록을 수정·삭제하고 8초 안에 되돌린다',async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:360,height:800});
  const email=`record-edit-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});expect(signup.status()).toBe(201);
  expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  const caseResponse=await page.request.post('/api/cases',{data:{patientAlias:'수정 검수',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  expect(caseResponse.status()).toBe(201);const caseId=(await caseResponse.json()).case.id as string;
  const created=await page.request.post(`/api/cases/${caseId}/care-logs`,{data:{mealType:'조식',hydration:'한 컵',note:'수정 전 메모'}});
  expect(created.status()).toBe(201);const recordId=(await created.json()).item.id as string;

  await page.goto('/records');
  await expect(page.getByText('수정 전 메모')).toBeVisible();
  await page.getByRole('button',{name:'수정',exact:true}).click();
  const edit=page.locator('form.record-edit');
  await edit.getByLabel('수분 섭취').fill('');
  await edit.getByLabel('생활 상태와 메모').fill('수정한 메모');
  await edit.getByRole('button',{name:'수정 저장'}).click();
  await expect(page.getByText('수정한 메모')).toBeVisible();
  await expect(page.getByText('수분 한 컵')).toHaveCount(0);
  await expect(page.getByText(/수정 \d/)).toBeVisible();

  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'삭제',exact:true}).click();
  await expect(page.getByText('기록을 삭제했어요.')).toBeVisible();
  await expect(page.getByText('수정한 메모')).toHaveCount(0);
  await page.getByRole('button',{name:'되돌리기'}).click();
  await expect(page.getByText('수정한 메모')).toBeVisible();

  const overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
  expect(overview.records).toEqual(expect.arrayContaining([expect.objectContaining({id:recordId,data:expect.objectContaining({hydration:null,note:'수정한 메모'})})]));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({path:'outputs/guardian-record-edit-mobile.png',fullPage:true});
});
