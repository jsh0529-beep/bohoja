'use client';

import {useEffect,useMemo,useState} from 'react';
import Image from 'next/image';
import {comfortCategories,ComfortCategory,comfortMessages,shareTemplates} from '@/lib/comfort-content';
import {Icon} from '@/components/Icon';

const savedKey='guardian_comfort_saved';
const dailyIndex=Math.floor(Date.now()/86400000)%comfortMessages.length;

export function ComfortSpace(){
  const [category,setCategory]=useState<ComfortCategory>('all');
  const [saved,setSaved]=useState<string[]>([]);
  const [toast,setToast]=useState('');
  const [waitingMode,setWaitingMode]=useState(false);
  const [waitingIndex,setWaitingIndex]=useState(0);
  const [breathing,setBreathing]=useState(false);
  const [seconds,setSeconds]=useState(180);

  useEffect(()=>{const frame=window.requestAnimationFrame(()=>{try{setSaved(JSON.parse(localStorage.getItem(savedKey)??'[]') as string[])}catch{}});return()=>window.cancelAnimationFrame(frame)},[]);
  useEffect(()=>{if(!breathing)return;const timer=window.setInterval(()=>setSeconds(value=>{if(value<=1){window.clearInterval(timer);setBreathing(false);return 0}return value-1}),1000);return()=>window.clearInterval(timer)},[breathing]);
  useEffect(()=>{if(!waitingMode)return;const timer=window.setInterval(()=>setWaitingIndex(value=>(value+1)%comfortMessages.length),9000);return()=>window.clearInterval(timer)},[waitingMode]);

  const items=useMemo(()=>category==='all'?comfortMessages:comfortMessages.filter(item=>item.category===category),[category]);
  const today=comfortMessages[dailyIndex];
  const elapsed=180-seconds;
  const breathPhase=elapsed%10<4?'천천히 들이쉬어요':'길게 내쉬어요';
  const save=(id:string)=>{const next=saved.includes(id)?saved.filter(item=>item!==id):[...saved,id];setSaved(next);localStorage.setItem(savedKey,JSON.stringify(next));setToast(saved.includes(id)?'저장에서 뺐어요':'내 마음 문장에 저장했어요');window.setTimeout(()=>setToast(''),1800)};
  const share=async(text:string)=>{const nativeShare=typeof navigator.share==='function';try{if(nativeShare)await navigator.share({title:'보호자노트 마음쉼터',text});else await navigator.clipboard.writeText(text);setToast(nativeShare?'마음을 전했어요':'문장을 복사했어요')}catch(error){if((error as Error).name!=='AbortError')setToast('문장을 길게 눌러 복사해 주세요')}window.setTimeout(()=>setToast(''),1800)};
  const beginWaiting=async()=>{setWaitingMode(true);setWaitingIndex(dailyIndex);try{await document.documentElement.requestFullscreen?.()}catch{}};
  const endWaiting=async()=>{setWaitingMode(false);try{if(document.fullscreenElement)await document.exitFullscreen()}catch{}};
  const resetBreathing=()=>{setBreathing(false);setSeconds(180)};

  return <div className="comfort-space">
    <section className="comfort-hero">
      <div className="comfort-mark"><Icon name="heart" size={28}/></div>
      <span className="eyebrow">마음을 위한 작은 여백</span>
      <h1>마음쉼터</h1>
      <p>기다리는 시간 동안 잠시 숨을 고르고, 나와 가족에게 다정한 말을 건네보세요.</p>
      <button className="btn comfort-waiting-button" onClick={()=>void beginWaiting()}><Icon name="sparkles" size={19}/> 대기실 모드 시작</button>
    </section>

    <section className="today-comfort" aria-labelledby="today-comfort-title">
      <div className="row"><span className="pill">오늘의 문장</span><button className={`save-heart ${saved.includes(today.id)?'saved':''}`} onClick={()=>save(today.id)} aria-label={saved.includes(today.id)?'오늘의 문장 저장 해제':'오늘의 문장 저장'}>♥</button></div>
      <h2 id="today-comfort-title">{today.title}</h2><p>{today.body}</p>
    </section>

    <section className="breathing-card" aria-labelledby="breathing-title">
      <div className={`breath-orb ${breathing?'breathing':''}`}><span>{breathing?breathPhase:'숨 고르기'}</span></div>
      <div className="breathing-copy"><span className="eyebrow">3분 마음 정리</span><h2 id="breathing-title">한 호흡씩 천천히</h2><p>발바닥이 바닥에 닿는 감각을 느끼며 편안한 범위에서 호흡해 보세요.</p><strong className="breath-time" aria-live="polite">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong><div className="breath-actions"><button className="btn" onClick={()=>setBreathing(value=>!value)} disabled={seconds===0}>{breathing?'잠시 멈춤':seconds<180?'계속하기':'3분 시작'}</button>{seconds<180&&<button className="btn secondary" onClick={resetBreathing}>처음부터</button>}</div><small>어지럽거나 불편하면 즉시 멈추고 평소 호흡으로 돌아오세요.</small></div>
    </section>

    <section aria-labelledby="comfort-list-title"><div className="section-heading comfort-heading"><span className="eyebrow">상황에 맞는 위로</span><h2 id="comfort-list-title" className="section-title">지금 필요한 문장을 골라보세요</h2></div>
      <div className="comfort-tabs" role="tablist" aria-label="위로 문장 분류">{comfortCategories.map(item=><button key={item.id} role="tab" aria-selected={category===item.id} onClick={()=>setCategory(item.id)}>{item.label}</button>)}</div>
      <div className="comfort-grid">{items.map(item=><article className="comfort-card" key={item.id}><button className={`save-heart ${saved.includes(item.id)?'saved':''}`} onClick={()=>save(item.id)} aria-label={saved.includes(item.id)?`${item.title} 저장 해제`:`${item.title} 저장`}>♥</button><h3>{item.title}</h3><p>{item.body}</p><button className="share-text" onClick={()=>void share(`${item.title}\n${item.body}`)}>이 문장 전하기</button></article>)}</div>
    </section>

    {saved.length>0&&<section className="saved-comfort"><div><Icon name="heart"/><strong>내 마음 문장 {saved.length}개</strong></div><p>{comfortMessages.find(item=>item.id===saved[saved.length-1])?.body}</p></section>}

    <section className="message-templates" aria-labelledby="message-title"><span className="eyebrow">말이 잘 나오지 않을 때</span><h2 id="message-title" className="section-title">마음을 대신 전해드려요</h2><div className="grid">{shareTemplates.map(template=><div className="message-template" key={template.id}><b>{template.label}</b><p>{template.text}</p><button className="btn secondary full" onClick={()=>void share(template.text)}>복사하거나 전하기</button></div>)}</div></section>

    <aside className="crisis-help"><Icon name="shield" size={24}/><div><strong>혼자 감당하기 어려운 순간에는</strong><p>자신을 해칠 생각이 들거나 마음이 매우 위태롭다면 혼자 있지 말고 도움을 요청하세요. 이 공간은 전문적인 상담이나 치료를 대신하지 않습니다.</p><div className="help-actions"><a href="tel:109">24시간 109</a><a href="tel:15770199">위기상담 1577-0199</a><a href="tel:119">긴급 119</a></div></div></aside>

    {waitingMode&&<div className="waiting-room" role="dialog" aria-modal="true" aria-label="마음쉼터 대기실 모드"><div className="waiting-brand"><Image src="/brand-logo.svg" alt="보호자노트" width={158} height={40}/></div><div className="waiting-visual"><span>오늘, 여기에서</span><h2>{comfortMessages[waitingIndex].title}</h2><p>{comfortMessages[waitingIndex].body}</p><div className="waiting-dots" aria-hidden="true">{[0,1,2,3,4].map(dot=><i className={waitingIndex%5===dot?'active':''} key={dot}/>)}</div></div><div className="waiting-controls"><button onClick={()=>setWaitingIndex(value=>(value-1+comfortMessages.length)%comfortMessages.length)} aria-label="이전 문장">‹</button><button onClick={()=>void endWaiting()}>대기실 모드 끝내기</button><button onClick={()=>setWaitingIndex(value=>(value+1)%comfortMessages.length)} aria-label="다음 문장">›</button></div></div>}
    {toast&&<div className="toast" role="status" aria-live="polite">{toast}</div>}
  </div>;
}
