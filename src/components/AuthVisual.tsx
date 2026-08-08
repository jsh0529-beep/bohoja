import Image from 'next/image';
import {Icon} from '@/components/Icon';
import {Shell} from '@/components/Shell';

export function AuthVisual(){return <aside className="auth-visual">
  <Image src="/care-family-illustration.webp" alt="가족이 영상통화로 돌봄 기록을 함께 정리하는 모습" width={1000} height={1000} sizes="(max-width: 760px) 100vw, 440px"/>
  <div className="auth-visual-copy"><span><Icon name="shield" size={17}/> 안전한 가족 돌봄 공간</span><strong>멀리 있어도 돌봄은 이어집니다</strong></div>
</aside>}

export function AuthFrame({children}:{children:React.ReactNode}){return <Shell auth><div className="auth-layout"><AuthVisual/><section className="auth-form page">{children}</section></div></Shell>}
