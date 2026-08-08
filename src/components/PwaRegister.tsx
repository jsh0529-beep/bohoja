'use client';
import { useEffect, useState } from 'react';

export function PwaRegister(){
  const [offline,setOffline]=useState(false);
  useEffect(()=>{
    if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js');
    const update=()=>setOffline(!navigator.onLine);update();
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)};
  },[]);
  return offline?<div role="status" style={{position:'fixed',zIndex:30,top:8,left:'50%',transform:'translateX(-50%)',width:'calc(100% - 24px)',maxWidth:440,padding:'10px 14px',borderRadius:12,background:'#4b3a0a',color:'white',textAlign:'center',fontSize:13,fontWeight:700}}>오프라인입니다. 저장 전 입력 내용을 유지하고 연결 후 다시 시도해 주세요.</div>:null;
}
