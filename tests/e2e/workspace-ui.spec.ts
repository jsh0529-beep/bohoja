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
  await page.getByLabel('식사').fill('죽 절반');
  await page.getByLabel('통증 (0~10)').fill('3');
  await page.getByLabel('상태와 특이사항').fill('두 번째 돌봄방 전용 기록');
  await page.getByRole('button',{name:'기록 저장'}).click();
  await expect(page.getByText('두 번째 돌봄방 전용 기록')).toBeVisible();

  const firstOverview=await (await page.request.get(`/api/cases/${firstId}/overview`)).json();
  const secondOverview=await (await page.request.get(`/api/cases/${secondId}/overview`)).json();
  expect(firstOverview.records).toHaveLength(0);
  expect(secondOverview.records).toEqual(expect.arrayContaining([expect.objectContaining({kind:'care-logs',data:expect.objectContaining({note:'두 번째 돌봄방 전용 기록'})})]));

  await page.getByLabel('현재 돌봄방').selectOption(firstId);
  await expect(page.getByText('두 번째 돌봄방 전용 기록')).toHaveCount(0);
  await expect(page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).resolves.toBe(true);
  await page.screenshot({path:'outputs/guardian-stage1-mobile.png',fullPage:true});
});
