import {expect,test} from '@playwright/test';

const account=(email:string)=>({email,password:'Password123!',name:'사진검수 보호자',ageConfirmed:true,terms:true,privacy:true});

test('사진을 브라우저 안에서 읽고 사진 없이 확인한 텍스트만 저장한다',async({page,browser})=>{
  test.setTimeout(90_000);
  const email=`ocr-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});
  expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  const caseResponse=await page.request.post('/api/cases',{data:{patientAlias:'사진 검수',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true}});
  const caseId=(await caseResponse.json()).case.id as string;

  await page.goto('/documents');
  const pngDataUrl=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=520;
    const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle='black';context.font='bold 100px Arial';context.fillText('HOSPITAL GUIDE',70,170);
    context.font='bold 120px Arial';context.fillText('2026 08 12',70,360);
    return canvas.toDataURL('image/png');
  });
  const image=Buffer.from(pngDataUrl.split(',')[1],'base64');
  await page.getByLabel('안내문 사진 찍기 또는 선택').setInputFiles({name:'입원 안내.png',mimeType:'image/png',buffer:image});
  await page.getByRole('button',{name:'글자 추출하기'}).click();
  const extracted=page.getByLabel('추출된 텍스트');
  await expect(extracted).toBeVisible({timeout:60_000});
  expect((await extracted.inputValue()).trim().length).toBeGreaterThan(0);
  await extracted.fill('입원 안내\n2026년 8월 12일 오전 9시\n본관 2층 원무과');
  await page.getByRole('button',{name:'확인한 텍스트 저장'}).click();
  await expect(page.getByRole('heading',{name:'저장한 문서 1건'})).toBeVisible();
  await expect(page.getByText('입원 안내.png',{exact:true})).toBeVisible();

  const overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
  const document=overview.documents.find((item:{fileName:string})=>item.fileName==='입원 안내.png');
  expect(document).toMatchObject({status:'CONFIRMED',originalAvailable:false});
  expect(document.fields.ocrText).toContain('본관 2층 원무과');
  expect((await page.request.get(`/api/cases/${caseId}/documents/${document.id}/download`)).status()).toBe(404);

  const strangerContext=await browser.newContext();const stranger=await strangerContext.newPage();
  const strangerSignup=await stranger.request.post('/api/auth/signup',{data:account(`stranger-${Date.now()}@test.local`)});
  await stranger.request.post('/api/auth/verify-email',{data:{code:(await strangerSignup.json()).testCode}});
  expect((await stranger.request.get(`/api/cases/${caseId}/overview`)).status()).toBe(404);
  await strangerContext.close();

  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'문서 삭제'}).click();
  await expect(page.getByText('입원 안내.png')).toHaveCount(0);
});
