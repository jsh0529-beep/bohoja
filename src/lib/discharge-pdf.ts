import path from 'node:path';
import PDFDocument from 'pdfkit';

type PdfRecord={kind:string;data:Record<string,unknown>;createdAt:string;authorName:string};
type PdfInput={patientAlias:string;hospital?:string;generatedAt:Date;records:PdfRecord[]};
const fontPath=path.join(process.cwd(),'node_modules','@fontsource','noto-sans-kr','files','noto-sans-kr-korean-400-normal.woff');
const value=(input:unknown)=>input===null||input===undefined?'':String(input);
const date=(input:string)=>new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Seoul'}).format(new Date(input));

export async function createDischargePdf(input:PdfInput){
  const document=new PDFDocument({size:'A4',font:fontPath,bufferPages:true,margins:{top:52,left:52,right:52,bottom:52},info:{Title:`${input.patientAlias} 퇴원 돌봄 패키지`,Author:'보호자노트',Subject:'가족 돌봄 인수인계 자료'}});
  document.registerFont('NotoSansKR',fontPath);document.font('NotoSansKR');
  const chunks:Buffer[]=[];document.on('data',chunk=>chunks.push(Buffer.from(chunk)));
  const finished=new Promise<Buffer>((resolve,reject)=>{document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject);});
  document.rect(0,0,595,125).fill('#137a68');document.fillColor('#ffffff').fontSize(12).text('보호자노트',52,38);document.fontSize(24).text('퇴원 돌봄 패키지',52,65);document.fillColor('#16302b').fontSize(18).text(input.patientAlias,52,150);document.fillColor('#65736f').fontSize(10).text(`${input.hospital??'병원 미입력'} · 생성 ${new Intl.DateTimeFormat('ko-KR',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Seoul'}).format(input.generatedAt)}`,52,180);
  let y=220;const heading=(title:string)=>{if(y>720){document.addPage();y=55;}document.fillColor('#137a68').fontSize(15).text(title,52,y);y=document.y+8;document.moveTo(52,y).lineTo(543,y).strokeColor('#dce5e1').stroke();y+=12;};
  const line=(title:string,detail:string)=>{if(y>735){document.addPage();y=55;}document.fillColor('#16302b').fontSize(10).text(title,58,y,{width:475});y=document.y+3;if(detail){document.fillColor('#65736f').fontSize(9).text(detail,58,y,{width:475});y=document.y+8;}else y+=6;};
  const discharge=input.records.filter(item=>item.kind==='discharge/items');heading('퇴원 체크리스트');if(!discharge.length)line('등록된 체크리스트가 없습니다.','보호자노트에서 퇴원 준비 항목을 확인해 주세요.');for(const item of discharge)line(`${item.data.completed?'[완료]':'[확인 필요]'} ${value(item.data.title)}`,`${item.authorName} · ${date(item.createdAt)}`);
  const care=input.records.filter(item=>item.kind==='care-logs').slice(0,20);heading('최근 돌봄 기록');if(!care.length)line('등록된 돌봄 기록이 없습니다.','');for(const item of care)line(`${value(item.data.meal)||'상태 기록'} · 통증 ${value(item.data.pain)||'미입력'}`,`${value(item.data.note)} · ${item.authorName} · ${date(item.createdAt)}`);
  const questions=input.records.filter(item=>item.kind==='questions').slice(0,20);heading('회진 질문과 답변');if(!questions.length)line('등록된 질문이 없습니다.','');for(const item of questions)line(`Q. ${value(item.data.question)}`,item.data.answer?`A. ${value(item.data.answer)}`:'답변 미기록');
  const expenses=input.records.filter(item=>item.kind==='expenses');const total=expenses.reduce((sum,item)=>sum+(Number(item.data.amount)||0),0);heading('비용 요약');line(`총 ${total.toLocaleString('ko-KR')}원 · ${expenses.length}건`,'상세 영수증과 정산 합의 내용은 보호자노트에서 확인해 주세요.');
  if(y>675){document.addPage();y=55;}document.fillColor('#fff4d8').roundedRect(52,y,491,62,8).fill();document.fillColor('#845b00').fontSize(9).text('안전 안내',66,y+13);document.fillColor('#5d4b1f').text('이 문서는 가족 돌봄 인수인계를 돕는 기록이며 의료적 판단이나 처방을 대체하지 않습니다. 의료 관련 내용은 반드시 의료진과 원문을 확인해 주세요.',66,y+30,{width:460});
  const range=document.bufferedPageRange();for(let index=range.start;index<range.start+range.count;index++){document.switchToPage(index);document.fillColor('#8a9692').fontSize(8).text(`${index+1} / ${range.count}`,52,755,{width:491,align:'center',lineBreak:false});}
  document.end();return finished;
}
