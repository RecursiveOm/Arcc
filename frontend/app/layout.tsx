import type { Metadata } from 'next';
import './globals.css';
import localFont from 'next/font/local';
const geist = localFont({src:'./fonts/Geist.woff2',weight:'100 900',display:'swap',variable:'--font-geist'});
import { AppShell } from '@/components/app-shell';
export const metadata: Metadata = { title: 'ARC — Understand every moment.', description: 'A local-first workspace for video understanding.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={geist.variable} suppressHydrationWarning><body><script dangerouslySetInnerHTML={{__html: `(function(){try{var t=localStorage.getItem('arc-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){}})()`}}/><a className="skip-link" href="#main-content">Skip to content</a><AppShell>{children}</AppShell></body></html>;
}
