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

test('모바일 홈에서 일정과 할 일을 직접 추가하고 완료·취소·삭제한다',async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:360,height:800});
  const email=`planner-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});expect(signup.status()).toBe(201);
  expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  expect((await page.request.post('/api/cases',{data:{patientAlias:'일정 테스트',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}})).status()).toBe(201);

  await page.goto('/dashboard');
  await page.getByLabel('제목').fill('오전 회진');
  await page.getByLabel('시간 (선택)').fill('2030-01-02T10:30');
  await page.getByLabel('장소 (선택)').fill('본관 2층');
  await page.getByRole('button',{name:'추가',exact:true}).click();
  await expect(page.getByText('오전 회진')).toBeVisible();
  await expect(page.getByText(/본관 2층/)).toBeVisible();

  await page.getByRole('button',{name:'할 일',exact:true}).click();
  await page.getByLabel('제목').fill('물티슈 가져오기');
  await page.getByRole('button',{name:'추가',exact:true}).click();
  await expect(page.getByText('물티슈 가져오기')).toBeVisible();
  await page.getByRole('button',{name:'물티슈 가져오기 완료'}).click();
  await expect(page.getByRole('button',{name:'물티슈 가져오기 미완료로 변경'})).toBeVisible();
  await page.getByRole('button',{name:'물티슈 가져오기 미완료로 변경'}).click();
  await expect(page.getByRole('button',{name:'물티슈 가져오기 완료'})).toBeVisible();
  await page.getByRole('button',{name:'물티슈 가져오기 할 일 삭제'}).click();
  await expect(page.getByText('물티슈 가져오기')).toHaveCount(0);
  await page.getByRole('button',{name:'오전 회진 일정 삭제'}).click();
  await expect(page.getByText('오전 회진')).toHaveCount(0);
  await expect(page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).resolves.toBe(true);
  await page.screenshot({path:'outputs/guardian-care-planner-mobile.png',fullPage:true});
});
