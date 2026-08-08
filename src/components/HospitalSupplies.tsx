import {Icon,IconName} from '@/components/Icon';

const disclosure='이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

const supplies:Array<{title:string;description:string;tip:string;audience:string;icon:IconName;url:string}>=[
  {title:'실내화·슬리퍼',description:'병실과 공용 공간에서 신을 가벼운 실내화',tip:'낙상 위험이 있다면 슬리퍼 대신 의료진이 권하는 신발을 사용하세요.',audience:'환자·보호자',icon:'shopping',url:'https://link.coupang.com/a/f3bOcuutGu'},
  {title:'여행용 세면도구',description:'칫솔·치약·샴푸처럼 작은 용량의 기본 위생용품',tip:'병원에서 제공하는 품목을 먼저 확인하면 중복 구매를 줄일 수 있어요.',audience:'환자·보호자',icon:'sparkles',url:'https://link.coupang.com/a/f3bRavpQYK'},
  {title:'물티슈',description:'침상 주변과 보호자 자리를 간단히 정리할 때 쓰는 생활용품',tip:'상처나 의료기구에는 사용하지 말고 병원 감염관리 안내를 따라 주세요.',audience:'보호자 중심',icon:'shield',url:'https://link.coupang.com/a/f3bRoFT0zA'},
  {title:'수면안대·귀마개',description:'불빛과 생활 소음이 있는 보호자 대기 시간에 유용한 수면 보조용품',tip:'환자에게 사용할 때는 호출음과 의료진 안내를 놓치지 않도록 먼저 확인하세요.',audience:'보호자 중심',icon:'heart',url:'https://link.coupang.com/a/f3bRB6cfVA'},
  {title:'보호자 간이방석',description:'오래 앉아 기다릴 때 챙기기 좋은 작고 가벼운 방석',tip:'병실 통로를 막지 않는 크기인지 확인해 주세요.',audience:'보호자',icon:'home',url:'https://link.coupang.com/a/f3bRPF4BrM'},
  {title:'긴 충전 케이블',description:'침상과 콘센트 거리가 멀 때 유용한 휴대전화 충전 케이블',tip:'멀티탭과 전열기구는 병원별 전기안전 규정을 먼저 확인하세요.',audience:'환자·보호자',icon:'record',url:'https://link.coupang.com/a/f3bR3IVWvI'},
  {title:'정리 파우치',description:'서류·충전기·세면도구를 구분해 보관하는 작은 수납용품',tip:'환자 정보가 적힌 서류와 귀중품은 보이지 않게 따로 보관하세요.',audience:'환자·보호자',icon:'document',url:'https://link.coupang.com/a/f3bShPvYxE'},
];

export function HospitalSupplies(){
  return <div className="supplies-space">
    <section className="supplies-hero">
      <div><span className="eyebrow">보호자노트 준비물 가이드</span><h1>입원 생활,<br/>빠뜨리지 않게 준비해요</h1><p>병원에서 제공하는 물품을 먼저 확인하고, 정말 필요한 생활용품만 가볍게 챙겨 보세요.</p></div>
      <span className="supplies-hero-icon"><Icon name="shopping" size={56}/></span>
    </section>

    <div className="affiliate-disclosure" role="note"><Icon name="shield" size={20}/><p><strong>제휴 링크 안내</strong>{disclosure}</p></div>

    <section className="before-buying"><h2>구매 전에 먼저 확인해요</h2><div className="grid two"><div><b>1. 병원 제공품</b><span>환자복·세면도구·침구 제공 여부</span></div><div><b>2. 병동 반입 규정</b><span>전기용품·음식·개인 침구 허용 여부</span></div><div><b>3. 환자 안전</b><span>보행·낙상 위험과 의료진 안내</span></div><div><b>4. 배송 일정</b><span>입원일 전에 도착 가능한지 확인</span></div></div></section>

    <div className="section-heading supplies-heading"><span className="eyebrow">생활용품만 골랐어요</span><h2 className="section-title">입원 준비물 추천</h2><p className="sub">약·건강기능식품·의료기기는 추천하지 않습니다. 가격과 배송 조건은 쿠팡에서 최종 확인해 주세요.</p></div>
    <div className="supplies-grid">{supplies.map(item=><article className="supply-card" key={item.title}><div className="supply-card-top"><span className="supply-icon"><Icon name={item.icon}/></span><span className="pill">{item.audience}</span></div><h3>{item.title}</h3><p>{item.description}</p><small>{item.tip}</small><a className="btn secondary full" href={item.url} target="_blank" rel="sponsored noopener noreferrer" data-affiliate-category={item.title}>쿠팡에서 상품 확인</a></article>)}</div>

    <p className="affiliate-footer">{disclosure}<br/>구매 여부와 관계없이 보호자노트의 모든 기능은 무료입니다.</p>
  </div>;
}
