import type {Metadata,Viewport} from 'next';import '@fontsource/noto-sans-kr/korean-400.css';import '@fontsource/noto-sans-kr/korean-500.css';import '@fontsource/noto-sans-kr/korean-700.css';import '@fontsource/noto-sans-kr/korean-800.css';import './globals.css';import {PwaRegister} from '@/components/PwaRegister';
export const metadata:Metadata={title:'보호자노트',description:'가족이 함께 정리하는 입원 돌봄 노트',manifest:'/manifest.webmanifest'};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#137a68'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body><PwaRegister/>{children}</body></html>}
