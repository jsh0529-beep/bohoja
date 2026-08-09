'use client';
/* Data is loaded asynchronously from authenticated APIs after the client mounts. */
/* eslint-disable react-hooks/set-state-in-effect */

import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {FormEvent,useCallback,useEffect,useRef,useState} from 'react';
import {ActionForm} from '@/components/ActionForm';
import {AdminPanel,LegalPanel} from '@/components/LivePanels';
import {Shell} from '@/components/Shell';
import {Icon,IconName} from '@/components/Icon';
import {ComfortSpace} from '@/components/ComfortSpace';
import {LocalOcr} from '@/components/LocalOcr';
import {HospitalSupplies} from '@/components/HospitalSupplies';

type Role='OWNER'|'MANAGER'|'CAREGIVER'|'VIEWER';
type CareCase={id:string;patientAlias:string;relationship:string;hospital?:string;consented:boolean;aiConsented?:boolean;createdAt:string;role:Role};
type Member={caseId:string;userId:string;role:Role;name:string;email:string;isSelf?:boolean;canChangeRole?:boolean;canRemove?:boolean};
type Invitation={id:string;email:string;role:Role;status:'PENDING'|'ACCEPTED'|'REVOKED';expiresAt:string};
type DocumentItem={id:string;fileName:string;mimeType?:string;byteSize?:number;pageCount?:number;originalAvailable?:boolean;status:'DRAFT'|'CONFIRMED'|'FAILED';fields:Record<string,unknown>;createdAt:string};
type RecordItem={id:string;kind:string;data:Record<string,unknown>;createdAt:string;updatedAt?:string;authorId?:string;authorName:string;canManageRecord?:boolean};
type UtilityEntry={id:string;kind:'HOSPITAL_INFO'|'SHIFT'|'SUPPLY_REQUEST';title:string;detail?:string;occursAt?:string|null;createdById:string;createdAt:string;canManage?:boolean};
type ManagementHistory={id:string;action:string;at:string};
type Overview={case:CareCase;currentUserId:string;members:Member[];invitations:Invitation[];documents:DocumentItem[];events:Array<{id:string;title:string;startsAt:string;location?:string;timeUnspecified?:boolean;canManage?:boolean}>;tasks:Array<{id:string;title:string;status:string;dueAt?:string;assigneeId?:string;assigneeName?:string;completedAt?:string;completedByName?:string;canManage?:boolean}>;notifications:Array<{id:string;category:string;referenceId?:string;readAt?:string|null;createdAt:string}>;utilities:UtilityEntry[];managementHistory:ManagementHistory[];records:RecordItem[]};

const roleLabel:Record<Role,string>={OWNER:'소유자',MANAGER:'공동관리자',CAREGIVER:'보호자',VIEWER:'열람자'};
const formatDate=(value:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
const kstDay=(value:Date|string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const text=(value:unknown)=>Array.isArray(value)?value.join(', '):typeof value==='string'||typeof value==='number'?String(value):'';
const recordLabel:Record<string,string>={'care-logs':'돌봄 기록',handoffs:'교대 브리핑',questions:'회진 질문',expenses:'비용','discharge/items':'퇴원 준비'};
const notificationLabel:Record<string,string>={'care-logs':'새 돌봄 기록이 공유됐어요',handoffs:'새 교대 브리핑이 도착했어요',questions:'새 회진 질문이 추가됐어요',expenses:'새 비용 기록이 추가됐어요','discharge/items':'퇴원 준비 상태가 바뀌었어요',DOCUMENT_CONFIRMED:'문서 확인 결과가 반영됐어요',EVENT_CREATED:'새 일정이 등록됐어요',EVENT_UPDATED:'일정이 변경됐어요',TASK_CREATED:'새 할 일이 등록됐어요',TASK_UPDATED:'할 일 상태가 변경됐어요',FAMILY_INVITATION:'가족 돌봄방 초대가 도착했어요',INVITATION_ACCEPTED:'가족이 돌봄방 초대를 수락했어요',ROLE_CHANGED:'가족 권한이 변경됐어요',UTILITY_HOSPITAL_INFO:'병원생활 정보가 공유됐어요',UTILITY_SHIFT:'보호자 교대가 등록됐어요',UTILITY_SUPPLY_REQUEST:'필요한 물품 요청이 도착했어요'};
const notificationHref:Record<string,string>={'care-logs':'/records',handoffs:'/handoff',questions:'/questions',expenses:'/expenses','discharge/items':'/discharge',DOCUMENT_CONFIRMED:'/documents',EVENT_CREATED:'/dashboard',EVENT_UPDATED:'/dashboard',TASK_CREATED:'/dashboard',TASK_UPDATED:'/dashboard',FAMILY_INVITATION:'/family',INVITATION_ACCEPTED:'/family',ROLE_CHANGED:'/family',UTILITY_HOSPITAL_INFO:'/hospital',UTILITY_SHIFT:'/hospital',UTILITY_SUPPLY_REQUEST:'/hospital'};

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
  useEffect(()=>{void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'page_view'})}).catch(()=>{});},[section]);

  const standalone=['billing','payment','pricing','settings','legal','notices','admin','more','comfort','supplies'].includes(section);
  let body:React.ReactNode;
  if(section==='comfort')body=<ComfortSpace/>;
  else if(section==='supplies')body=<HospitalSupplies/>;
  else if(section==='legal'||section==='notices')body=<LegalPanel/>;
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
  const content:Record<string,React.ReactNode>={dashboard:<Dashboard {...props}/>,notifications:<Notifications {...props}/>,documents:<Documents {...props}/>,family:<Family {...props}/>,records:<Records {...props}/>,handoff:<Handoff {...props}/>,hospital:<HospitalHub {...props}/>,trust:<TrustCenter {...props}/>,questions:<Questions {...props}/>,expenses:<Expenses {...props}/>,discharge:<Discharge {...props}/>};
  return content[section]??<div className="empty"><h1>페이지를 찾을 수 없어요</h1><Link href="/dashboard" className="btn">홈으로</Link></div>;
}

function NotificationPanel({items,refresh,full=false}:{items:Overview['notifications'];refresh:()=>Promise<void>;full?:boolean}){
  const router=useRouter();const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const unread=items.filter(item=>!item.readAt).length;
  async function open(item:Overview['notifications'][number]){if(busy)return;setBusy(item.id);setMessage('');try{if(!item.readAt)await json(`/api/notifications/${item.id}`,{method:'PATCH',body:JSON.stringify({read:true})});void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'notification_opened'})});router.push(notificationHref[item.category]??'/dashboard');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'알림을 열지 못했습니다.');}finally{setBusy('')}}
  async function readAll(){if(busy||!unread)return;setBusy('all');setMessage('');try{await json('/api/notifications/read-all',{method:'POST',body:'{}'});await refresh();setMessage('모든 알림을 읽음으로 표시했어요.');}catch(error){setMessage(error instanceof Error?error.message:'알림 상태를 바꾸지 못했습니다.');}finally{setBusy('')}}
  return <section className="notification-panel" aria-labelledby="notifications-title"><div className="row"><h2 id="notifications-title" className="section-title">{full?'알림 내역':'새 알림'} {unread>0&&<span className="notification-count">{unread}</span>}</h2><div>{!full&&<Link className="text-button" href="/notifications">전체 보기</Link>}{unread>0&&<button type="button" className="text-button" onClick={()=>void readAll()} disabled={Boolean(busy)}>모두 읽음</button>}</div></div>{items.length?<ul className="notification-list">{items.slice(0,full?50:5).map(item=><li key={item.id} className={item.readAt?'read':'unread'}><button type="button" onClick={()=>void open(item)} disabled={Boolean(busy)}><span className="notification-dot" aria-hidden="true"/><span><b>{notificationLabel[item.category]||'보호자노트 소식'}</b><small>{formatDate(item.createdAt)} · {item.readAt?'읽음':'새 알림'}</small></span><span className="chevron" aria-hidden="true">›</span></button></li>)}</ul>:<Empty text={full?'선택한 조건의 알림이 없습니다.':'새 알림이 없습니다.'}/>} {message&&<p className="form-message" role="status">{message}</p>}</section>;
}

function Notifications({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const [kind,setKind]=useState<'ALL'|'CARE'|'SCHEDULE'|'FAMILY'>('ALL');const [unreadOnly,setUnreadOnly]=useState(false);
  const group=(category:string)=>['care-logs','handoffs','questions','expenses','discharge/items'].includes(category)?'CARE':['EVENT_CREATED','EVENT_UPDATED','TASK_CREATED','TASK_UPDATED'].includes(category)?'SCHEDULE':'FAMILY';
  const items=data.notifications.filter(item=>(kind==='ALL'||group(item.category)===kind)&&(!unreadOnly||!item.readAt));
  return <><div className="row"><div><span className="eyebrow">가족 돌봄 소식</span><h1>알림센터</h1></div><span className="pill">안 읽음 {data.notifications.filter(item=>!item.readAt).length}</span></div><div className="notification-filters" role="group" aria-label="알림 분류">{([['ALL','전체'],['CARE','돌봄'],['SCHEDULE','일정·할 일'],['FAMILY','가족·병원생활']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div><label className="check compact"><input type="checkbox" checked={unreadOnly} onChange={event=>setUnreadOnly(event.target.checked)}/><span>안 읽은 알림만 보기</span></label><NotificationPanel items={items} refresh={refresh} full/><p className="planner-safety">알림은 환자 상태를 자동으로 판단하지 않습니다. 병원 안내와 의료진에게 다시 확인해 주세요.</p></>;
}

function HomeFocus({data}:{data:Overview}){
  const [now]=useState(()=>Date.now());const tasks=data.tasks.filter(item=>!['DONE','CANCELLED'].includes(item.status)).sort((a,b)=>(a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER));const nextEvent=data.events.filter(item=>new Date(item.startsAt).getTime()>=now).sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime())[0];const unreadHandoffs=data.records.filter(item=>item.kind==='handoffs'&&!item.data.acknowledgedByMe);const latestCare=data.records.find(item=>item.kind==='care-logs');
  return <section className="home-focus" aria-label="지금 필요한 돌봄 정보"><div className="focus-primary"><div className="row"><div><span className="eyebrow">지금 할 일</span><h2>{tasks[0]?.title??'등록된 할 일이 없어요'}</h2></div><Link className="pill" href="/dashboard">{tasks.length}개 남음</Link></div><p>{tasks[0]?`${tasks[0].assigneeName??'담당자 없음'}${tasks[0].dueAt?` · ${formatDate(tasks[0].dueAt)}까지`:' · 마감 없음'}`:'가족과 공유할 할 일을 바로 추가해 보세요.'}</p></div><div className="focus-grid"><Link href="/dashboard"><small>다음 일정</small><b>{nextEvent?.title??'예정된 일정 없음'}</b><span>{nextEvent?nextEvent.timeUnspecified?'시간 미정':formatDate(nextEvent.startsAt):'일정을 추가해 보세요'}</span></Link><Link href="/handoff" className={unreadHandoffs.length?'attention':''}><small>미확인 교대</small><b>{unreadHandoffs.length?`${unreadHandoffs.length}건 확인 필요`:'모두 확인했어요'}</b><span>교대 브리핑 보기</span></Link><Link href="/records"><small>최근 돌봄 기록</small><b>{latestCare?text(latestCare.data.mealType)||text(latestCare.data.note)||'생활 상태 기록':'아직 기록 없음'}</b><span>{latestCare?`${latestCare.authorName} · ${formatDate(latestCare.createdAt)}`:'첫 기록 남기기'}</span></Link></div></section>;
}

function Dashboard({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const today=kstDay(new Date());
  const todayRecords=data.records.filter(item=>kstDay(item.createdAt)===today);const todayEvents=data.events.filter(item=>!item.timeUnspecified&&kstDay(item.startsAt)===today);const openTasks=data.tasks.filter(item=>!['DONE','CANCELLED'].includes(item.status));
  const openDocuments=data.documents.filter(item=>item.status==='DRAFT').length;
  const latestHandoff=data.records.find(item=>item.kind==='handoffs');
  return <>
    <div className="row"><div><span className="eyebrow">{data.case.patientAlias} 돌봄방</span><h1>오늘도 함께해요</h1></div><span className="pill">{roleLabel[data.case.role]}</span></div>
    {data.case.hospital&&<p className="sub">{data.case.hospital} · {data.case.relationship}</p>}
    <HomeFocus data={data}/>
    <div className="grid two metric-grid"><div className="card metric-card"><span className="card-icon"><Icon name="calendar"/></span><span className="sub">오늘 일정</span><div className="metric">{todayEvents.length}</div><small>직접 추가한 일정 포함</small></div><div className="card metric-card"><span className="card-icon warm"><Icon name="discharge"/></span><span className="sub">남은 할 일</span><div className="metric">{openTasks.length}</div><small>가족이 확인할 업무</small></div></div>{todayRecords.length>0&&<p className="sub">오늘 가족 기록 {todayRecords.length}건 · 확인할 문서 {openDocuments}건</p>}
    <AdvancedDashboardPlanner data={data} refresh={refresh}/>
    <div className="card"><div className="row"><h3>최근 교대 브리핑</h3><Link href="/handoff">브리핑 쓰기</Link></div>{latestHandoff?<><p>{text(latestHandoff.data.status)||text(latestHandoff.data.summary)||'내용을 확인해 주세요.'}</p><small className="sub">{latestHandoff.authorName} · {formatDate(latestHandoff.createdAt)}</small></>:<p className="sub">아직 전달된 브리핑이 없습니다.</p>}</div>
    <h2 className="section-title">빠른 실행</h2><div className="grid two quick-grid"><Link className="quick-action" href="/documents"><Icon name="camera"/><span>사진 글자 추출</span></Link><Link className="quick-action" href="/records"><Icon name="record"/><span>돌봄 기록</span></Link><Link className="quick-action" href="/questions"><Icon name="question"/><span>회진 질문</span></Link><Link className="quick-action" href="/discharge"><Icon name="discharge"/><span>퇴원 준비</span></Link></div>
    <Link className="comfort-teaser" href="/comfort"><span className="comfort-teaser-icon"><Icon name="heart"/></span><div><small>기다리는 마음도 돌봐주세요</small><strong>마음쉼터에서 잠시 숨을 고르기</strong></div><span className="chevron">›</span></Link>
    <Link className="supplies-teaser" href="/supplies"><span><Icon name="shopping"/></span><div><small>병원별 제공품을 먼저 확인해요</small><strong>입원 생활 준비물 살펴보기</strong></div><span className="chevron">›</span></Link>
    <NotificationPanel items={data.notifications} refresh={refresh}/>
    <h2 className="section-title">최근 가족 활동</h2>{data.records.length?<ul className="list">{data.records.slice(0,5).map(item=><li key={item.id}><b>{item.authorName}</b> · {recordLabel[item.kind]||item.kind}<br/><small className="sub">{formatDate(item.createdAt)}</small></li>)}</ul>:<Empty text="첫 돌봄 기록을 남겨 보세요."/>}
  </>;
}

function AdvancedDashboardPlanner({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  type Edit={kind:'event'|'task';id:string;title:string;when:string;location:string;assigneeId:string};
  const [now]=useState(()=>Date.now());
  const [mode,setMode]=useState<'event'|'task'>('event');
  const [title,setTitle]=useState('');
  const [when,setWhen]=useState('');
  const [location,setLocation]=useState('');
  const [assigneeId,setAssigneeId]=useState('');
  const [editing,setEditing]=useState<Edit|null>(null);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const writable=data.case.role!=='VIEWER'&&data.case.consented;
  const toIso=(value:string)=>value?new Date(`${value}:00+09:00`).toISOString():undefined;
  const toLocal=(value?:string)=>value?new Date(new Date(value).getTime()+9*3600000).toISOString().slice(0,16):'';

  async function request(url:string,method:string,body?:unknown){
    if(busy)return false;
    setBusy(url);setMessage('');
    try{await json(url,{method,body:body?JSON.stringify(body):undefined});await refresh();return true}
    catch(error){setMessage(error instanceof Error?error.message:'변경하지 못했습니다.');return false}
    finally{setBusy('')}
  }
  async function add(event:FormEvent){
    event.preventDefault();
    if(!title.trim()){setMessage(mode==='event'?'일정 제목을 입력해 주세요.':'할 일 제목을 입력해 주세요.');return;}
    const endpoint=`/api/cases/${data.case.id}/${mode==='event'?'events':'tasks'}`;
    const payload=mode==='event'
      ?{title:title.trim(),...(when?{startsAt:toIso(when)}:{}),location:location.trim()||undefined}
      :{title:title.trim(),dueAt:toIso(when),assigneeId:assigneeId||undefined};
    const ok=await request(endpoint,'POST',payload);
    if(ok){setTitle('');setWhen('');setLocation('');setAssigneeId('');setMessage(mode==='event'?'일정을 추가했어요.':'할 일을 추가했어요.')}
  }
  async function saveEdit(event:FormEvent){
    event.preventDefault();
    if(!editing?.title.trim()){setMessage('제목을 입력해 주세요.');return;}
    const endpoint=`/api/cases/${data.case.id}/${editing.kind==='event'?'events':'tasks'}/${editing.id}`;
    const payload=editing.kind==='event'
      ?{title:editing.title.trim(),startsAt:editing.when?toIso(editing.when):null,location:editing.location.trim()||null}
      :{title:editing.title.trim(),dueAt:toIso(editing.when)||null,assigneeId:editing.assigneeId||null};
    if(await request(endpoint,'PATCH',payload)){setEditing(null);setMessage('변경 내용을 저장했어요.')}
  }
  async function remove(kind:'events'|'tasks',id:string,titleText:string){
    const detail=kind==='events'?'보호자노트에서만 삭제되며 병원 예약이나 검사는 취소되지 않아요.':'목록에서만 삭제되며 실제 돌봄 조치가 취소되는 것은 아니에요.';
    if(!confirm(`“${titleText}”을(를) 삭제할까요?\n\n${detail}`))return;
    await request(`/api/cases/${data.case.id}/${kind}/${id}`,'DELETE');
  }
  async function toggleTask(item:Overview['tasks'][number]){
    const done=item.status==='DONE';
    if(!done&&item.assigneeId&&item.assigneeId!==data.currentUserId&&!confirm(`담당자는 ${item.assigneeName||'다른 가족'}님입니다. 완료로 표시할까요?`))return;
    if(await request(`/api/cases/${data.case.id}/tasks/${item.id}`,'PATCH',{status:done?'OPEN':'DONE'}))setMessage(done?'완료를 취소했어요.':'할 일을 완료했어요.');
  }
  const statusText=(value:string,done=false)=>{
    if(done)return '완료';
    const ms=new Date(value).getTime()-now;
    if(ms<0)return '마감 지남';
    const hours=Math.ceil(ms/3600000);
    if(hours<=24)return hours<=1?'1시간 이내':`${hours}시간 남음`;
    return kstDay(value)===kstDay(new Date(now+86400000))?'내일':'예정';
  };
  const events=[...data.events].sort((a,b)=>Number(a.timeUnspecified)-Number(b.timeUnspecified)||a.startsAt.localeCompare(b.startsAt));
  const tasks=[...data.tasks].sort((a,b)=>Number(a.status==='DONE')-Number(b.status==='DONE')||(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));

  return <section className="planner advanced-planner" aria-labelledby="advanced-planner-title">
    <div className="row"><div><h2 id="advanced-planner-title" className="section-title">일정과 할 일</h2><small className="sub">시간은 한국 표준시(KST)로 표시됩니다.</small></div>{writable&&<div className="segmented" aria-label="추가할 종류"><button type="button" aria-pressed={mode==='event'} onClick={()=>setMode('event')}>일정</button><button type="button" aria-pressed={mode==='task'} onClick={()=>setMode('task')}>할 일</button></div>}</div>
    <p className="planner-safety">보호자노트에 적은 일정입니다. 병원 안내와 의료진에게 다시 확인해 주세요.</p>
    {writable&&<form className="planner-add" onSubmit={add}>
      <label>제목<input value={title} onChange={event=>setTitle(event.target.value)} placeholder={mode==='event'?'예: 오후 회진':'예: 물티슈 가져오기'}/></label>
      <label>{mode==='event'?'시간 (선택)':'마감 (선택)'}<input type="datetime-local" value={when} onChange={event=>setWhen(event.target.value)}/></label>
      {mode==='event'?<label>장소 (선택)<input value={location} onChange={event=>setLocation(event.target.value)} placeholder="예: 본관 2층"/></label>:<label>담당 가족 (선택)<select value={assigneeId} onChange={event=>setAssigneeId(event.target.value)}><option value="">담당자 없음</option>{data.members.map(member=><option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>}
      <button className="btn" disabled={Boolean(busy)}>{busy?'처리 중…':'추가'}</button><small>제목만으로도 저장할 수 있어요.</small>
    </form>}
    {message&&<p className="form-message" role="status">{message}</p>}
    {editing&&<form className="planner-edit" onSubmit={saveEdit}>
      <h3>{editing.kind==='event'?'일정':'할 일'} 수정</h3>
      <label>제목<input value={editing.title} onChange={event=>setEditing({...editing,title:event.target.value})}/></label>
      <label>{editing.kind==='event'?'시간 (KST, 선택)':'마감 (KST, 선택)'}<input type="datetime-local" value={editing.when} onChange={event=>setEditing({...editing,when:event.target.value})}/></label>
      {editing.kind==='event'?<label>장소 (선택)<input value={editing.location} onChange={event=>setEditing({...editing,location:event.target.value})}/></label>:<label>담당 가족 (선택)<select value={editing.assigneeId} onChange={event=>setEditing({...editing,assigneeId:event.target.value})}><option value="">담당자 없음</option>{data.members.map(member=><option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>}
      <div className="record-edit-actions"><button type="button" className="btn secondary" onClick={()=>setEditing(null)} disabled={Boolean(busy)}>취소</button><button className="btn" disabled={Boolean(busy)}>수정 저장</button></div>
    </form>}
    <div className="planner-columns">
      <div className="planner-list"><h3>일정 · 언제/어디서</h3>{events.length?events.slice(0,8).map(item=><div className="planner-item advanced" key={item.id}><span><b>{item.title}</b><small>{item.timeUnspecified?<em>시간 미정</em>:<><em>{statusText(item.startsAt)}</em> · {formatDate(item.startsAt)}</>}{item.location?` · ${item.location}`:''}</small></span>{writable&&item.canManage!==false&&<div className="mini-actions"><button onClick={()=>setEditing({kind:'event',id:item.id,title:item.title,when:item.timeUnspecified?'':toLocal(item.startsAt),location:item.location||'',assigneeId:''})}>수정</button><button onClick={()=>remove('events',item.id,item.title)}>삭제</button></div>}</div>):<small className="sub">등록된 일정이 없어요.</small>}</div>
      <div className="planner-list"><h3>할 일 · 누가/언제까지</h3>{tasks.length?tasks.slice(0,10).map(item=>{const done=item.status==='DONE';return <div className={`planner-item advanced ${done?'done':''}`} key={item.id}><button className="task-check" aria-label={`${item.title} ${done?'완료 취소':'완료'}`} aria-pressed={done} disabled={!writable||Boolean(busy)||item.canManage===false} onClick={()=>toggleTask(item)}>{done?'✓':''}</button><span><b>{item.title}</b><small>{item.dueAt?<><em>{statusText(item.dueAt,done)}</em> · {formatDate(item.dueAt)}</>:'마감 없음'}{` · ${item.assigneeName?`담당 ${item.assigneeName}`:'담당자 없음'}`}</small>{done&&item.completedAt&&<small>{item.completedByName?`${item.completedByName} 완료 · `:''}{formatDate(item.completedAt)}</small>}</span>{writable&&item.canManage!==false&&<div className="mini-actions"><button onClick={()=>setEditing({kind:'task',id:item.id,title:item.title,when:toLocal(item.dueAt),location:'',assigneeId:item.assigneeId||''})}>수정</button><button onClick={()=>remove('tasks',item.id,item.title)}>삭제</button></div>}</div>}):<small className="sub">남은 할 일이 없어요.</small>}</div>
    </div>
  </section>
}
function Documents({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const writable=data.case.role!=='VIEWER'&&data.case.consented;
  return <><h1>사진 글자 추출</h1><div className="notice">사진은 휴대폰이나 PC 안에서만 처리되며 서버에 저장되지 않습니다. 추출된 글자는 원문과 대조해 직접 확인해 주세요.</div>
    {writable&&<LocalOcr caseId={data.case.id} refresh={refresh}/>}
    <h2 className="section-title">저장한 문서 {data.documents.length}건</h2>{data.documents.length?data.documents.map(item=><div className="card" key={item.id}><div className="row"><b>{item.fileName}</b><span className={`pill ${item.status==='FAILED'?'danger':''}`}>{item.status==='DRAFT'?'이전 분석 확인 필요':item.status==='CONFIRMED'?'텍스트 저장됨':'이전 분석 실패'}</span></div><small className="sub">{formatDate(item.createdAt)}{item.byteSize?` · ${(item.byteSize/1024).toFixed(1)}KB`:''}{item.pageCount?` · ${item.pageCount}페이지`:''}</small>{item.originalAvailable&&<a className="btn secondary full" href={`/api/cases/${data.case.id}/documents/${item.id}/download`} download>안전하게 원본 받기</a>}{item.status==='DRAFT'&&writable?<DocumentReviewForm item={item} refresh={refresh}/>:Object.entries(item.fields).filter(([,value])=>text(value)).slice(0,8).map(([key,value])=><p key={key}><b>{fieldLabel(key)}</b><br/><span className="sub preserve-lines">{text(value)}</span></p>)}{writable&&<button className="text-button danger-text" onClick={async()=>{if(confirm('이 문서 기록을 삭제할까요?')){await json(`/api/cases/${data.case.id}/documents/${item.id}`,{method:'DELETE'});await refresh();}}}>문서 삭제</button>}</div>):<Empty text="아직 저장한 문서 텍스트가 없습니다."/>}
  </>;
}

function DocumentReviewForm({item,refresh}:{item:DocumentItem;refresh:()=>Promise<void>}){
  const [dateTime,setDateTime]=useState(text(item.fields.dateTime));const [location,setLocation]=useState(text(item.fields.location));const [fasting,setFasting]=useState(text(item.fields.fasting));const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setMessage('');try{await json(`/api/documents/${item.id}/confirm`,{method:'POST',body:JSON.stringify({confirmed:true,fields:{...item.fields,dateTime,location,fasting}})});setMessage('확인한 일정과 할 일을 가족 돌봄방에 반영했습니다.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'확정하지 못했습니다.');}finally{setBusy(false);}};
  return <form onSubmit={submit}><h3 className="section-title">원문과 대조해 주세요</h3><div className="field"><label htmlFor={`date-${item.id}`}>일시</label><input id={`date-${item.id}`} value={dateTime} onChange={event=>setDateTime(event.target.value)} placeholder="예: 2026-08-12T09:00:00+09:00"/></div><div className="field"><label htmlFor={`location-${item.id}`}>장소</label><input id={`location-${item.id}`} value={location} onChange={event=>setLocation(event.target.value)}/></div><div className="field"><label htmlFor={`fasting-${item.id}`}>금식 안내</label><input id={`fasting-${item.id}`} value={fasting} onChange={event=>setFasting(event.target.value)}/></div><p className="sub">준비물: {text(item.fields.preparations)||'추출되지 않음'}<br/>보호자 할 일: {text(item.fields.caregiverTasks)||'원문 확인'}</p><button className="btn full" disabled={busy}>{busy?'반영하는 중…':'원문과 대조하고 확정'}</button>{message&&<div className="toast" role="status">{message}</div>}</form>;
}

function Family({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const manageable=['OWNER','MANAGER'].includes(data.case.role);
  const inviteRoles:[Role,string][]=data.case.role==='OWNER'?[['CAREGIVER','보호자 · 돌봄 기록과 할 일 작성'],['MANAGER','공동관리자 · 가족과 문서까지 관리'],['VIEWER','열람자 · 허용된 내용만 보기']]:[['CAREGIVER','보호자 · 돌봄 기록과 할 일 작성'],['VIEWER','열람자 · 허용된 내용만 보기']];
  return <><h1>가족과 함께</h1><p className="sub">가족마다 꼭 필요한 범위만 공유하세요. 권한은 언제든 조정할 수 있습니다.</p><div className="role-guide" aria-label="가족 역할 안내">{([['OWNER','소유자','결제·삭제와 모든 관리'],['MANAGER','공동관리자','가족·일정·문서 관리'],['CAREGIVER','보호자','돌봄 기록·할 일·비용 작성'],['VIEWER','열람자','허용된 내용 보기만']] as [Role,string,string][]).map(([role,title,description])=><div key={role}><span className="pill">{title}</span><small>{description}</small></div>)}</div>{manageable&&<ActionForm endpoint={`/api/cases/${data.case.id}/invitations`} success="초대 링크를 만들었습니다" resetOnSuccess onSuccess={refresh} submitLabel="가족 초대하기"><Field label="초대할 이메일" name="email" type="email"/><div className="field"><label htmlFor="role">초대 권한</label><select id="role" name="role">{inviteRoles.map(([role,label])=><option value={role} key={role}>{label}</option>)}</select><small className="sub">소유자 권한은 초대로 넘길 수 없습니다.</small></div><input type="hidden" name="expiresInHours" value="48"/></ActionForm>}<FamilyManager data={data} refresh={refresh}/></>;
}

function FamilyManager({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const manageable=['OWNER','MANAGER'].includes(data.case.role);const roleOptions:[Role,string][]=data.case.role==='OWNER'?[['MANAGER','공동관리자'],['CAREGIVER','보호자'],['VIEWER','열람자']]:[['CAREGIVER','보호자'],['VIEWER','열람자']];const [busy,setBusy]=useState('');const [message,setMessage]=useState('');async function change(member:Member,role:Role){if(busy||role===member.role||!confirm(`${member.name}님의 권한을 ${roleLabel[role]}(으)로 변경할까요? 보거나 할 수 있는 범위가 즉시 바뀍니다.`))return;setBusy(member.userId);setMessage('');try{await json(`/api/cases/${data.case.id}/members/${member.userId}`,{method:'PATCH',body:JSON.stringify({role})});await refresh();setMessage(`${member.name}님의 권한을 변경했어요.`)}catch(error){setMessage(error instanceof Error?error.message:'권한을 변경하지 못했습니다.')}finally{setBusy('')}}async function remove(member:Member){if(busy||!confirm(`${member.name}님을 이 돌봄방에서 내보낼까요? 새 정보 접근은 즉시 막히지만 이미 내보낸 파일은 회수할 수 없어요.`))return;setBusy(member.userId);setMessage('');try{await json(`/api/cases/${data.case.id}/members/${member.userId}`,{method:'DELETE'});await refresh();setMessage('구성원을 내보냈어요.')}catch(error){setMessage(error instanceof Error?error.message:'구성원을 내보내지 못했습니다.')}finally{setBusy('')}}async function cancel(invitation:Invitation){if(busy||!confirm(`${invitation.email}로 보낸 초대를 취소할까요? 취소하면 이 링크로는 더 이상 입장할 수 없어요.`))return;setBusy(invitation.id);setMessage('');try{await json(`/api/invitations/${invitation.id}`,{method:'DELETE'});await refresh();setMessage('초대를 취소했어요.')}catch(error){setMessage(error instanceof Error?error.message:'초대를 취소하지 못했습니다.')}finally{setBusy('')}}return <>{message&&<p className="form-message" role="status">{message}</p>}<h2 className="section-title">구성원 {data.members.length}명</h2>{data.members.map(member=><div className="card member-manage-card" key={member.userId}><div className="member-main"><span className="avatar" aria-hidden="true">{member.name.slice(0,1)}</span><div className="member-copy"><b>{member.name}{member.isSelf?' (나)':''}</b>{member.email&&<div className="sub">{member.email}</div>}</div><span className="pill">{roleLabel[member.role]}</span></div>{manageable&&(member.canChangeRole||member.canRemove)&&<div className="member-controls">{member.canChangeRole&&<label><span className="sr-only">{member.name} 권한</span><select value={member.role} disabled={busy===member.userId} onChange={event=>change(member,event.target.value as Role)}>{roleOptions.map(([role,label])=><option value={role} key={role}>{label}</option>)}</select></label>}{member.canRemove&&<button className="btn danger" disabled={busy===member.userId} onClick={()=>remove(member)}>{busy===member.userId?'처리 중…':'내보내기'}</button>}</div>}</div>)}{manageable&&<><h2 className="section-title">초대 현황</h2>{data.invitations.length?data.invitations.map(item=><div className="card invitation-card" key={item.id}><div><b>{item.email}</b><div className="sub">{formatDate(item.expiresAt)}까지 · {roleLabel[item.role]}</div></div><span className="pill">{item.status==='PENDING'?'수락 대기':item.status==='ACCEPTED'?'수락 완료':'취소됨'}</span>{item.status==='PENDING'&&<button className="btn secondary" disabled={busy===item.id} onClick={()=>cancel(item)}>{busy===item.id?'취소 중…':'초대 취소'}</button>}</div>):<Empty text="보낸 초대가 없습니다."/>}</>}</>
}

function Records({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const items=data.records.filter(item=>item.kind==='care-logs');
  return <><h1>돌봄 기록</h1><div className="notice"><b>필수 항목은 없어요.</b> 기억해 둘 내용 하나만 골라도 저장할 수 있어요.<br/><small>보호자가 관찰하거나 들은 생활 기록이며 의료진 기록을 대신하지 않습니다.</small></div><Writable data={data}><CareLogForm caseId={data.case.id} refresh={refresh} latest={items[0]}/></Writable><h2 className="section-title">시간순 돌봄 타임라인 · {items.length}건</h2><CareRecordList caseId={data.case.id} items={items} refresh={refresh}/>{items.length===0&&<Empty text="아직 돌봄 기록이 없습니다."/>}</>;
}

function CareRecordList({caseId,items,refresh}:{caseId:string;items:RecordItem[];refresh:()=>Promise<void>}){
  const [editing,setEditing]=useState<string|null>(null);const [deleted,setDeleted]=useState<RecordItem|null>(null);const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[]);
  useEffect(()=>{if(message)alert(message)},[message]);
  async function remove(item:RecordItem){if(busy||!confirm('이 돌봄 기록을 삭제할까요? 8초 안에는 되돌릴 수 있어요.'))return;setBusy(item.id);setMessage('');try{await json(`/api/cases/${caseId}/care-logs/${item.id}`,{method:'DELETE'});setDeleted(item);if(timer.current)clearTimeout(timer.current);await refresh();timer.current=setTimeout(()=>setDeleted(null),8000);}catch(error){setDeleted(null);setMessage(error instanceof Error?error.message:'기록을 삭제하지 못했습니다.')}finally{setBusy('')}}
  async function restore(){if(!deleted||busy)return;setBusy(deleted.id);setMessage('');try{await json(`/api/cases/${caseId}/care-logs/${deleted.id}`,{method:'PATCH',body:JSON.stringify({restore:true})});if(timer.current)clearTimeout(timer.current);setDeleted(null);await refresh();}catch(error){setMessage(error instanceof Error?error.message:'기록을 되돌리지 못했습니다. 다시 시도해 주세요.')}finally{setBusy('')}}
  return <>{deleted&&<div className="undo-bar" role="status"><span>기록을 삭제했어요.</span><button onClick={restore} disabled={Boolean(busy)}>되돌리기</button></div>}<ul className="list care-record-list">{items.map(item=><li key={item.id}>{editing===item.id?<CareLogEditForm caseId={caseId} item={item} onCancel={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await refresh()}}/>:<><div className="record-head"><b>{text(item.data.mealType)||text(item.data.meal)||'상태 기록'}{text(item.data.mealAmount)?` · ${text(item.data.mealAmount)}`:''}{text(item.data.pain)?` · 통증 ${text(item.data.pain)}`:''}</b>{item.canManageRecord&&<div className="record-actions"><button onClick={()=>setEditing(item.id)} disabled={Boolean(busy)}>수정</button><button onClick={()=>remove(item)} disabled={Boolean(busy)} className="danger-text">삭제</button></div>}</div><span className="preserve-lines">{[text(item.data.hydration)&&`수분 ${text(item.data.hydration)}`,text(item.data.temperature)&&`체온 ${text(item.data.temperature)}℃`,text(item.data.medication),text(item.data.bowelMovement),text(item.data.sleep),text(item.data.mobility),text(item.data.mood),text(item.data.neededItems)&&`필요 물품 ${text(item.data.neededItems)}`,text(item.data.heardFromStaff)&&`의료진에게 들음: ${text(item.data.heardFromStaff)}`,text(item.data.note)].filter(Boolean).join(' · ')}</span><br/><small className="sub">{item.authorName} · 작성 {formatDate(item.createdAt)}{item.updatedAt&&item.updatedAt!==item.createdAt?` · 수정 ${formatDate(item.updatedAt)}`:''}</small></>}</li>)}</ul></>
}

function CareLogEditForm({caseId,item,onCancel,onSaved}:{caseId:string;item:RecordItem;onCancel:()=>void;onSaved:()=>Promise<void>}){
  const keys=['mealType','mealAmount','hydration','temperature','pain','medication','bowelMovement','sleep','mobility','mood','neededItems','heardFromStaff','note'] as const;type Key=(typeof keys)[number];const initial=Object.fromEntries(keys.map(key=>[key,text(item.data[key])])) as Record<Key,string>;const [values,setValues]=useState(initial);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const set=(key:Key,value:string)=>setValues(v=>({...v,[key]:value}));async function save(event:FormEvent){event.preventDefault();if(!Object.values(values).some(value=>value.trim())){setMessage('한 항목 이상 입력해 주세요. 모두 지우려면 삭제를 이용해 주세요.');return;}const payload=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,value.trim()?value:null]));setBusy(true);setMessage('');try{await json(`/api/cases/${caseId}/care-logs/${item.id}`,{method:'PATCH',body:JSON.stringify(payload)});await onSaved()}catch(error){setMessage(error instanceof Error?error.message:'수정하지 못했습니다.')}finally{setBusy(false)}}const extra:[Key,string][]=[['hydration','수분 섭취'],['medication','투약 확인 (복용 지시 아님)'],['bowelMovement','배변'],['sleep','수면'],['mobility','활동·이동'],['mood','기분·상태'],['neededItems','필요한 물품']];return <form className="record-edit" onSubmit={save}><h3>기록 수정</h3><p className="sub">필요한 항목만 수정하세요. 비운 항목은 기존 기록에서도 지워집니다.</p><div className="grid two"><label>식사 종류<input value={values.mealType} onChange={e=>set('mealType',e.target.value)}/></label><label>섭취량<input value={values.mealAmount} onChange={e=>set('mealAmount',e.target.value)}/></label><label>체온<input type="number" step="0.1" min="30" max="45" value={values.temperature} onChange={e=>set('temperature',e.target.value)}/></label><label>통증<input type="number" min="0" max="10" value={values.pain} onChange={e=>set('pain',e.target.value)}/></label></div><details open><summary>추가 생활 기록</summary><div className="edit-extra grid two">{extra.map(([key,label])=><label key={key}>{label}<input value={values[key]} onChange={e=>set(key,e.target.value)}/></label>)}</div><label>의료진에게 들은 내용<textarea rows={3} value={values.heardFromStaff} onChange={e=>set('heardFromStaff',e.target.value)}/></label></details><label>생활 상태와 메모<textarea rows={4} value={values.note} onChange={e=>set('note',e.target.value)}/></label><div className="record-edit-actions"><button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>취소</button><button className="btn" disabled={busy}>{busy?'저장 중…':'수정 저장'}</button></div>{message&&<p className="form-message" role="status">{message}</p>}</form>
}

function CareLogForm({caseId,refresh,latest}:{caseId:string;refresh:()=>Promise<void>;latest?:RecordItem}){
  const localNow=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16)};const makeEmpty=()=>({recordedAt:localNow(),mealType:'',mealAmount:'',hydration:'',temperature:'',pain:'',medication:'',bowelMovement:'',sleep:'',mobility:'',mood:'',neededItems:'',heardFromStaff:'',note:''});const draftKey=`guardian_care_draft_${caseId}`;const [values,setValues]=useState(makeEmpty);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [online,setOnline]=useState(true);const [draftReady,setDraftReady]=useState(false);const set=(key:keyof typeof values,value:string)=>setValues(old=>({...old,[key]:value}));const choices=(key:keyof typeof values,items:string[])=><div className="choice-row">{items.map(item=><button type="button" key={item} aria-pressed={values[key]===item} onClick={()=>set(key,values[key]===item?'':item)}>{item}</button>)}</div>;
  useEffect(()=>{setOnline(navigator.onLine);const saved=localStorage.getItem(draftKey);if(saved)try{setValues(current=>({...current,...JSON.parse(saved)}));setMessage('이 기기에 남아 있던 작성 내용을 복구했어요.')}catch{}setDraftReady(true);const on=()=>{setOnline(true);setMessage('인터넷이 연결됐어요. 저장 버튼을 눌러 다시 시도해 주세요.')};const off=()=>{setOnline(false);setMessage('인터넷 연결이 끊겼어요. 작성 내용은 이 기기에 임시 보관됩니다.')};window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[draftKey]);
  useEffect(()=>{if(!draftReady)return;const has=Object.entries(values).some(([key,value])=>key!=='recordedAt'&&value.trim());if(has)localStorage.setItem(draftKey,JSON.stringify(values));else localStorage.removeItem(draftKey)},[draftKey,draftReady,values]);
  function copyLatest(){if(!latest){setMessage('복사할 이전 기록이 없습니다.');return;}setValues(current=>({...current,mealType:text(latest.data.mealType),mealAmount:text(latest.data.mealAmount),hydration:text(latest.data.hydration),pain:text(latest.data.pain),bowelMovement:text(latest.data.bowelMovement),sleep:text(latest.data.sleep),mobility:text(latest.data.mobility),mood:text(latest.data.mood),neededItems:text(latest.data.neededItems),note:text(latest.data.note),temperature:'',medication:''}));setMessage('이전 기록을 복사했어요. 체온과 투약은 안전을 위해 복사하지 않았습니다.');}
  async function submit(event:FormEvent){event.preventDefault();const selected=Object.fromEntries(Object.entries(values).filter(([key,value])=>key!=='recordedAt'&&value.trim()));if(!Object.keys(selected).length){setMessage('아직 적힌 내용이 없어요. 한 항목만 골라도 저장할 수 있어요.');return;}setBusy(true);setMessage('');const payload={...selected,...(values.recordedAt?{recordedAt:new Date(values.recordedAt).toISOString()}:{})};try{await json(`/api/cases/${caseId}/care-logs`,{method:'POST',body:JSON.stringify(payload)});void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'care_log_saved'})});localStorage.removeItem(draftKey);setValues(makeEmpty());setMessage('가족에게 돌봄 기록을 공유했어요.');await refresh();}catch(error){setMessage(!navigator.onLine?'인터넷 연결 후 다시 저장할 수 있도록 작성 내용을 이 기기에 보관했어요.':error instanceof Error?`${error.message} 작성 내용은 그대로 보관됩니다.`:'기록을 저장하지 못했습니다. 작성 내용은 그대로 보관됩니다.');}finally{setBusy(false)}}
  return <form className="care-log-form" onSubmit={submit}><div className="draft-tools"><button type="button" onClick={copyLatest}>이전 기록 복사</button><span className={online?'online':'offline'}>{online?'온라인 · 자동 임시저장':'오프라인 · 기기에 보관 중'}</span></div><div className="field"><label htmlFor="recorded-at">기록 시각 (선택)</label><input id="recorded-at" type="datetime-local" value={values.recordedAt} onChange={e=>set('recordedAt',e.target.value)}/></div><fieldset><legend>식사</legend>{choices('mealType',['조식','중식','석식','간식','해당 없음'])}{choices('mealAmount',['안 먹음','조금','절반','거의 다','다 먹음','모름'])}</fieldset><fieldset><legend>수분 섭취</legend>{choices('hydration',['못 마심','한두 모금','한 컵','충분히','모름'])}<input value={values.hydration} onChange={e=>set('hydration',e.target.value)} placeholder="직접 입력 (예: 물 300mL)" aria-label="수분 섭취 직접 입력"/></fieldset><fieldset><legend>체온과 통증</legend><div className="grid two"><label>체온 (℃)<input type="number" inputMode="decimal" min="30" max="45" step="0.1" value={values.temperature} onChange={e=>set('temperature',e.target.value)} placeholder="36.5"/></label><label>통증 (0~10)<input type="number" inputMode="numeric" min="0" max="10" value={values.pain} onChange={e=>set('pain',e.target.value)} placeholder="0"/></label></div>{choices('pain',['0','2','4','6','8','10'])}</fieldset><fieldset><legend>투약 확인 <small>(복용 지시 아님)</small></legend>{choices('medication',['복용 확인','복용 안 함','모름','해당 없음'])}<input value={values.medication} onChange={e=>set('medication',e.target.value)} placeholder="약 이름이나 들은 내용" aria-label="투약 확인 직접 입력"/></fieldset><fieldset><legend>배변</legend>{choices('bowelMovement',['없음','보통','묽음','딱딱함','모름'])}</fieldset><fieldset><legend>수면</legend>{choices('sleep',['잘 잠','자주 깸','잠들기 어려움','낮잠','모름'])}</fieldset><fieldset><legend>활동·이동</legend>{choices('mobility',['침상 안정','앉아 있음','보행 도움','스스로 보행','모름'])}</fieldset><fieldset><legend>기분·상태</legend>{choices('mood',['편안함','불안함','기운 없음','평소와 비슷','모름'])}</fieldset><div className="field"><label htmlFor="needed-items">필요한 물품</label><input id="needed-items" value={values.neededItems} onChange={e=>set('neededItems',e.target.value)} placeholder="예: 물티슈, 생수"/></div><div className="field"><label htmlFor="heard-staff">의료진에게 들은 내용</label><textarea id="heard-staff" rows={3} value={values.heardFromStaff} onChange={e=>set('heardFromStaff',e.target.value)} placeholder="들은 내용을 그대로 적고, 정확한 지시는 의료진에게 다시 확인해 주세요"/></div><div className="field"><label htmlFor="care-note">메모</label><textarea id="care-note" rows={3} value={values.note} onChange={e=>set('note',e.target.value)} placeholder="그 밖의 상태나 가족에게 전할 말을 적어 주세요"/></div><button className="btn full" disabled={busy}>{busy?'저장하는 중…':'선택한 내용 저장'}</button>{message&&<p className="form-message" role="status">{message}</p>}</form>
}

function HandoffForm({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  type Values={status:string;next:string;question:string;neededItems:string};type Key=keyof Values;type Template={name:string;values:Values};
  const empty={status:'',next:'',question:'',neededItems:''};const [values,setValues]=useState<Values>(empty);const [enabled,setEnabled]=useState<Record<Key,boolean>>({status:true,next:true,question:true,neededItems:true});const [templates,setTemplates]=useState<Template[]>([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const care=data.records.find(item=>item.kind==='care-logs');const openTasks=data.tasks.filter(item=>!['DONE','CANCELLED'].includes(item.status)).slice(0,4);
  const set=(key:keyof typeof values,value:string)=>setValues(current=>({...current,[key]:value}));
  useEffect(()=>{try{setTemplates(JSON.parse(localStorage.getItem(`guardian_handoff_templates_${data.case.id}`)||'[]'))}catch{}},[data.case.id]);
  function recentCare(){if(!care){setMessage('불러올 최근 돌봄 기록이 없습니다.');return;}const parts=[text(care.data.mealType)&&`식사 ${text(care.data.mealType)} ${text(care.data.mealAmount)}`.trim(),text(care.data.sleep)&&`수면 ${text(care.data.sleep)}`,text(care.data.pain)&&`통증 ${text(care.data.pain)}`,text(care.data.note)].filter(Boolean);set('status',parts.join(' · '));setMessage('최근 기록을 불러왔어요. 전달 전에 내용을 확인해 주세요.');}
  function remaining(){if(!openTasks.length){setMessage('불러올 남은 할 일이 없습니다.');return;}set('next',openTasks.map(item=>`• ${item.title}${item.assigneeName?` (${item.assigneeName})`:''}`).join('\n'));setMessage('남은 할 일을 불러왔어요. 필요한 내용만 남겨 주세요.');}
  function saveTemplate(){const name=prompt('이 서식의 이름을 적어 주세요.');if(!name?.trim())return;const next=[...templates.filter(item=>item.name!==name.trim()),{name:name.trim(),values}].slice(-8);localStorage.setItem(`guardian_handoff_templates_${data.case.id}`,JSON.stringify(next));setTemplates(next);setMessage('이 기기에 교대 서식을 저장했어요.');}
  function listen(key:Key){type SpeechEvent={results:{[index:number]:{[index:number]:{transcript:string}}}};type Recognizer={lang:string;interimResults:boolean;start():void;onresult?:(event:SpeechEvent)=>void;onerror?:()=>void};const Constructor=(window as typeof window&{webkitSpeechRecognition?:new()=>Recognizer}).webkitSpeechRecognition;if(!Constructor){setMessage('이 브라우저에서는 음성 입력을 지원하지 않아요. 휴대폰 키보드의 마이크를 이용해 주세요.');return;}const recognition=new Constructor();recognition.lang='ko-KR';recognition.interimResults=false;recognition.onresult=event=>{const heard=event.results[0]?.[0]?.transcript??'';set(key,[values[key],heard].filter(Boolean).join(' '));setMessage('음성을 글자로 옮겼어요. 전달 전에 확인해 주세요.');};recognition.onerror=()=>setMessage('음성을 듣지 못했어요. 다시 시도해 주세요.');recognition.start();}
  async function submit(event:FormEvent){event.preventDefault();const payload=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,value.trim()]).filter(([key,value])=>enabled[key as Key]&&value));if(!Object.keys(payload).length){setMessage('전달할 항목을 선택하고 내용을 하나 이상 적어 주세요.');return;}setBusy(true);setMessage('');try{await json(`/api/cases/${data.case.id}/handoffs`,{method:'POST',body:JSON.stringify(payload)});void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'handoff_sent'})});setValues(empty);setMessage('다음 보호자에게 교대 브리핑을 전달했어요.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'교대 브리핑을 전달하지 못했습니다.');}finally{setBusy(false)}}
  const labels:Record<Key,string>={status:'현재 상태',next:'다음 할 일',question:'의료진에게 물어볼 것',neededItems:'필요한 물품'};const placeholders:Record<Key,string>={status:'예: 점심은 절반 정도 먹고 잠이 들었어요',next:'예: 오후 3시 검사 전 안내 다시 확인',question:'다음 회진 때 확인할 질문',neededItems:'예: 생수, 물티슈'};
  return <form className="handoff-form" onSubmit={submit}><div className="handoff-tools"><button type="button" onClick={recentCare}>최근 기록 불러오기</button><button type="button" onClick={remaining}>남은 할 일 불러오기</button><button type="button" onClick={saveTemplate}>현재 내용을 서식으로 저장</button></div>{templates.length>0&&<label>저장한 서식<select defaultValue="" onChange={event=>{const template=templates.find(item=>item.name===event.target.value);if(template)setValues(template.values)}}><option value="">서식 선택</option>{templates.map(item=><option value={item.name} key={item.name}>{item.name}</option>)}</select></label>}<p className="planner-safety">보호자가 관찰하거나 들은 내용을 전달하는 공간입니다. 병원 기록이나 의료진 지시를 대신하지 않아요.</p>{(Object.keys(values) as Key[]).map(key=><div className="handoff-field" key={key}><div className="row"><label className="handoff-include"><input type="checkbox" checked={enabled[key]} onChange={event=>setEnabled(current=>({...current,[key]:event.target.checked}))}/><span>{labels[key]} <small>(선택)</small></span></label>{key!=='neededItems'&&<button type="button" className="voice-button" onClick={()=>listen(key)}>말로 입력</button>}</div>{key==='neededItems'?<input disabled={!enabled[key]} value={values[key]} onChange={event=>set(key,event.target.value)} placeholder={placeholders[key]}/>:<textarea disabled={!enabled[key]} rows={key==='question'?2:3} value={values[key]} onChange={event=>set(key,event.target.value)} placeholder={placeholders[key]}/>}</div>)}<button className="btn full" disabled={busy}>{busy?'전달하는 중…':'선택한 브리핑 전달'}</button>{message&&<p className="form-message" role="status">{message}</p>}</form>;
}

function Handoff({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const items=data.records.filter(item=>item.kind==='handoffs');const [busy,setBusy]=useState('');const [message,setMessage]=useState('');
  async function acknowledge(id:string){if(busy)return;setBusy(id);setMessage('');try{await json(`/api/cases/${data.case.id}/handoffs/${id}/acknowledge`,{method:'POST',body:'{}'});await refresh();setMessage('확인한 브리핑으로 표시했어요.');}catch(error){setMessage(error instanceof Error?error.message:'확인 상태를 저장하지 못했습니다.');}finally{setBusy('')}}
  return <><div className="handoff-heading"><span className="eyebrow">다음 보호자에게 꼭 필요한 내용만</span><h1>30초 교대 브리핑</h1><p className="sub">모든 칸을 채울 필요 없이, 전달할 내용 하나만 적어도 됩니다.</p></div><Writable data={data}><HandoffForm data={data} refresh={refresh}/></Writable><h2 className="section-title">전달 내역</h2>{message&&<p className="form-message" role="status">{message}</p>}{items.length?<div className="handoff-list">{items.map((item,index)=>{const previous=items[index+1];const changed=[['status','현재 상태'],['next','다음 할 일'],['question','질문'],['neededItems','필요 물품']].filter(([key])=>text(item.data[key])!==text(previous?.data[key])).map(([,label])=>label);const acknowledged=new Set(Array.isArray(item.data.acknowledgedUserIds)?item.data.acknowledgedUserIds as string[]:[]);const missing=data.members.filter(member=>member.userId!==item.authorId&&!acknowledged.has(member.userId));return <article className="card handoff-card" key={item.id}>{changed.length>0&&previous&&<p className="handoff-changes">이전 브리핑과 달라진 항목: {changed.join(', ')}</p>}{(text(item.data.status)||text(item.data.summary))&&<div><small>현재 상태</small><p>{text(item.data.status)||text(item.data.summary)}</p></div>}{text(item.data.next)&&<div><small>다음 할 일</small><p className="preserve-lines">{text(item.data.next)}</p></div>}{text(item.data.question)&&<div><small>의료진에게 물어볼 것</small><p>{text(item.data.question)}</p></div>}{text(item.data.neededItems)&&<div><small>필요한 물품</small><p>{text(item.data.neededItems)}</p></div>}<p className="handoff-missing">{missing.length?`아직 확인 전: ${missing.map(member=>member.name).join(', ')}`:'참여 가족이 모두 확인했어요.'}</p><footer><small className="sub">{item.authorName} · {formatDate(item.createdAt)} · 가족 {Number(item.data.acknowledgementCount)||0}명 확인</small>{item.data.acknowledgedByMe?<span className="pill">확인함</span>:<button type="button" className="btn secondary" onClick={()=>void acknowledge(item.id)} disabled={Boolean(busy)}>{busy===item.id?'저장 중…':'확인했어요'}</button>}</footer></article>})}</div>:<Empty text="아직 교대 브리핑이 없습니다."/>}</>;
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

function HospitalHub({data,refresh}:{data:Overview;refresh:()=>Promise<void>}){
  const [kind,setKind]=useState<UtilityEntry['kind']>('HOSPITAL_INFO');const [title,setTitle]=useState('');const [detail,setDetail]=useState('');const [occursAt,setOccursAt]=useState('');const [busy,setBusy]=useState('');const [message,setMessage]=useState('');const writable=data.case.role!=='VIEWER'&&data.case.consented;
  const labels:Record<UtilityEntry['kind'],string>={HOSPITAL_INFO:'병원생활 정보',SHIFT:'보호자 교대',SUPPLY_REQUEST:'필요 물품 요청'};const placeholders:Record<UtilityEntry['kind'],string>={HOSPITAL_INFO:'예: 면회 시간은 오후 2시~6시',SHIFT:'예: 저녁 보호자 교대',SUPPLY_REQUEST:'예: 물티슈와 생수 부탁해요'};
  async function submit(event:FormEvent){event.preventDefault();if(!title.trim())return;setBusy('create');setMessage('');try{await json(`/api/cases/${data.case.id}/utilities`,{method:'POST',body:JSON.stringify({kind,title:title.trim(),detail:detail.trim()||undefined,occursAt:occursAt?new Date(occursAt).toISOString():undefined})});void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'utility_saved'})});setTitle('');setDetail('');setOccursAt('');await refresh();setMessage(`${labels[kind]}를 가족과 공유했어요.`)}catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했습니다.')}finally{setBusy('')}}
  async function remove(item:UtilityEntry){if(busy||!confirm(`${labels[item.kind]}를 삭제할까요?`))return;setBusy(item.id);try{await json(`/api/cases/${data.case.id}/utilities/${item.id}`,{method:'DELETE'});await refresh()}catch(error){setMessage(error instanceof Error?error.message:'삭제하지 못했습니다.')}finally{setBusy('')}}
  async function makeTask(item:UtilityEntry){if(busy)return;setBusy(item.id);try{await json(`/api/cases/${data.case.id}/tasks`,{method:'POST',body:JSON.stringify({title:item.title,description:item.detail||undefined})});await refresh();setMessage('가족 할 일에도 추가했어요.')}catch(error){setMessage(error instanceof Error?error.message:'할 일로 추가하지 못했습니다.')}finally{setBusy('')}}
  return <><div><span className="eyebrow">병원에서 필요한 생활 정보를 가족과 함께</span><h1>병원생활 허브</h1><p className="sub">면회·주차·식사·교대·필요 물품을 한곳에서 공유하세요. 병원의 최신 안내를 다시 확인해 주세요.</p></div>{writable&&<form className="utility-form" onSubmit={submit}><div className="notification-filters">{(Object.keys(labels) as UtilityEntry['kind'][]).map(value=><button type="button" key={value} aria-pressed={kind===value} onClick={()=>setKind(value)}>{labels[value]}</button>)}</div><label>{labels[kind]} 제목<input value={title} onChange={event=>setTitle(event.target.value)} placeholder={placeholders[kind]} required/></label><label>상세 내용 <small>(선택)</small><textarea rows={3} value={detail} onChange={event=>setDetail(event.target.value)} placeholder="가족이 알아야 할 내용을 적어 주세요"/></label>{kind==='SHIFT'&&<label>교대 시각 <small>(선택)</small><input type="datetime-local" value={occursAt} onChange={event=>setOccursAt(event.target.value)}/></label>}<button className="btn full" disabled={busy==='create'}>{busy==='create'?'공유 중…':'가족과 공유'}</button></form>}{message&&<p className="form-message" role="status">{message}</p>}<div className="utility-sections">{(Object.keys(labels) as UtilityEntry['kind'][]).map(group=>{const items=data.utilities.filter(item=>item.kind===group);return <section key={group}><h2 className="section-title">{labels[group]}</h2>{items.length?<div className="grid">{items.map(item=><article className="card utility-card" key={item.id}><div className="row"><b>{item.title}</b><span className="pill">{labels[item.kind]}</span></div>{item.detail&&<p className="preserve-lines">{item.detail}</p>}<small className="sub">{item.occursAt?`${formatDate(item.occursAt)} · `:''}{formatDate(item.createdAt)} 공유</small>{writable&&<div className="mini-actions">{item.kind==='SUPPLY_REQUEST'&&<button type="button" onClick={()=>void makeTask(item)} disabled={Boolean(busy)}>할 일로 추가</button>}{item.canManage&&<button type="button" className="danger-text" onClick={()=>void remove(item)} disabled={Boolean(busy)}>삭제</button>}</div>}</article>)}</div>:<Empty text={`${labels[group]}가 아직 없습니다.`}/>}</section>})}</div></>;
}

function TrustCenter({data}:{data:Overview}){
  type PrivacyItem={id:string;type:string;status:string;response?:string;createdAt:string};const [requests,setRequests]=useState<PrivacyItem[]>([]);const [type,setType]=useState('EXPORT');const [detail,setDetail]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const load=useCallback(()=>json<{items:PrivacyItem[]}>('/api/privacy-requests').then(result=>setRequests(result.items)).catch(()=>{}),[]);useEffect(()=>{void load()},[load]);
  const actionLabel:Record<string,string>={family_invited:'가족 초대',invitation_revoked:'초대 취소',invitation_accepted:'초대 수락',case_member_role_changed:'가족 권한 변경',case_member_revoked:'가족 내보내기',personal_data_exported:'개인정보 내려받기'};
  async function request(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');try{await json('/api/privacy-requests',{method:'POST',body:JSON.stringify({type,detail:detail.trim()||undefined})});setDetail('');await load();setMessage('요청을 접수했어요. 처리 상태를 여기에서 확인할 수 있습니다.')}catch(error){setMessage(error instanceof Error?error.message:'요청을 접수하지 못했습니다.')}finally{setBusy(false)}}
  return <><div><span className="eyebrow">내 정보와 가족 권한을 투명하게</span><h1>안심센터</h1><p className="sub">내려받기·정정·삭제 요청과 가족 권한 변경 이력을 확인하세요.</p></div><div className="trust-actions"><a className="btn secondary" href="/api/privacy/export" download>내 개인정보 내려받기</a><a className="btn secondary" href={`/api/cases/${data.case.id}/discharge/pdf`} download onClick={()=>void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'pdf_downloaded'})})}>가족 공유 요약 PDF</a></div><form className="utility-form" onSubmit={request}><h2>개인정보 요청</h2><label>요청 종류<select value={type} onChange={event=>setType(event.target.value)}><option value="EXPORT">열람·내보내기</option><option value="CORRECTION">정정</option><option value="DELETION">삭제</option><option value="SUSPENSION">처리 정지</option></select></label><label>요청 내용 <small>(선택)</small><textarea rows={3} value={detail} onChange={event=>setDetail(event.target.value)} placeholder="민감한 환자 정보 대신 처리할 범위만 적어 주세요"/></label><button className="btn full" disabled={busy}>{busy?'접수 중…':'요청 접수'}</button></form>{message&&<p className="form-message" role="status">{message}</p>}<h2 className="section-title">내 요청 처리 상태</h2>{requests.length?<ul className="list">{requests.map(item=><li key={item.id}><b>{item.type}</b> · <span className="pill">{item.status}</span><br/><small className="sub">{formatDate(item.createdAt)}{item.response?` · ${item.response}`:''}</small></li>)}</ul>:<Empty text="접수한 개인정보 요청이 없습니다."/>}<h2 className="section-title">가족 권한 관리 이력</h2>{data.managementHistory.length?<ul className="list">{data.managementHistory.map(item=><li key={item.id}><b>{actionLabel[item.action]??'관리 활동'}</b><br/><small className="sub">{formatDate(item.at)}</small></li>)}</ul>:<Empty text="표시할 관리 이력이 없습니다."/>}</>;
}

function Billing(){
  return <><h1>무료 이용 안내</h1><div className="card plan-card"><div className="plan-icon"><Icon name="heart" size={28}/></div><span className="pill">모든 보호자에게</span><h2>보호자노트 무료</h2><div className="metric">0원</div><p className="sub">가족 공유 · 돌봄 기록 · 사진 글자 추출 · 퇴원 PDF를 제한 없이 이용하세요.</p><Link className="btn full" href="/dashboard">내 돌봄방으로 가기</Link></div><div className="notice">운영비는 선택적으로 이용하는 입원 준비물 제휴 링크로 보조합니다. 구매하지 않아도 모든 기능을 동일하게 이용할 수 있습니다.</div></>;
}

function Settings(){
  type InstallPrompt={prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};const [preferences,setPreferences]=useState<Record<string,boolean>>({});const [quiet,setQuiet]=useState({start:'22:00',end:'07:00'});const [display,setDisplay]=useState({largeText:false,simpleMode:false});const [installPrompt,setInstallPrompt]=useState<InstallPrompt|null>(null);const [message,setMessage]=useState('');
  const channels=[['care_schedule','돌봄 일정 앱 알림'],['marketing_email','마케팅 이메일'],['marketing_sms','마케팅 문자']];
  useEffect(()=>{void json<{items:Array<{channel:string;enabled:boolean;quietHours?:{start?:string;end?:string}}>}>('/api/preferences').then(data=>{setPreferences(Object.fromEntries(data.items.map(item=>[item.channel,item.enabled])));const schedule=data.items.find(item=>item.channel==='care_schedule')?.quietHours;if(schedule?.start&&schedule.end)setQuiet({start:schedule.start,end:schedule.end})}).catch(()=>{});void json<{items:Array<{key:string;value:{largeText?:boolean;simpleMode?:boolean}}>}>('/api/settings').then(data=>{const value=data.items.find(item=>item.key==='display')?.value;if(value){const next={largeText:Boolean(value.largeText),simpleMode:Boolean(value.simpleMode)};setDisplay(next);applyDisplay(next)}}).catch(()=>{});const handler=(event:Event)=>{event.preventDefault();setInstallPrompt(event as Event&InstallPrompt)};window.addEventListener('beforeinstallprompt',handler);return()=>window.removeEventListener('beforeinstallprompt',handler)},[]);
  function applyDisplay(value:{largeText:boolean;simpleMode:boolean}){document.documentElement.dataset.largeText=value.largeText?'true':'false';document.documentElement.dataset.simpleMode=value.simpleMode?'true':'false';localStorage.setItem('guardian_display',JSON.stringify(value));}
  const update=async(channel:string,enabled:boolean)=>{await json('/api/preferences',{method:'PATCH',body:JSON.stringify({channel,enabled})});setPreferences(current=>({...current,[channel]:enabled}));};
  async function saveQuiet(){await json('/api/preferences',{method:'PATCH',body:JSON.stringify({channel:'care_schedule',enabled:preferences.care_schedule??true,quietStart:quiet.start,quietEnd:quiet.end})});setMessage(`${quiet.start}부터 ${quiet.end}까지 방해 금지 시간으로 저장했어요.`)}
  async function changeDisplay(key:keyof typeof display,checked:boolean){const next={...display,[key]:checked};setDisplay(next);applyDisplay(next);await json('/api/settings',{method:'PATCH',body:JSON.stringify({key:'display',value:next})});}
  async function install(){if(!installPrompt){setMessage('브라우저 메뉴에서 “홈 화면에 추가” 또는 “앱 설치”를 선택해 주세요.');return;}await installPrompt.prompt();const choice=await installPrompt.userChoice;setMessage(choice.outcome==='accepted'?'보호자노트 설치를 시작했어요.':'설치를 취소했어요.');setInstallPrompt(null)}
  return <><h1>설정</h1>{message&&<p className="form-message" role="status">{message}</p>}<h2 className="section-title">보기 편하게</h2><label className="check"><input type="checkbox" checked={display.largeText} onChange={event=>void changeDisplay('largeText',event.target.checked)}/><span>큰 글씨 모드<small>버튼과 본문 글씨를 더 크게 표시합니다</small></span></label><label className="check"><input type="checkbox" checked={display.simpleMode} onChange={event=>void changeDisplay('simpleMode',event.target.checked)}/><span>간편 모드<small>핵심 기능을 먼저 보여 줍니다</small></span></label><button className="btn secondary full" type="button" onClick={()=>void install()}>이 휴대폰에 보호자노트 설치</button><h2 className="section-title">알림 동의</h2>{channels.map(([channel,label])=><label className="check" key={channel}><input type="checkbox" checked={preferences[channel]??false} onChange={event=>void update(channel,event.target.checked)}/><span>{label}<small>변경 즉시 반영됩니다</small></span></label>)}<div className="quiet-hours"><h3>방해 금지 시간</h3><div className="grid two"><label>시작<input type="time" value={quiet.start} onChange={event=>setQuiet(value=>({...value,start:event.target.value}))}/></label><label>종료<input type="time" value={quiet.end} onChange={event=>setQuiet(value=>({...value,end:event.target.value}))}/></label></div><button className="btn secondary full" type="button" onClick={()=>void saveQuiet()}>방해 금지 시간 저장</button><small className="sub">앱 안의 알림은 계속 확인할 수 있으며, 긴급 의료 알림을 대신하지 않습니다.</small></div><h2 className="section-title">내 정보</h2><div className="grid"><a className="btn secondary" href="/api/privacy/export">내 데이터 내려받기</a><Link className="btn secondary" href="/trust">안심센터 열기</Link><button className="btn danger" onClick={async()=>{if(confirm('탈퇴를 요청할까요? 공유가 즉시 중단됩니다.'))await json('/api/privacy/delete',{method:'POST',body:'{}'});}}>계정 탈퇴 요청</button></div></>;
}

const moreItems:Array<[string,string,IconName]>=[['알림센터','notifications','sparkles'],['병원생활 허브','hospital','home'],['마음쉼터','comfort','heart'],['입원 준비물','supplies','shopping'],['교대 브리핑','handoff','handoff'],['회진 질문','questions','question'],['비용 정산','expenses','expense'],['퇴원 준비','discharge','discharge'],['안심센터','trust','document'],['무료 이용 안내','billing','sparkles'],['공지·법정 문서','legal','document'],['설정·탈퇴','settings','settings']];
function More(){return <><h1>더보기</h1><div className="grid more-grid">{moreItems.map(([label,path,icon])=><Link className="card row" href={`/${path}`} key={path}><span className="menu-icon"><Icon name={icon}/></span><b>{label}</b><span className="chevron">›</span></Link>)}</div></>}
function Writable({data,children}:{data:Overview;children:React.ReactNode}){return data.case.role!=='VIEWER'&&data.case.consented?<>{children}</>:<div className="notice">이 돌봄방에서는 열람만 할 수 있습니다.</div>}
function Empty({text:message}:{text:string}){return <div className="empty"><span className="empty-icon"><Icon name="sparkles"/></span><p className="sub">{message}</p></div>}
function fieldLabel(key:string){return ({ocrText:'추출한 텍스트',documentType:'문서 종류',dateTime:'일시',location:'장소',fasting:'금식',preparations:'준비물',caregiverTasks:'보호자 할 일',cautions:'주의사항',reason:'실패 사유'} as Record<string,string>)[key]||key;}

export function CaseWorkspace(){const section=usePathname().split('/')[1]||'dashboard';return <Workspace section={section}/>;}
