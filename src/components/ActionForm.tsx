'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
type Props={endpoint:string;method?:string;children:React.ReactNode;success?:string;redirect?:string;submitLabel?:string;resetOnSuccess?:boolean;onSuccess?:(data:unknown)=>void|Promise<void>};
export function ActionForm({endpoint,method='POST',children,success='저장되었습니다',redirect,submitLabel='확인하고 계속',resetOnSuccess=false,onSuccess}:Props){
 const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);const router=useRouter();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setMsg('');const target=e.currentTarget;const form=new FormData(target);const body:Record<string,string|boolean|number>={};
  for(const [key,value] of form.entries())body[key]=value instanceof File?value.name:String(value);
  target.querySelectorAll<HTMLInputElement>('input[type=number]').forEach(input=>{if(input.name&&input.value!=='')body[input.name]=Number(input.value)});
  e.currentTarget.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(input=>body[input.name]=input.checked);
  if('required0' in body){body.terms=body.required0;body.privacy=body.required1;body.ageConfirmed=body.required2}
  if('authorityConfirmed' in body)body.authority='CAREGIVER';
  try{const r=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||data?.error||'요청을 처리하지 못했습니다');setMsg(success);if(resetOnSuccess)target.reset();await onSuccess?.(data);if(redirect)router.push(redirect);router.refresh()}catch(e){setMsg(e instanceof Error?e.message:'잠시 후 다시 시도해 주세요')}finally{setBusy(false)}
 }
 return <form onSubmit={submit}>{children}<button className="btn full" disabled={busy}>{busy?'처리 중…':submitLabel}</button>{msg&&<div className="toast" role="status" aria-live="polite">{msg}</div>}</form>
}
