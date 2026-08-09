import {expect,test} from '@playwright/test';

test('모바일 회원가입 이메일 인증과 비밀번호 재설정이 실제 화면에서 작동한다',async({page})=>{
  await page.setViewportSize({width:360,height:800});const email=`auth-ui-${Date.now()}@test.local`;
  await page.goto('/signup');await page.getByLabel('이메일').fill(email);await page.getByLabel('비밀번호').fill('Password123!');await page.getByLabel('표시 이름').fill('인증 검수');
  for(const checkbox of await page.locator('input[required][type=checkbox]').all())await checkbox.check();
  await page.getByRole('button',{name:'가입하고 이메일 확인'}).click();
  await expect(page.getByRole('heading',{name:'인증번호를 확인해 주세요'})).toBeVisible();
  await expect(page.getByLabel('6자리 인증번호')).toHaveValue(/^\d{6}$/);
  await page.getByRole('button',{name:'인증 완료'}).click();
  await expect(page.getByRole('heading',{name:'누구를 돌보고 있나요?'})).toBeVisible();

  await page.request.post('/api/auth/logout');
  await page.goto('/password-reset');await page.getByLabel('가입 이메일').fill(email);await page.getByRole('button',{name:'재설정 코드 받기'}).click();
  await expect(page.getByLabel('6자리 재설정 코드')).toHaveValue(/^\d{6}$/);await page.getByLabel('새 비밀번호').fill('ChangedPassword123!');await page.getByRole('button',{name:'비밀번호 변경'}).click();
  await expect(page.getByRole('heading',{name:'다시 만나 반가워요'})).toBeVisible();await page.getByLabel('이메일').fill(email);await page.getByLabel('비밀번호').fill('ChangedPassword123!');await page.getByRole('button',{name:'확인하고 계속'}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link',{name:'내 돌봄방 홈'}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/');
  await expect(page.getByRole('link',{name:'돌봄방으로'})).toBeVisible();
  await expect(page.getByRole('link',{name:'인증 검수님의 돌봄방 계속하기'})).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
});
