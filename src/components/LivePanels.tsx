'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Legal = { id:string; slug:string; title:string; version:string; body:string; published:boolean; updatedAt:string };
type Notice = { id:string; title:string; body:string; published:boolean; updatedAt:string };
type Privacy = { id:string; type:string; detail?:string; status:string; response?:string };
type Audit = { id:string; action:string; actorId?:string; target?:string; at:string };
type Usage = { id:string; eventName:string; day:string; count:number };

async function json<T>(url:string, init?:RequestInit):Promise<T>{
  const response=await fetch(url,init);
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error?.message ?? '요청을 처리하지 못했습니다.');
  return data;
}

export function LegalPanel(){
  const [legal,setLegal]=useState<Legal[]>([]); const [notices,setNotices]=useState<Notice[]>([]); const [error,setError]=useState('');
  useEffect(()=>{Promise.all([json<{items:Legal[]}>('/api/legal'),json<{items:Notice[]}>('/api/notices')]).then(([l,n])=>{setLegal(l.items);setNotices(n.items)}).catch(e=>setError(e.message))},[]);
  return <><h1>법정 문서와 공지</h1>{error&&<div className="notice">{error}</div>}
    <h2 className="section-title">현재 적용 문서</h2>{legal.map(x=><details className="card" key={x.id}><summary><b>{x.title}</b> <span className="pill">v{x.version}</span></summary><p>{x.body}</p><small className="sub">갱신 {new Date(x.updatedAt).toLocaleDateString('ko-KR')}</small></details>)}
    <h2 className="section-title">서비스 공지</h2>{notices.map(x=><article className="card" key={x.id}><b>{x.title}</b><p>{x.body}</p></article>)}
    {!error&&!legal.length&&!notices.length&&<p className="sub">공개된 문서를 불러오는 중입니다.</p>}</>;
}

export function AdminPanel(){
  const [stats,setStats]=useState<{users:number;cases:number;payments:number;privacyPending:number}|null>(null);
  const [legal,setLegal]=useState<Legal[]>([]); const [notices,setNotices]=useState<Notice[]>([]); const [privacy,setPrivacy]=useState<Privacy[]>([]); const [audit,setAudit]=useState<Audit[]>([]); const [usage,setUsage]=useState<Usage[]>([]); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const load=useCallback(async()=>{try{const [s,l,n,p,a,u]=await Promise.all([json<typeof stats>('/api/admin/dashboard'),json<{items:Legal[]}>('/api/admin/legal'),json<{items:Notice[]}>('/api/admin/notices'),json<{items:Privacy[]}>('/api/admin/privacy-requests'),json<{items:Audit[]}>('/api/admin/audit'),json<{items:Usage[]}>('/api/admin/analytics')]);setStats(s);setLegal(l.items);setNotices(n.items);setPrivacy(p.items);setAudit(a.items);setUsage(u.items);setError('')}catch(e){setError(e instanceof Error?e.message:'관리자 데이터를 불러오지 못했습니다.')}},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load]);
  async function submit(e:FormEvent<HTMLFormElement>,kind:'legal'|'notices'){e.preventDefault();const form=new FormData(e.currentTarget);const data=Object.fromEntries(form.entries());try{await json(`/api/admin/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,published:true})});setMessage(kind==='legal'?'법정문서를 게시했습니다.':'공지를 게시했습니다.');e.currentTarget.reset();await load()}catch(err){setMessage(err instanceof Error?err.message:'게시하지 못했습니다.')}}
  async function complete(id:string){try{await json(`/api/admin/privacy-requests/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED',response:'관리자 처리 완료'})});await load()}catch(e){setMessage(e instanceof Error?e.message:'처리하지 못했습니다.')}}
  async function toggle(kind:'legal'|'notices',item:Legal|Notice){try{await json(`/api/admin/${kind}/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:!item.published})});await load()}catch(e){setMessage(e instanceof Error?e.message:'변경하지 못했습니다.')}}
  if(error)return <><span className="eyebrow">관리자 콘솔</span><h1>관리자 로그인이 필요합니다</h1><div className="notice">{error} 관리자 계정으로 로그인한 뒤 다시 열어 주세요.</div></>;
  return <><span className="eyebrow">관리자 콘솔</span><h1>서비스 운영</h1>{message&&<div className="toast" role="status">{message}</div>}
    <div className="grid two"><div className="card"><span className="sub">회원</span><div className="metric">{stats?.users??'–'}</div></div><div className="card"><span className="sub">돌봄방</span><div className="metric">{stats?.cases??'–'}</div></div><div className="card"><span className="sub">서비스 요금</span><div className="metric">0원</div></div><div className="card"><span className="sub">권리요청 대기</span><div className="metric">{stats?.privacyPending??'–'}</div></div></div>
    <h2 className="section-title">익명 사용 현황</h2><div className="grid two">{usage.slice(0,8).map(item=><div className="card" key={item.id}><b>{item.eventName}</b><div className="metric">{item.count}</div><small className="sub">{item.day} · 개인정보 없는 합계</small></div>)}</div>
    <h2 className="section-title">법정문서 게시</h2><form className="card" onSubmit={e=>submit(e,'legal')}><div className="field"><label>슬러그</label><input name="slug" required/></div><div className="field"><label>제목</label><input name="title" required/></div><div className="field"><label>버전</label><input name="version" required/></div><div className="field"><label>본문</label><textarea name="body" minLength={10} required/></div><button className="btn full">게시</button></form>
    {legal.map(x=><div className="card row" key={x.id}><div><b>{x.title}</b><small className="sub">v{x.version} · {x.published?'공개':'비공개'}</small></div><button className="btn secondary" onClick={()=>toggle('legal',x)}>{x.published?'비공개':'공개'}</button></div>)}
    <h2 className="section-title">공지 게시</h2><form className="card" onSubmit={e=>submit(e,'notices')}><div className="field"><label>제목</label><input name="title" required/></div><div className="field"><label>내용</label><textarea name="body" required/></div><button className="btn full">게시</button></form>
    {notices.map(x=><div className="card row" key={x.id}><div><b>{x.title}</b><small className="sub">{x.published?'공개':'비공개'}</small></div><button className="btn secondary" onClick={()=>toggle('notices',x)}>{x.published?'비공개':'공개'}</button></div>)}
    <h2 className="section-title">개인정보 권리요청</h2>{privacy.map(x=><div className="card" key={x.id}><div className="row"><b>{x.type}</b><span className="pill">{x.status}</span></div><p>{x.detail||'상세 내용 없음'}</p>{x.status!=='COMPLETED'&&<button className="btn secondary full" onClick={()=>complete(x.id)}>처리 완료</button>}</div>)}
    <h2 className="section-title">최근 감사로그</h2><ul className="list">{audit.slice(0,20).map(x=><li key={x.id}><b>{x.action}</b><small className="sub">{new Date(x.at).toLocaleString('ko-KR')}</small></li>)}</ul></>;
}
