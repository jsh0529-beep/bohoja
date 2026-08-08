import { expect, test } from '@playwright/test';

test('서버 재시작 후 계정과 케이스가 복구된다',async({page})=>{
  const login=await page.request.post('/api/auth/login',{data:{email:'persist-check@test.local',password:'Password123!'}});
  expect(login.status()).toBe(200);
  const cases=await page.request.get('/api/cases');
  expect(cases.status()).toBe(200);
  expect((await cases.json()).items).toEqual(expect.arrayContaining([expect.objectContaining({id:'5aee77fb-c0c8-43cf-b54d-e70e37be11fe'})]));
});
