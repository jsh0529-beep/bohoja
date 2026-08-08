'use client';
/* Data is loaded asynchronously from authenticated APIs after the client mounts. */
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {FormEvent,useCallback,useEffect,useState} from 'react';
import {ActionForm} from '@/components/ActionForm';
import {AdminPanel,LegalPanel} from '@/components/LivePanels';
import {Shell} from '@/components/Shell';

type Role='OWNER'|'MANAGER'|'CAREGIVER'|'VIEWER';
type CareCase={id:string;patientAlias:string;relationship:string;hospital?:string;consented:boolean;aiConsented?:boolean;createdAt:string;role:Role};
type Member={caseId:string;userId:string;role:Role;name:string;email:string};
type Invitation={id:string;email:string;role:Role;status:'PENDING'|'ACCEPTED'|'REVOKED';expiresAt:string};
type DocumentItem={id:string;fileName:string;mimeType?:string;byteSize?:number;pageCount?:number;originalAvailable?:boolean;status:'DRAFT'|'CONFIRMED'|'FAILED';fields:Record<string,unknown>;createdAt:string};
type RecordItem={id:string;kind:string;data:Record<string,unknown>;createdAt:string;authorName:string};
type Overview={case:CareCase;members:Member[];invitations:Invitation[];documents:DocumentItem[];events:Array<{id:string;title:string;startsAt:string;location?:string}>;tasks:Array<{id:string;title:string;status:string;dueAt?:string}>;notifications:Array<{id:string;category:string;createdAt:string}>;records:RecordItem[]};

const roleLabel:Record<Role,string>={OWNER:'소유자',MANAGER:'공동관리자',CAREGIVER:'보호자',VIEWER:'열람자'};
const formatDate=(value:string)=>new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
const text=(value:unknown)=>Array.isArray(value)?value.join(', '):typeof value==='string'||typeof value==='number'?String(value):'';
const recordLabel:Record<string,string>={'care-logs':'돌봄 기록',handoffs:'교대 브리핑',questions:'회진 질문',expenses:'비용','discharge/items':'퇴원 준비'};
const notificationLabel:Record<string,string>={'care-logs':'새 돌봄 기록이 공유됐어요',handoffs:'새 교대 브리핑이 도착했어요',questions:'새 회진 질문이 추가됐어요',expenses:'새 비용 기록이 추가됐어요','discharge/items':'퇴원 준비 상태가 바뀌었어요',DOCUMENT_CONFIRMED:'문서 확인 결과가 반영됐어요'};

function Field({label,name,area=false,placeholder='',type='text'}:{label:string;name:string;area?:boolean;placeholder?:string;type?:string}){
  return <div className="field"><label htmlFor={name}>{label}</label>{area?<textarea id={name} name={name} rows={3} required placeholder={placeholder}/>:<input id={name} name={name} type={type} required placeholder={placeholder}/>}</div>;
}

async function json<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(init?.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||'요청을 처리하지 못했습니다.');
  return data as T;
}

function Workspace({section}:{section:string}){
  const [cases,setCases]=useState<CareCase[]>([]);
  const [caseId,setCaseId]=useState('');
  const [overview,setOverview]=useState<Overview|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const loadCases=useCallback(async()=>{
    try{
      const data=await json<{items:CareCase[]}>('/api/cases');
      setCases(data.items);
      const remembered=sessionStorage.getItem('guardian_active_case');
      const selected=data.items.some(item=>item.id===remembered)?remembered:data.items[0]?.id||'';
      setCaseId(current=>data.items.some(item=>item.id===current)?current:selected||'');
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'돌봄방을 불러오지 못했습니다.');}
    finally{setLoading(false);}
  },[]);
  const refresh=useCallback(async()=>{
    if(!caseId){setOverview(null);return;}
    try{setOverview(await json<Overview>(`/api/cases/${caseId}/overview`));setError('');}
    catch(e){setError(e instanceof Error?e.message:'데이터를 불러오지 못했습니다.');}
  },[caseId]);

  useEffect(()=>{void loadCases();},[loadCases]);
  useEffect(()=>{if(caseId){sessionStorage.setItem('guardian_active_case',caseId);void refresh();}},[caseId,refresh]);

  const standalone=['billing','payment','pricing','settings','legal','notices','admin','more'].includes(section);
  let body:React.ReactNode;
  if(section==='legal'||section==='notices')body=<LegalPanel/>;
  else if(section==='admin')body=<AdminPanel/>;
  else if(section==='billing'||section==='payment'||section==='pricing')body=<Billing/>;
  else if(section==='settings')body=<Settings/>;
  else if(section==='more')body=<More/>;
  else if(loading)body=<div className="empty"><b>돌봄방을 불러오는 중입니다…</b></div>;
  else if(error&&!cases.length)body=<div className="empty"><h1>로그인이 필요해요</h1><p className="sub">보호자노트에 로그인하면 내 돌봄방을 안전하게 불러옵니다.</p><Link className="btn" href="/login">로그인</Link></div>;
  else if(!caseId||!overview)body=<div className="empty"><h1>첫 돌봄방을 만들어 주세요</h1><p className="sub">보호대상자를 등록하면 기록, 가족 공유와 문서 정리를 시작할 수 있어요.</p><Link className="btn" href="/case/new">돌봄방 만들기</Link></div>;
  else body=<>
    <div className="case-switcher">
      <label htmlFor="active-case">현재 돌봄방</label>
      <select id="active-case" value={caseId} onChange={event=>{setOverview(null);setCaseId(event.target.value)}}>
        {cases.map(item=><option value={item.id} key={item.id}>{item.patientAlias} · {roleLabel[item.role]}</option>)}
      </select>
      <Link href="/case/new" aria-label="새 돌봄방 만들기">＋</Link>
    </div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    <Section section={section} data={overview} refresh={refresh}/>
  </>;
  return <Shell admin={section==='admin'}><div className="page">{standalone?body:body}</div></Shell>;
}

function Section({section,data,refresh}:{section:string;data:Overview;refresh:()=>Promise<void>}){
  const props={data,refresh};
  const content:Record<string,React.ReactNode>={dashboard:<Dashboard {...props}/>,documents:<Documents {...props}/>,family:<Family {...props}/>,records:<Records {...props}/>,handoff:<Handoff {...props}/>,questions:<Questions {...props}/>,expenses:<Expenses {...props}/>,discharge:<Discharge {...props}/>};
  return content[section]??<div className="empty"><h1>페이지를 찾을 수 없어요</h1><Link href="/dashboard" className="btn">홈으로</Link></div>;
}

function Dashboard({data}:{data:Overview}){
  const today=new Date().toDateString();
  const todayRecords=data.records.filter(item=>new Date(item.createdAt).toDateString()===today);const todayEvents=data.events.filter(item=>new Date(item.startsAt).toDateString()===today);const openTasks=data.tasks.filter(item=>!['DONE','CANCELLED'].includes(item.status));
  const openDocuments=data.documents.filter(item=>item.status==='DRAFT').length;
  const latestHandoff=data.records.find(item=>item.kind==='handoffs');
  return <>
    <div className="row"><div><span className="eyebrow">{data.case.patientAlias} 돌봄방</span><h1>오늘도 함께해요</h1></div><span className="pill">{roleLabel[data.case.role]}</span></div>
    {data.case.hospital&&<p className="sub">{data.case.hospital} · {data.case.relationship}</p>}
    <div className="grid two"><div className="card"><span className="sub">오늘 일정</span><div className="metric">{todayEvents.length}</div><small>확정된 문서 일정</small></div><div className="card"><span className="sub">남은 할 일</span><div className="metric">{openTasks.length}</div><small>가족이 확인할 업무</small></div></div>{todayRecords.length>0&&<p className="sub">오늘 가족 기록 {todayRecords.length}건 · 확인할 AI 문서 {openDocuments}건</p>}
    <div className="card"><div className="row"><h3>최근 교대 브리핑</h3><Link href="/handoff">브리핑 쓰기</Link></div>{latestHandoff?<><p>{text(latestHandoff.data.status)||text(latestHandoff.data.summary)||'내용을 확인해 주세요.'}</p><small className="sub">{latestHandoff.authorName} · {formatDate(latestHandoff.createdAt)}</small></>:<p className="sub">아직 전달된 브리핑이 없습니다.</p>}</div>
    <h2 className="section-title">빠른 실행</h2><div className="grid two"><Link className="btn secondary" href="/documents">문서 분석</Link><Link className="btn secondary" href="/records">돌봄 기록</Link><Link className="btn secondary" href="/questions">회진 질문</Link><Link className="btn secondary" href="/discharge">퇴원 준비</Link></div>
    <h2 className="section-title">새 알림</h2>{data.notifications.length?<ul className="list">{data.notifications.slice(0,5).map(item=><li key={item.id}><b>{notificationLabel[item.category]||'보호자노트 소식'}</b><br/><small className="sub">{formatDate(item.createdAt)}</small></li>)}</ul>:<Empty text="새 알림이 없습니다."/>}
    <h2 className="section-title">최근 가족 활동</h2>{data.records.length?<ul className="list">{data.records.slice(0,5).map(item=><li key={item.id}><b>{item.authorName}</b> · {recordLabel[item.kind]||item.kind}<br/><small className="sub">{formatDate(item.createdAt)}</small></li>)}</ul>:<Empty text="첫 돌봄 기록을 남겨 보세요."/>}
  </>;
}

function Documents({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const writable=data.case.role!=='VIEWER'&&data.case.consented;
  return <><h1>문서 AI 정리</h1><div className="notice">AI 결과는 의료적 판단이 아닙니다. 원문과 대조하고 직접 확인해야 반영됩니다.</div>
    {writable&&!data.case.aiConsented&&<div className="card"><h2>AI 분석 동의가 필요해요</h2><p className="sub">동의하지 않아도 직접 기록 기능은 계속 이용할 수 있습니다.</p><ActionForm endpoint={`/api/cases/${data.case.id}/consents`} success="AI 분석 동의를 저장했습니다" onSuccess={refresh} submitLabel="AI 분석 동의"><input type="hidden" name="kind" value="ai_transfer"/><input type="hidden" name="accepted" value="true"/></ActionForm></div>}
    {writable&&data.case.aiConsented&&<DocumentUploadForm caseId={data.case.id} refresh={refresh}/>}
    <h2 className="section-title">내 문서 {data.documents.length}건</h2>{data.documents.length?data.documents.map(item=><div className="card" key={item.id}><div className="row"><b>{item.fileName}</b><span className={`pill ${item.status==='FAILED'?'danger':''}`}>{item.status==='DRAFT'?'확인 필요':item.status==='CONFIRMED'?'확인 완료':'분석 실패'}</span></div><small className="sub">{formatDate(item.createdAt)}{item.byteSize?` · ${(item.byteSize/1024).toFixed(1)}KB`:''}{item.pageCount?` · ${item.pageCount}페이지`:''}</small>{item.originalAvailable&&<a className="btn secondary full" href={`/api/cases/${data.case.id}/documents/${item.id}/download`} download>안전하게 원본 받기</a>}{item.status==='DRAFT'&&writable?<DocumentReviewForm item={item} refresh={refresh}/>:Object.entries(item.fields).filter(([,value])=>text(value)).slice(0,8).map(([key,value])=><p key={key}><b>{fieldLabel(key)}</b><br/><span className="sub">{text(value)}</span></p>)}{writable&&<button className="text-button danger-text" onClick={async()=>{if(confirm('이 문서 원본과 분석 결과를 삭제할까요?')){await json(`/api/cases/${data.case.id}/documents/${item.id}`,{method:'DELETE'});await refresh();}}}>문서 삭제</button>}</div>):<Empty text="아직 분석한 문서가 없습니다."/>}
  </>;
}

function DocumentUploadForm({caseId,refresh}:{caseId:string;refresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=event.currentTarget;setBusy(true);setMessage('');try{const response=await fetch(`/api/cases/${caseId}/documents/analyze`,{method:'POST',body:new FormData(form)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||'문서를 업로드하지 못했습니다.');form.reset();setMessage('파일을 안전하게 저장하고 분석 초안을 만들었습니다.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'문서를 업로드하지 못했습니다.');}finally{setBusy(false);}};
  return <form onSubmit={submit}><div className="field"><label htmlFor="document-file">안내문 파일</label><input id="document-file" name="file" type="file" accept="image/jpeg,image/png,image/heic,application/pdf" capture="environment" required/></div><input type="hidden" name="fixture" value="admission"/><p className="sub">JPG·PNG·HEIC·PDF, 최대 10MB·PDF 20페이지까지 가능합니다.</p><button className="btn full" disabled={busy}>{busy?'검사하고 저장하는 중…':'문서 분석하기'}</button>{message&&<div className="toast" role="status" aria-live="polite">{message}</div>}</form>;
}

function DocumentReviewForm({item,refresh}:{item:DocumentItem;refresh:()=>Promise<void>}){
  const [dateTime,setDateTime]=useState(text(item.fields.dateTime));const [location,setLocation]=useState(text(item.fields.location));const [fasting,setFasting]=useState(text(item.fields.fasting));const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setMessage('');try{await json(`/api/documents/${item.id}/confirm`,{method:'POST',body:JSON.stringify({confirmed:true,fields:{...item.fields,dateTime,location,fasting}})});setMessage('확인한 일정과 할 일을 가족 돌봄방에 반영했습니다.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'확정하지 못했습니다.');}finally{setBusy(false);}};
  return <form onSubmit={submit}><h3 className="section-title">원문과 대조해 주세요</h3><div className="field"><label htmlFor={`date-${item.id}`}>일시</label><input id={`date-${item.id}`} value={dateTime} onChange={event=>setDateTime(event.target.value)} placeholder="예: 2026-08-12T09:00:00+09:00"/></div><div className="field"><label htmlFor={`location-${item.id}`}>장소</label><input id={`location-${item.id}`} value={location} onChange={event=>setLocation(event.target.value)}/></div><div className="field"><label htmlFor={`fasting-${item.id}`}>금식 안내</label><input id={`fasting-${item.id}`} value={fasting} onChange={event=>setFasting(event.target.value)}/></div><p className="sub">준비물: {text(item.fields.preparations)||'추출되지 않음'}<br/>보호자 할 일: {text(item.fields.caregiverTasks)||'원문 확인'}</p><button className="btn full" disabled={busy}>{busy?'반영하는 중…':'원문과 대조하고 확정'}</button>{message&&<div className="toast" role="status">{message}</div>}</form>;
}

function Family({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const manageable=['OWNER','MANAGER'].includes(data.case.role);
  return <><h1>가족과 함께</h1>{manageable&&<ActionForm endpoint={`/api/cases/${data.case.id}/invitations`} success="초대 링크를 만들었습니다" resetOnSuccess onSuccess={refresh} submitLabel="가족 초대하기"><Field label="초대할 이메일" name="email" type="email"/><div className="field"><label htmlFor="role">권한</label><select id="role" name="role"><option value="CAREGIVER">보호자 · 기록 작성</option><option value="MANAGER">공동관리자 · 구성원 관리</option><option value="VIEWER">열람자 · 보기만 가능</option></select></div><input type="hidden" name="expiresInHours" value="48"/></ActionForm>}
    <h2 className="section-title">구성원 {data.members.length}명</h2>{data.members.map(member=><div className="card row" key={member.userId}><div><b>{member.name}</b><div className="sub">{member.email}</div></div><span className="pill">{roleLabel[member.role]}</span></div>)}
    {manageable&&<><h2 className="section-title">초대 현황</h2>{data.invitations.length?data.invitations.map(item=><div className="card row" key={item.id}><div><b>{item.email}</b><div className="sub">{formatDate(item.expiresAt)}까지</div></div><span className="pill">{item.status==='PENDING'?'수락 대기':item.status==='ACCEPTED'?'수락 완료':'취소됨'}</span></div>):<Empty text="보낸 초대가 없습니다."/>}</>}
  </>;
}

function Records({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const items=data.records.filter(item=>item.kind==='care-logs');
  return <><h1>돌봄 기록</h1><Writable data={data}><ActionForm endpoint={`/api/cases/${data.case.id}/care-logs`} success="가족에게 기록을 공유했습니다" resetOnSuccess onSuccess={refresh} submitLabel="기록 저장"><div className="grid two"><Field label="식사" name="meal" placeholder="예: 절반"/><Field label="통증 (0~10)" name="pain" type="number" placeholder="예: 3"/></div><Field label="상태와 특이사항" name="note" area placeholder="수면, 배변, 투약 확인 등을 적어 주세요"/></ActionForm></Writable><h2 className="section-title">돌봄 기록 {items.length}건</h2>{items.length?<ul className="list">{items.map(item=><li key={item.id}><b>{text(item.data.meal)||'상태 기록'} · 통증 {text(item.data.pain)||'미입력'}</b><br/><span>{text(item.data.note)}</span><br/><small className="sub">{item.authorName} · {formatDate(item.createdAt)}</small></li>)}</ul>:<Empty text="아직 돌봄 기록이 없습니다."/>}</>;
}

function Handoff({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const items=data.records.filter(item=>item.kind==='handoffs');
  return <><h1>30초 교대 브리핑</h1><Writable data={data}><ActionForm endpoint={`/api/cases/${data.case.id}/handoffs`} success="다음 보호자에게 전달했습니다" resetOnSuccess onSuccess={refresh} submitLabel="브리핑 전달"><Field label="현재 상태" name="status" area placeholder="식사, 수면, 통증"/><Field label="다음 할 일" name="next" area placeholder="일정과 필요한 물품"/><Field label="의료진에게 물어볼 것" name="question" area/></ActionForm></Writable><h2 className="section-title">전달 내역</h2>{items.length?items.map(item=><div className="card" key={item.id}><b>{text(item.data.status)||text(item.data.summary)}</b><p>{text(item.data.next)}</p><p className="sub">질문: {text(item.data.question)||'없음'}</p><small className="sub">{item.authorName} · {formatDate(item.createdAt)}</small></div>):<Empty text="아직 교대 브리핑이 없습니다."/>}</>;
}

function Questions({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const items=data.records.filter(item=>item.kind==='questions');
  return <><h1>회진 질문</h1><Writable data={data}><ActionForm endpoint={`/api/cases/${data.case.id}/questions`} success="질문 목록에 추가했습니다" resetOnSuccess onSuccess={refresh} submitLabel="질문 추가"><Field label="궁금한 점" name="question" placeholder="예: 퇴원 후 운동 범위는?"/><div className="field"><label htmlFor="answer">의료진 답변 (선택)</label><textarea id="answer" name="answer" rows={3} placeholder="답변을 들은 뒤 기록해도 됩니다"/></div></ActionForm></Writable>{items.length?items.map(item=><div className="card" key={item.id}><span className="pill">{text(item.data.answer)?'답변 기록됨':'질문 대기'}</span><h3>{text(item.data.question)}</h3>{text(item.data.answer)&&<p>{text(item.data.answer)}</p>}<small className="sub">{item.authorName} · {formatDate(item.createdAt)}</small></div>):<Empty text="회진 때 물어볼 질문을 추가해 보세요."/>}</>;
}

function Expenses({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const items=data.records.filter(item=>item.kind==='expenses');
  const total=items.reduce((sum,item)=>sum+(Number(item.data.amount)||0),0);
  return <><h1>비용 정산</h1><div className="grid two"><div className="card"><span className="sub">총 비용</span><div className="metric">{total.toLocaleString()}원</div></div><div className="card"><span className="sub">등록 항목</span><div className="metric">{items.length}건</div></div></div><Writable data={data}><ActionForm endpoint={`/api/cases/${data.case.id}/expenses`} success="비용과 분담을 저장했습니다" resetOnSuccess onSuccess={refresh} submitLabel="비용 저장"><Field label="항목" name="title" placeholder="예: 입원 준비물"/><Field label="금액" name="amount" type="number" placeholder="32000"/><div className="field"><label htmlFor="split">분담 방식</label><select id="split" name="split"><option>가족 균등 분담</option><option>내가 전액 부담</option><option>직접 금액 지정</option></select></div></ActionForm></Writable>{items.length?<ul className="list">{items.map(item=><li key={item.id}><b>{text(item.data.title)}</b><span className="expense-amount">{Number(item.data.amount||0).toLocaleString()}원</span><br/><small className="sub">{text(item.data.split)} · {item.authorName} · {formatDate(item.createdAt)}</small></li>)}</ul>:<Empty text="등록된 비용이 없습니다."/>}</>;
}

const dischargeTitles=['진단서·입퇴원확인서 발급','진료비 세부내역 확인','처방약·복약지도 확인','외래 예약 확인','이동 수단 준비'];
function Discharge({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const status=new Map<string,boolean>();
  for(const item of data.records.filter(record=>record.kind==='discharge/items'))if(!status.has(text(item.data.title)))status.set(text(item.data.title),item.data.completed===true);
  const completed=dischargeTitles.filter(title=>status.get(title)).length;
  const progress=Math.round(completed/dischargeTitles.length*100);
  const writable=data.case.role!=='VIEWER'&&data.case.consented;
  const toggle=async(title:string,checked:boolean)=>{await json(`/api/cases/${data.case.id}/discharge-items`,{method:'POST',body:JSON.stringify({title,completed:checked})});await refresh();};
  return <><div className="row"><div><span className="eyebrow">퇴원 체크리스트</span><h1>퇴원 준비</h1></div><span className="metric">{progress}%</span></div><div className="progress"><i style={{width:`${progress}%`}}/></div>{dischargeTitles.map(title=><label className="check" key={title}><input type="checkbox" checked={status.get(title)??false} disabled={!writable} onChange={event=>void toggle(title,event.target.checked)}/><span>{title}<small>{status.get(title)?'완료':'확인 필요'}</small></span></label>)}<div style={{height:16}}/><a className="btn full" href={`/api/cases/${data.case.id}/discharge/pdf`} download>퇴원 패키지 PDF 받기</a></>;
}

function Billing(){
  const [payments,setPayments]=useState<Array<{id:string;plan:string;amount:number;status:string;createdAt:string}>>([]);
  const [checkoutKey]=useState(()=>crypto.randomUUID());
  const load=useCallback(async()=>{try{setPayments((await json<{items:{id:string;plan:string;amount:number;status:string;createdAt:string}[]}>('/api/payments')).items);}catch{}},[]);
  useEffect(()=>{void load();},[load]);
  return <><h1>플랜과 결제</h1><div className="card"><span className="pill">추천</span><h2>입원 패스</h2><div className="metric">6,900원</div><p className="sub">60일 · AI 문서 30건 · 가족 무제한 · PDF 패키지</p><ActionForm endpoint="/api/payments/checkout" success="테스트 결제가 완료되었습니다" onSuccess={load} submitLabel="테스트 결제"><input type="hidden" name="plan" value="HOSPITAL_PASS"/><input type="hidden" name="idempotencyKey" value={checkoutKey}/></ActionForm></div><div className="notice">테스트 결제 모드입니다. 실제 카드 승인은 발생하지 않습니다. 운영 결제는 사업자 정보와 환불 정책이 설정되기 전까지 차단됩니다.</div><h2 className="section-title">결제 내역</h2>{payments.length?payments.map(item=><div className="card" key={item.id}><div className="row"><div><b>{item.plan}</b><div className="sub">{formatDate(item.createdAt)}</div></div><span className="pill">{item.amount.toLocaleString()}원 · {item.status}</span></div>{item.status==='PAID'&&<button className="text-button" onClick={async()=>{if(confirm('이 테스트 결제를 환불할까요?')){await json(`/api/payments/${item.id}/refund`,{method:'POST',body:'{}'});await load();}}}>테스트 결제 환불</button>}</div>):<Empty text="결제 내역이 없습니다."/>}</>;
}

function Settings(){
  const [preferences,setPreferences]=useState<Record<string,boolean>>({});
  const channels=[['care_schedule','돌봄 일정 앱 알림'],['marketing_email','마케팅 이메일'],['marketing_sms','마케팅 문자']];
  useEffect(()=>{void json<{items:Array<{channel:string;enabled:boolean}>}>('/api/preferences').then(data=>setPreferences(Object.fromEntries(data.items.map(item=>[item.channel,item.enabled])))).catch(()=>{});},[]);
  const update=async(channel:string,enabled:boolean)=>{await json('/api/preferences',{method:'PATCH',body:JSON.stringify({channel,enabled})});setPreferences(current=>({...current,[channel]:enabled}));};
  return <><h1>설정</h1><h2 className="section-title">알림 동의</h2>{channels.map(([channel,label])=><label className="check" key={channel}><input type="checkbox" checked={preferences[channel]??false} onChange={event=>void update(channel,event.target.checked)}/><span>{label}<small>변경 즉시 반영됩니다</small></span></label>)}<h2 className="section-title">내 정보</h2><div className="grid"><a className="btn secondary" href="/api/privacy/export">내 데이터 내려받기</a><button className="btn danger" onClick={async()=>{if(confirm('탈퇴를 요청할까요? 공유가 즉시 중단됩니다.'))await json('/api/privacy/delete',{method:'POST',body:'{}'});}}>계정 탈퇴 요청</button></div></>;
}

function More(){return <><h1>더보기</h1><div className="grid">{[['교대 브리핑','handoff'],['회진 질문','questions'],['비용 정산','expenses'],['퇴원 준비','discharge'],['결제·플랜','billing'],['공지·법정 문서','legal'],['설정·탈퇴','settings']].map(([label,path])=><Link className="card row" href={`/${path}`} key={path}><b>{label}</b><span>›</span></Link>)}</div></>}
function Writable({data,children}:{data:Overview;children:React.ReactNode}){return data.case.role!=='VIEWER'&&data.case.consented?<>{children}</>:<div className="notice">이 돌봄방에서는 열람만 할 수 있습니다.</div>}
function Empty({text:message}:{text:string}){return <div className="empty"><p className="sub">{message}</p></div>}
function fieldLabel(key:string){return ({documentType:'문서 종류',dateTime:'일시',location:'장소',fasting:'금식',preparations:'준비물',caregiverTasks:'보호자 할 일',cautions:'주의사항',reason:'실패 사유'} as Record<string,string>)[key]||key;}

export function CaseWorkspace(){const section=usePathname().split('/')[1]||'dashboard';return <Workspace section={section}/>;}
