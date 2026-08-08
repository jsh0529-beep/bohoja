'use client';
import {useState} from 'react';
import {AuthFrame} from '@/components/AuthVisual';
import {ActionForm} from '@/components/ActionForm';

export default function PasswordReset(){
  const [challenge,setChallenge]=useState<{email:string;code?:string}|null>(null);
  if(challenge)return <AuthFrame><h1>새 비밀번호 설정</h1>{challenge.code&&<div className="notice">개발용 재설정 코드: <b>{challenge.code}</b></div>}<ActionForm endpoint="/api/auth/password-reset/confirm" success="비밀번호를 변경했습니다" redirect="/login" submitLabel="비밀번호 변경"><input type="hidden" name="email" value={challenge.email}/><div className="field"><label htmlFor="reset-code">6자리 재설정 코드</label><input id="reset-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={challenge.code} required/></div><div className="field"><label htmlFor="new-password">새 비밀번호</label><input id="new-password" name="password" type="password" minLength={8} required autoComplete="new-password"/></div></ActionForm></AuthFrame>;
  return <AuthFrame><span className="eyebrow">계정 복구</span><h1>비밀번호 찾기</h1><p className="sub">가입한 이메일로 10분 동안 사용할 수 있는 재설정 코드를 보냅니다.</p><ActionForm endpoint="/api/auth/password-reset/request" success="재설정 코드를 발급했습니다" submitLabel="재설정 코드 받기" onSuccess={data=>{const result=data as {testCode?:string};const email=(document.querySelector<HTMLInputElement>('#reset-email')?.value??'').toLowerCase();setChallenge({email,code:result.testCode});}}><div className="field"><label htmlFor="reset-email">가입 이메일</label><input id="reset-email" name="email" type="email" required autoComplete="email" placeholder="name@example.com"/></div></ActionForm></AuthFrame>;
}
