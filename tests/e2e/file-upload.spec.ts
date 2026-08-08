import {expect,test} from '@playwright/test';

const account=(email:string)=>({email,password:'Password123!',name:'파일검수 보호자',ageConfirmed:true,terms:true,privacy:true});

test('실제 PDF 원본을 검사·저장·권한 다운로드·삭제한다',async({page,browser})=>{
  const email=`file-${Date.now()}@test.local`;
  const signup=await page.request.post('/api/auth/signup',{data:account(email)});expect((await page.request.post('/api/auth/verify-email',{data:{code:(await signup.json()).testCode}})).status()).toBe(200);
  const caseResponse=await page.request.post('/api/cases',{data:{patientAlias:'파일 검수',relationship:'자녀',authority:'CAREGIVER',sensitiveConsent:true,aiConsent:true}});
  const caseId=(await caseResponse.json()).case.id as string;
  const safePdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type /Page>>endobj\n2027년 3월 4일 오전 10시\n본관 2층 원무과\n자정부터 금식\n신분증 지참\ntrailer<</Root 1 0 R>>\n%%EOF');

  await page.goto('/documents');
  await page.getByLabel('안내문 파일').setInputFiles({name:'입원 안내.pdf',mimeType:'application/pdf',buffer:safePdf});
  await page.getByRole('button',{name:'문서 분석하기'}).click();
  await expect(page.getByText('입원 안내.pdf')).toBeVisible();
  const overview=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
  const document=overview.documents.find((item:{fileName:string})=>item.fileName==='입원 안내.pdf');
  expect(document).toMatchObject({byteSize:safePdf.length,pageCount:1,originalAvailable:true});
  expect(document.fields.location).toContain('본관 2층 원무과');
  expect(document.fields.fasting).toContain('자정부터 금식');
  expect((await page.request.post(`/api/documents/${document.id}/confirm`,{data:{confirmed:true,fields:{...document.fields,fasting:'밤 11시부터 금식'}}})).status()).toBe(200);
  const confirmed=await (await page.request.get(`/api/cases/${caseId}/overview`)).json();
  expect(confirmed.documents.find((item:{id:string})=>item.id===document.id).fields.fasting).toBe('밤 11시부터 금식');
  const download=await page.request.get(`/api/cases/${caseId}/documents/${document.id}/download`);
  expect(download.status()).toBe(200);expect(Buffer.from(await download.body())).toEqual(safePdf);

  const strangerContext=await browser.newContext();const stranger=await strangerContext.newPage();
  const strangerSignup=await stranger.request.post('/api/auth/signup',{data:account(`stranger-${Date.now()}@test.local`)});await stranger.request.post('/api/auth/verify-email',{data:{code:(await strangerSignup.json()).testCode}});
  expect((await stranger.request.get(`/api/cases/${caseId}/documents/${document.id}/download`)).status()).toBe(403);
  await strangerContext.close();

  const unsafePdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type /Page /OpenAction 2 0 R /JavaScript (alert)>>endobj\n%%EOF');
  await page.getByLabel('안내문 파일').setInputFiles({name:'위험.pdf',mimeType:'application/pdf',buffer:unsafePdf});
  await page.getByRole('button',{name:'문서 분석하기'}).click();
  await expect(page.getByRole('status')).toContainText('실행 코드');

  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'문서 삭제'}).click();
  await expect(page.getByText('입원 안내.pdf')).toHaveCount(0);
  expect((await page.request.get(`/api/cases/${caseId}/documents/${document.id}/download`)).status()).toBe(404);
});
