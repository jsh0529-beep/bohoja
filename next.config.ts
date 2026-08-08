import type { NextConfig } from "next";
const development=process.env.NODE_ENV!=="production";
const adsenseEnabled=Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT&&process.env.NEXT_PUBLIC_ADSENSE_SLOT);
const adScript=adsenseEnabled?' https://*.googlesyndication.com https://*.google.com':'';
const adMedia=adsenseEnabled?' https://*.googlesyndication.com https://*.doubleclick.net https://*.googleusercontent.com':'';
const csp=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'",`img-src 'self' data: blob:${adMedia}`,"font-src 'self' data:","style-src 'self' 'unsafe-inline'",`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${development?" 'unsafe-eval'":""}${adScript}`,`connect-src 'self'${adScript}`,`frame-src 'self'${adMedia}`,"worker-src 'self' blob:","upgrade-insecure-requests"].join('; ');
const nextConfig: NextConfig = {
  reactStrictMode:true,
  allowedDevOrigins:["127.0.0.1"],
  async headers(){return [
    {source:'/:path*',headers:[
      {key:'Content-Security-Policy',value:csp},
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=(), payment=()'},
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
      {key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'},
    ]},
    {source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]},
  ]},
};
export default nextConfig;
