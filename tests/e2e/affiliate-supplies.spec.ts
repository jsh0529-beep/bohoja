import {expect,test} from '@playwright/test';

test('입원 준비물 제휴 링크가 투명한 고지와 안전한 속성으로 제공된다',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto('/supplies');
  await expect(page.getByRole('heading',{name:'입원 생활, 빠뜨리지 않게 준비해요'})).toBeVisible();
  await expect(page.getByRole('note')).toContainText('쿠팡 파트너스 활동의 일환');
  await expect(page.getByText('약·건강기능식품·의료기기는 추천하지 않습니다.')).toBeVisible();
  const links=page.locator('a[data-affiliate-category]');
  await expect(links).toHaveCount(7);
  for(const link of await links.all()){
    await expect(link).toHaveAttribute('href',/^https:\/\/link\.coupang\.com\/a\//);
    await expect(link).toHaveAttribute('target','_blank');
    await expect(link).toHaveAttribute('rel',/sponsored/);
    await expect(link).toHaveAttribute('rel',/noopener/);
    await expect(link).toHaveAttribute('rel',/noreferrer/);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('link',{name:'준비물 보기'})).toBeVisible();
});
