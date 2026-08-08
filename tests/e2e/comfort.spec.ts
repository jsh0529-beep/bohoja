import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('마음쉼터에서 문장 저장·호흡·대기실 모드가 모바일로 작동한다',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/comfort');
  await expect(page.getByRole('heading',{name:'마음쉼터'})).toBeVisible();
  await expect(page.getByText('24시간 109')).toBeVisible();

  await page.getByRole('button',{name:'천천히 가도 괜찮아요 저장'}).click();
  await expect(page.getByText('내 마음 문장에 저장했어요')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('guardian_comfort_saved'))).toContain('patient-1');
  await page.reload();
  await expect(page.getByRole('button',{name:'천천히 가도 괜찮아요 저장 해제'})).toBeVisible();

  await page.getByRole('button',{name:'3분 시작'}).click();
  await expect(page.getByText('2:59')).toBeVisible({timeout:2500});
  await page.getByRole('button',{name:'잠시 멈춤'}).click();

  await page.getByRole('button',{name:'대기실 모드 시작'}).click();
  await expect(page.getByRole('dialog',{name:'마음쉼터 대기실 모드'})).toBeVisible();
  await page.getByRole('button',{name:'다음 문장'}).click();
  await page.getByRole('button',{name:'대기실 모드 끝내기'}).click();
  await expect(page.getByRole('dialog',{name:'마음쉼터 대기실 모드'})).toHaveCount(0);

  const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(accessibility.violations,JSON.stringify(accessibility.violations,null,2)).toEqual([]);
  await expect(page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).resolves.toBe(true);
  await page.screenshot({path:'outputs/guardian-comfort-mobile.png',fullPage:true});
});
