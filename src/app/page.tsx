import Image from 'next/image';
import Link from 'next/link';
import {Shell} from '@/components/Shell';
import {Icon,IconName} from '@/components/Icon';
import {getAuthenticatedUser} from '@/lib/session';

const features = [
  {icon:'camera', title: '사진 글자 추출', description: '병원 안내문 사진에서 한글을 기기 안에서 읽고 직접 확인해요.'},
  {icon:'handoff', title: '가족 교대', description: '가족마다 필요한 권한만 나누고 돌봄 내용을 이어가요.'},
  {icon:'discharge', title: '퇴원 준비', description: '담당자와 D-Day별 할 일을 체크리스트로 관리해요.'},
  {icon:'expense', title: '비용 정산', description: '영수증과 가족별 분담 내역을 한곳에서 정리해요.'},
] satisfies Array<{icon:IconName,title:string,description:string}>;

export default async function Home() {
  const user=await getAuthenticatedUser();
  return (
    <Shell landing loggedIn={Boolean(user)}>
      <div className="page landing-page">
        <section className="hero hero-commercial">
          <div className="hero-copy">
            <span className="eyebrow">가족이 함께 쓰는 돌봄 노트</span>
            <h1>보호는 함께,<br />기록은 간단하게.</h1>
            <p>
              병원 안내문부터 가족의 일정·교대·비용까지. 꼭 필요한 돌봄 정보를
              놓치지 않도록 보호자노트가 곁에서 정리합니다.
            </p>
            <div className="hero-actions">
              {user?<><Link className="btn" href="/dashboard">{user.name}님의 돌봄방 계속하기</Link><Link className="btn secondary" href="/settings">내 설정</Link></>:<><Link className="btn" href="/signup">무료로 시작하기</Link><Link className="btn secondary" href="/login">기존 계정 로그인</Link></>}
            </div>
            <ul className="trust-list" aria-label="보호자노트의 주요 원칙">
              <li>민감정보 개별 동의</li>
              <li>가족별 권한 관리</li>
              <li>사진은 기기 안에서 처리</li>
            </ul>
          </div>

          <div className="hero-visual">
            <Image
              src="/guardian-hero.webp"
              alt="보호자와 부모가 함께 스마트폰의 돌봄 기록을 확인하는 모습"
              width={1200}
              height={896}
              priority
              sizes="(max-width: 760px) 100vw, 52vw"
            />
            <div className="visual-note" aria-hidden="true">
              <span>오늘의 돌봄</span>
              <strong>가족과 함께 확인했어요</strong>
            </div>
          </div>
        </section>

        <section className="feature-section" aria-labelledby="feature-title">
          <div className="section-heading">
            <span className="eyebrow">한곳에서 이어지는 돌봄</span>
            <h2 id="feature-title" className="section-title">복잡한 돌봄을 가볍게</h2>
            <p className="sub">보호자에게 꼭 필요한 기능만 알아보기 쉽게 모았습니다.</p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-number"><Icon name={feature.icon}/></span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="care-flow" aria-label="보호자노트 이용 흐름">
          <div><span><Icon name="camera"/></span><strong>안내문 글자 추출</strong><small>사진 전송 없이 기기에서</small></div>
          <i aria-hidden="true">→</i>
          <div><span><Icon name="family"/></span><strong>가족과 공유</strong><small>권한에 맞게 전달</small></div>
          <i aria-hidden="true">→</i>
          <div><span><Icon name="discharge"/></span><strong>돌봄 이어가기</strong><small>퇴원까지 놓침 없이</small></div>
        </section>

        <section className="landing-supplies"><span><Icon name="shopping" size={30}/></span><div><small>입원 전에 필요한 것만 가볍게</small><h2>병원 생활 준비물 가이드</h2><p>병원 제공품과 반입 규정을 확인한 뒤 생활용품을 골라 보세요.</p></div><Link className="btn secondary" href="/supplies">준비물 보기</Link></section>

        <section className="privacy-banner">
          <div>
            <span className="privacy-mark" aria-hidden="true">✓</span>
            <div>
              <strong>동의한 정보만, 필요한 가족에게만</strong>
              <p>건강정보는 별도 동의를 받은 경우에만 처리하고, 철회하면 공유를 즉시 중단합니다.</p>
            </div>
          </div>
          <Link href="/legal">개인정보 보호 원칙 보기</Link>
        </section>
      </div>
    </Shell>
  );
}
