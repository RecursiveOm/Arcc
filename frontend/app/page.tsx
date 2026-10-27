 'use client';
import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Link as LinkIcon, Loader2, ShieldCheck, Upload, FileText, ListVideo, MessageSquare, Network, Plus } from 'lucide-react';
import { api, type Video } from '@/lib/api';
import { ErrorNotice, useApp } from '@/components/app-shell';
import { VideoCard } from '@/components/library';
export default function Home(){
 const {videos,settings,error:loadError,refresh}=useApp();const router=useRouter();
 const [language,setLanguage]=useState('auto');
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[drag,setDrag]=useState(false);const upload=useRef<HTMLInputElement>(null);
 useEffect(()=>{const params=new URLSearchParams(location.search);const id=params.get('video');const view=params.get('view');if(id)router.replace(`/video/${encodeURIComponent(id)}`);else if(view==='library'||view==='settings')router.replace('/'+view);},[router]);
 async function ingest(kind:'url'|'file'){setBusy(true);setError('');try{let result:Video;if(kind==='url')result=await api<Video>('/videos/youtube',{method:'POST',body:JSON.stringify({url,language})});else{if(!file)throw new Error('Choose a video first.');const form=new FormData();form.append('file',file);form.append('language',language);result=await api<Video>('/videos/upload',{method:'POST',body:form});}void refresh();router.push(`/video/${result.id}`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function choose(f:File|undefined){if(!f)return;if(!/\.(mp4|mov|webm|mkv|mp3|wav|m4a)$/i.test(f.name)){setError('Choose an MP4, MOV, WebM, MKV, MP3, WAV or M4A file.');return;}if(f.size>(settings?.max_upload_mb||1024)*1024**2){setError('This file exceeds the upload size limit.');return;}setError('');setFile(f);}
 return <div className="page home-page">
  <header className="home-intro">
    <span className="workspace-badge"><Plus size={14}/>New analysis</span>
    <h1>Understand every moment.</h1>
    <p>Turn any video into a summary, timeline, transcript, and answers.<br className="desktop-break"/> Start with a YouTube link or a file.</p>
  </header>
  {(error||loadError)&&<ErrorNotice title="We couldn’t complete that request." detail={error||loadError} retry={()=>error?void ingest(file?'file':'url'):void refresh()}/>}
  <section className="ingest-card" aria-label="Analyze a video">
    <div className="language-picker"><label htmlFor="speech-language">Speech language</label><select id="speech-language" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}><option value="auto">Detect automatically</option><option value="en">English</option><option value="hi">Hindi · हिन्दी</option><option value="mr">Marathi · मराठी</option></select><span>Hindi and Marathi → English analysis, with the original transcript kept.</span></div>
    <div className="ingest-heading"><div className="ingest-label"><LinkIcon size={18}/><label htmlFor="youtube-url">Start with a YouTube link</label></div><span className="input-hint">Your next insight starts here</span></div>
    <form className="url-form" onSubmit={e=>{e.preventDefault();void ingest('url');}}>
      <input id="youtube-url" type="url" placeholder="https://youtube.com/watch?v=…" required value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/>
      <button className="button primary" disabled={busy||!url.trim()}>{busy?<><Loader2 size={17} className="spin"/>Starting…</>:<>Analyze<ArrowRight size={17}/></>}</button>
    </form>
    <div className="or-divider"><span/>or upload a file<span/></div>
    <div className={`upload-zone ${drag?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy)choose(e.dataTransfer.files[0]);}}>
      <input ref={upload} type="file" aria-label="Upload video file" accept=".mp4,.mov,.webm,.mkv,.mp3,.wav,.m4a" hidden onChange={e=>choose(e.target.files?.[0])}/>
      <div className="upload-icon"><Upload size={22} strokeWidth={1.7}/></div>
      <div className="upload-copy">{file?<><strong className="filename">{file.name}</strong><span>{(file.size/1024**2).toFixed(1)} MB · Ready to analyze</span></>:<><strong>{drag?'Drop your video to continue':'Drop a video here'}</strong><span>MP4 · MOV · WebM · MKV & audio · Up to {settings?.max_upload_mb||1024} MB</span></>}</div>
      {file?<div className="upload-actions"><button className="button primary" disabled={busy} onClick={()=>ingest('file')}>{busy?<Loader2 size={16} className="spin"/>:'Analyze file'}<ArrowRight size={15}/></button><button className="text-button" disabled={busy} onClick={()=>setFile(null)}>Remove</button></div>:<button className="button secondary" disabled={busy} onClick={()=>upload.current?.click()}>Choose a file</button>}
    </div>
    <div className="privacy-note"><ShieldCheck size={14}/><span>Files stay local. Transcript context is shared with your model provider.</span></div>
  </section>
  <section className="capability-grid" aria-label="What you can explore">{[{icon:FileText,title:'Summary',text:'Clear overview and key takeaways.'},{icon:ListVideo,title:'Timeline',text:'Jump to the moments that matter.'},{icon:MessageSquare,title:'Ask ARC',text:'Grounded answers with timestamps.'},{icon:Network,title:'Topic intelligence',text:'Discover themes with machine learning.'}].map(({icon:Icon,title,text})=><div className="capability" key={title}><Icon size={19} strokeWidth={1.7}/><h2>{title}</h2><p>{text}</p></div>)}</section>
  {videos.length>0&&<section className="recent-section"><div className="section-heading"><div><h2>Recent analyses</h2><p>Pick up where you left off.</p></div><Link href="/library">View library <ArrowRight size={16}/></Link></div><div className="recent-grid">{videos.slice(0,3).map(v=><VideoCard key={v.id} video={v}/>)}</div></section>}
  <footer className="page-footer"><span>ARC / Video intelligence</span><span>Understand every moment.</span></footer>
 </div>;
}
