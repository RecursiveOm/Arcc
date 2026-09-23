import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'ARC — Understand every moment.', description: 'A local-first workspace for video understanding.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{__html: `(function(){try{var t=localStorage.getItem('arc-theme')||'system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t}catch(e){}})()`}}/>{children}</body></html>;
}
