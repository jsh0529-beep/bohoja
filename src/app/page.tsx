import Image from 'next/image';
import Link from 'next/link';
import {Shell} from '@/components/Shell';

const features = [
  {number: '01', title: '문서 AI 정리', description: '병원 안내문의 일정과 준비물을 원문과 함께 확인해요.'},
  {number: '02', title: '가족 교대', description: '가족마다 필요한 권한만 나누고 돌봄 내용을 이어가요.'},
  {number: '03', title: '퇴원 준비', description: '담당자와 D-Day별 할 일을 체크리스트로 관리해요.'},
  {number: '04', title: '비용 정산', description: '영수증과 가족별 분담 내역을 한곳에서 정리해요.'},
];

export default function Home() {
  return (
    <Shell landing>
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
              <Link className="btn" href="/signup">무료로 시작하기</Link>
              <Link className="btn secondary" href="/login">기존 계정 로그인</Link>
            </div>
            <ul className="trust-list" aria-label="보호자노트의 주요 원칙">
              <li>민감정보 개별 동의</li>
              <li>가족별 권한 관리</li>
              <li>AI 결과 원문 확인</li>
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
              <article className="feature-card" key={feature.number}>
                <span className="feature-number">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

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
