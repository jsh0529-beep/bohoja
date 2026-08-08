'use client';

import Image from 'next/image';
import {FormEvent,useEffect,useState} from 'react';
import {Icon} from '@/components/Icon';

export function LocalOcr({caseId,refresh}:{caseId:string;refresh:()=>Promise<void>}){
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [extracted,setExtracted]=useState('');
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [confidence,setConfidence]=useState<number|null>(null);

  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const chooseFile=(next:File|null)=>{
    setFile(next);setPreview(next?URL.createObjectURL(next):'');setExtracted('');setMessage('');
  };

  const recognize=async()=>{
    if(!file)return;
    setBusy(true);setMessage('');setProgress(0);setStatus('문자 인식기를 준비하는 중…');
    let worker:Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>|null=null;
    try{
      const {createWorker,OEM}=await import('tesseract.js');
      worker=await createWorker('kor',OEM.LSTM_ONLY,{
        workerPath:'/tesseract/worker.min.js',corePath:'/tesseract/tesseract-core-lstm.wasm.js',langPath:'/tessdata',gzip:true,
        logger:event=>{setProgress(Math.round(event.progress*100));setStatus(event.status==='recognizing text'?'사진에서 글자를 읽는 중…':'문자 인식기를 준비하는 중…');},
      });
      const result=await worker.recognize(file);
      setExtracted(result.data.text.trim());
      setConfidence(Math.round(result.data.confidence));
      setMessage('사진은 전송하지 않았습니다. 추출된 글자를 확인하고 필요한 부분을 고쳐 주세요.');
    }catch{
      setMessage('글자를 읽지 못했습니다. 선명한 사진으로 다시 시도하거나 직접 입력해 주세요.');
    }finally{
      await worker?.terminate().catch(()=>{});
      setBusy(false);
    }
  };

  const save=async(event:FormEvent)=>{
    event.preventDefault();
    if(!file||!extracted.trim())return;
    setSaving(true);setMessage('');
    try{
      const response=await fetch(`/api/cases/${caseId}/documents/ocr`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileName:file.name,text:extracted.trim(),confidence}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error?.message||'저장하지 못했습니다.');
      setMessage('확인한 텍스트를 가족 돌봄방에 저장했습니다.');
      chooseFile(null);setConfidence(null);setProgress(0);
      await refresh();
    }catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했습니다.');}
    finally{setSaving(false);}
  };

  return <form className="local-ocr" onSubmit={save}>
    <div className="local-ocr-intro"><span className="ocr-icon"><Icon name="document"/></span><div><b>기기에서 바로 글자 추출</b><p>사진을 서버나 외부 AI로 보내지 않고 이 브라우저 안에서만 읽습니다.</p></div></div>
    <label className="ocr-drop" htmlFor="ocr-photo">
      {preview?<Image src={preview} alt="선택한 문서 사진 미리보기" width={900} height={1200} unoptimized/>:<><Icon name="camera" size={30}/><b>안내문 사진 찍기 또는 선택</b><span>JPG·PNG·WEBP, 인쇄된 한글 문서 권장</span></>}
      <input id="ocr-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event=>chooseFile(event.target.files?.[0]??null)}/>
    </label>
    {file&&<><div className="row ocr-file"><span><b>{file.name}</b><small>{(file.size/1024/1024).toFixed(1)}MB</small></span><button type="button" className="btn secondary" onClick={()=>void recognize()} disabled={busy}>{busy?'읽는 중…':'글자 추출하기'}</button></div>{busy&&<div className="ocr-progress" role="status" aria-live="polite"><div className="progress"><i style={{width:`${progress}%`}}/></div><span>{status} {progress}%</span></div>}</>}
    {extracted&&<div className="field"><label htmlFor="ocr-text">추출된 텍스트</label><textarea id="ocr-text" rows={12} value={extracted} onChange={event=>setExtracted(event.target.value)}/><small>정확하지 않을 수 있습니다. 원문 사진과 대조해 직접 수정해 주세요.{confidence!==null?` · 인식 신뢰도 ${confidence}%`:''}</small></div>}
    {extracted&&<button className="btn full" disabled={saving}>{saving?'저장하는 중…':'확인한 텍스트 저장'}</button>}
    {message&&<div className="notice" role="status">{message}</div>}
  </form>;
}
