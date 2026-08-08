'use client';

import Script from 'next/script';
import {useRef} from 'react';

declare global{
  interface Window{adsbygoogle?:Array<Record<string,unknown>>}
}

export function PublicAdSlot(){
  const client=process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slot=process.env.NEXT_PUBLIC_ADSENSE_SLOT;
  const requested=useRef(false);
  if(!client||!slot)return null;
  const requestAd=()=>{
    if(requested.current)return;
    requested.current=true;
    try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch{requested.current=false;}
  };
  return <section className="public-ad" aria-label="광고">
    <span>광고</span>
    <Script id="guardian-adsense" async strategy="lazyOnload" crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`} onLoad={requestAd} onReady={requestAd}/>
    <ins className="adsbygoogle" style={{display:'block'}} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true"/>
  </section>;
}
