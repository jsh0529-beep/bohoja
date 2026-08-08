type Fixture='admission'|'discharge'|'receipt'|'failure';
export type AnalysisResult={provider:string;model:string;fields:Record<string,unknown>;evidence:Record<string,{text:string;confidence:number}>};

const safeNotice=['AI가 정리한 초안입니다. 의료적 판단이 아니며 원문을 반드시 확인하세요.'];
export function fixtureAnalysis(fixture:Fixture):AnalysisResult{
  if(fixture==='failure')throw new Error('테스트 AI 분석 실패');
  const fields={documentType:fixture,dateTime:'2026-08-12T09:00:00+09:00',location:'본관 1층 입원수속',fasting:'자정부터 금식',preparations:['신분증','복용약 목록'],caregiverTasks:['입원 서류 확인','필수품 준비'],cautions:safeNotice};
  return {provider:'fixture',model:'fixture-v1',fields,evidence:{dateTime:{text:'8월 12일 오전 9시',confidence:.99},location:{text:'본관 1층 입원수속',confidence:.99},fasting:{text:'자정부터 금식',confidence:.99}}};
}

export function analyzeUploadedDocument(buffer:Buffer,fileName:string,fixture:Exclude<Fixture,'failure'>):AnalysisResult{
  const raw=buffer.toString('utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ');const lines=raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const matching=(pattern:RegExp)=>lines.find(line=>pattern.test(line))?.slice(0,300);
  const dateText=matching(/(20\d{2}[.\-/년]\s*\d{1,2}|\d{1,2}월\s*\d{1,2}일)/);const location=matching(/(본관|별관|병동|병실|원무|접수|\d+층)/);const fasting=matching(/(금식|식사.*금지|물.*금지)/);const preparation=lines.filter(line=>/(준비|지참|신분증|복용약|검사결과)/.test(line)).slice(0,5);
  const dateMatch=dateText?.match(/(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);const timeMatch=dateText?.match(/(오전|오후)?\s*(\d{1,2})\s*(?:시|:)(?:\s*(\d{1,2}))?/);let dateTime:string|undefined;
  if(dateMatch){let hour=Number(timeMatch?.[2]??9);if(timeMatch?.[1]==='오후'&&hour<12)hour+=12;if(timeMatch?.[1]==='오전'&&hour===12)hour=0;dateTime=`${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(Number(timeMatch?.[3]??0)).padStart(2,'0')}:00+09:00`;}
  const fields:Record<string,unknown>={documentType:fixture,cautions:safeNotice};if(dateTime)fields.dateTime=dateTime;if(location)fields.location=location;if(fasting)fields.fasting=fasting;if(preparation.length)fields.preparations=preparation;fields.caregiverTasks=preparation.length?preparation.map(item=>`${item} 확인`):['원문 내용 확인'];
  const evidence:AnalysisResult['evidence']={};if(dateText)evidence.dateTime={text:dateText,confidence:.82};if(location)evidence.location={text:location,confidence:.78};if(fasting)evidence.fasting={text:fasting,confidence:.86};
  return {provider:'local-text',model:'rules-v1',fields,evidence};
}
