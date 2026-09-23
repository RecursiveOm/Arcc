'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, FileVideo, Layers3, Library, Link as LinkIcon, Loader2, Menu, MessageSquare, Monitor, Moon, Plus, Search, Settings as SettingsIcon, ShieldCheck, Sun, Trash2, Upload, X } from 'lucide-react';
import { api, Video, Settings, time } from '@/lib/api';
import Workspace from '@/components/workspace';

type View = 'new' | 'library' | 'settings' | 'video';
export default function Home() {
  const [view,setView]=useState<View>('new');
  const [videos,setVideos]=useState<Video[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [video,setVideo]=useState<Video|null>(null);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [theme,setTheme]=useState('system');
  const [drawer,setDrawer]=useState(false);
  const [error,setError]=useState('');
  const [url,setUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [filter,setFilter]=useState('');
  const [drag,setDrag]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async()=>{
    try { const [list,config]=await Promise.all([api<Video[]>('/videos'),api<Settings>('/settings')]);setVideos(list);setSettings(config); }
    catch(e){setError((e as Error).message);}
  },[]);
  useEffect(()=>{
    // Hydrate browser-only preferences/navigation and fetch the initial local library once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const saved=localStorage.getItem('arc-theme')||'system';setTheme(saved);
    const sync=()=>{
      const params=new URLSearchParams(location.search),id=params.get('video');
      setSelected(id);setView(id?'video':params.get('view')==='library'?'library':params.get('view')==='settings'?'settings':'new');
    };
    sync();window.addEventListener('popstate',sync);
    const timer=setInterval(()=>void refresh(),5000);
    return ()=>{clearInterval(timer);window.removeEventListener('popstate',sync);};
  },[refresh]);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{document.documentElement.dataset.theme=theme==='system'?(media.matches?'dark':'light'):theme;};
    apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);
  },[theme]);
  useEffect(()=>{
    if(!selected) return;
    let active=true;
    let previous='';
    const load=async()=>{
      try {
        const status=await api<Video>(`/videos/${selected}/status`);
        const fingerprint=`${status.status}:${status.embedded}:${status.has_transcript}`;
        if(fingerprint!==previous) {
          const full=await api<Video>(`/videos/${selected}`);
          if(active){setVideo(full);previous=fingerprint;}
        } else if(active) setVideo(current=>current?.id===selected?{...current,...status}:current);
      } catch(e){if(active)setError((e as Error).message);}
    };
    void load();const timer=setInterval(()=>void load(),3500);
    return()=>{active=false;clearInterval(timer);};
  },[selected]);
  function navigate(next:View,id:string|null=null) {setView(next);setSelected(id);setDrawer(false);setError('');history.pushState({},'',id?`/?video=${id}`:next==='new'?'/':`/?view=${next}`);}
  async function ingest(kind:'url'|'file') {
    setBusy(true);setError('');
    try {
      let result:Video;
      if(kind==='url') result=await api<Video>('/videos/youtube',{method:'POST',body:JSON.stringify({url})});
      else {if(!file)throw new Error('Choose a video first.');const form=new FormData();form.append('file',file);result=await api<Video>('/videos/upload',{method:'POST',body:form});}
      await refresh();navigate('video',result.id);setFile(null);setUrl('');
    } catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function choose(f:File|undefined) {
    if(!f) return;
    if(!/\.(mp4|mov|webm|mkv|mp3|wav|m4a)$/i.test(f.name)){setError('Choose an MP4, MOV, WebM, MKV, MP3, WAV or M4A file.');return;}
    if(f.size>(settings?.max_upload_mb||1024)*1024**2){setError('This file exceeds the upload size limit.');return;}
    setError('');setFile(f);
  }
  async function remove(v:Video) {
    if(!confirm(`Delete “${v.title}” and its saved analysis?`))return;
    try{await api(`/videos/${v.id}`,{method:'DELETE'});await refresh();if(selected===v.id)navigate('library');}catch(e){setError((e as Error).message);}
  }
  const themeButtons=<div className="theme-control" aria-label="Theme">{[{value:'light',icon:Sun},{value:'dark',icon:Moon},{value:'system',icon:Monitor}].map(({value,icon:Icon})=><button key={value} title={`${value[0].toUpperCase()+value.slice(1)} theme`} aria-label={`${value} theme`} aria-pressed={theme===value} className={theme===value?'selected':''} onClick={()=>{localStorage.setItem('arc-theme',value);setTheme(value);}}><Icon size={16}/></button>)}</div>;
  return <div className="app-shell">{drawer&&<button className="drawer-shade" aria-label="Close navigation" onClick={()=>setDrawer(false)}/>}<aside className={`sidebar ${drawer?'open':''}`}><button className="brand" onClick={()=>navigate('new')} aria-label="ARC home"><ArcMark/><span>ARC</span></button><div className="sidebar-main"><button className={`new-button ${view==='new'?'active':''}`} onClick={()=>navigate('new')}><Plus size={18}/>New video<span>+</span></button><button className={`nav-item ${view==='library'?'active':''}`} onClick={()=>navigate('library')}><Library size={18}/>Your library<span>{videos.length.toString().padStart(2,'0')}</span></button><div className="sidebar-label">RECENT</div><div className="recent-list">{videos.slice(0,7).map(v=><button className={`recent-item ${selected===v.id?'active':''}`} key={v.id} onClick={()=>navigate('video',v.id)}><FileVideo size={15}/><span>{v.title}</span>{['processing','queued'].includes(v.status)&&<Loader2 size={12} className="spin"/>}</button>)}{!videos.length&&<p className="recent-empty">Your next discovery<br/>starts with a video.</p>}</div></div><div className="sidebar-bottom"><div className="local-note"><span className="green-dot"/>Local workspace<ShieldCheck size={14}/></div><button className={`nav-item ${view==='settings'?'active':''}`} onClick={()=>navigate('settings')}><SettingsIcon size={17}/>Settings</button>{themeButtons}<div className="sidebar-caption">A little more understanding.</div></div></aside>
    <div className="main-shell"><header className="topbar"><div><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setDrawer(true)}><Menu size={20}/></button><span>Workspace</span><ChevronRight size={13}/><strong>{view==='new'?'New video':view==='library'?'Your library':view==='settings'?'Settings':'Video intelligence'}</strong></div><span className="topbar-note"><span className="green-dot"/>Made for your curiosity</span></header><main>{error&&<div className="global-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      {view==='new'&&<div className="new-page"><div className="intro"><div className="intro-kicker"><span className="short-line"/> A CLEARER WAY TO WATCH</div><h1>Understand<br/><em>every moment.</em></h1><p>Turn a video into something you can explore.<br/>The big ideas, the small details, and everything in between.</p></div><div className="ingest-card"><div className="ingest-label"><LinkIcon size={17}/><label htmlFor="youtube-url">Start with a YouTube link</label></div><form className="url-form" onSubmit={e=>{e.preventDefault();void ingest('url');}}><input id="youtube-url" type="url" placeholder="Paste a YouTube URL…" required value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/><button className="button primary" disabled={busy||!url.trim()}>{busy?<Loader2 size={16} className="spin"/>:<>Analyze<ArrowRight size={16}/></>}</button></form><div className="or-divider"><span/>or bring your own<span/></div><div className={`upload-zone ${drag?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy)choose(e.dataTransfer.files[0]);}}><input ref={upload} type="file" aria-label="Upload video file" accept=".mp4,.mov,.webm,.mkv,.mp3,.wav,.m4a" hidden onChange={e=>choose(e.target.files?.[0])}/><div className="upload-icon"><Upload size={21} strokeWidth={1.5}/></div>{file?<><strong className="filename">{file.name}</strong><span>{(file.size/1024**2).toFixed(1)} MB · Ready to analyze</span><div className="upload-actions"><button className="button primary" disabled={busy} onClick={()=>ingest('file')}>{busy?<Loader2 size={16} className="spin"/>:'Analyze file'}<ArrowRight size={15}/></button><button className="text-button" disabled={busy} onClick={()=>setFile(null)}>Remove</button></div></>:<><button className="upload-link" disabled={busy} onClick={()=>upload.current?.click()}>Choose a video <span>or drag it here</span></button><span>MP4, MOV, WebM, MKV & audio · up to {settings?.max_upload_mb||1024} MB</span></>}</div><div className="privacy-note"><ShieldCheck size={13}/>Files stay on your device. Only transcript excerpts go to OpenRouter.</div></div><div className="capabilities">{[{icon:BookOpen,title:'See the big picture',text:'Clear summaries, without the rewatch.'},{icon:Layers3,title:'Find your moment',text:'Chapters and a searchable transcript.'},{icon:MessageSquare,title:'Follow your curiosity',text:'Ask questions. Get cited answers.'}].map(({icon:Icon,title,text})=><div key={title}><Icon size={19} strokeWidth={1.5}/><h3>{title}</h3><p>{text}</p></div>)}</div><footer className="new-footer"><span>LESS SCRUBBING. MORE UNDERSTANDING.</span><span>ARC / 01</span></footer></div>}
      {view==='library'&&<div className="library-page"><div className="page-heading"><div><div className="eyebrow">A PLACE FOR YOUR CURIOSITY</div><h1>Your library</h1><p className="muted">Every video. Every insight. Right where you left it.</p></div><button className="button primary" onClick={()=>navigate('new')}><Plus size={16}/>New video</button></div><div className="library-toolbar"><span>{videos.length} {videos.length===1?'video':'videos'}</span><div className="library-search"><Search size={16}/><input aria-label="Search library" placeholder="Search your library…" value={filter} onChange={e=>setFilter(e.target.value)}/></div></div><div className="library-grid">{videos.filter(v=>v.title.toLowerCase().includes(filter.toLowerCase())).map(v=><article className="library-card" key={v.id}><button className="video-cover" onClick={()=>navigate('video',v.id)} aria-label={`Open ${v.title}`}>{v.thumbnail?<div className="thumbnail" style={{backgroundImage:`url(${JSON.stringify(v.thumbnail)})`}}/>:<div className="cover-art"><ArcMark/><span>{v.source_type==='youtube'?'YOUTUBE':'LOCAL VIDEO'}</span></div>}<span className="duration">{v.duration?time(v.duration):'—'}</span><span className="cover-arrow"><ArrowUpRight size={19}/></span></button><div className="library-card-body"><div className="video-meta"><span>{new Date(v.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span className={`status-dot ${v.status}`}>{v.status}</span></div><button className="card-title" onClick={()=>navigate('video',v.id)}>{v.title}</button><div className="card-bottom"><span>{v.source_type==='youtube'?'YouTube':'Uploaded file'}</span><button className="icon-button" aria-label={`Delete ${v.title}`} disabled={['processing','queued'].includes(v.status)} onClick={()=>remove(v)}><Trash2 size={14}/></button></div></div></article>)}</div>{!videos.length&&<div className="library-empty"><Library size={35} strokeWidth={1.2}/><h2>A fresh page.</h2><p>Your first video is the beginning of your library.</p><button className="button primary" onClick={()=>navigate('new')}>Analyze a video<ArrowRight size={16}/></button></div>}</div>}
      {view==='settings'&&<div className="settings-page"><div className="eyebrow">YOUR WORKSPACE, YOUR WAY</div><h1>Settings</h1><section className="settings-section"><h2>Appearance</h2><p>Choose a quieter light or a softer dark. System follows your device.</p>{themeButtons}</section><section className="settings-section"><h2>OpenRouter</h2><span className={`config-status ${settings?.deepseek_configured?'configured':''}`}>{settings?.deepseek_configured?<Check size={15}/>:<SettingsIcon size={15}/>} {settings?.deepseek_configured?'API key configured':'API key needed for summaries and chat'}</span><p>Add your key to <code>backend/.env</code> as <code>OPENROUTER_API_KEY=…</code>, then restart the backend. Your key is never sent to the browser.</p><div className="setting-row"><span>Model</span><code>{settings?.deepseek_model||'openrouter/free'}</code></div></section><section className="settings-section"><h2>Local processing</h2><div className="setting-row"><span>Whisper model</span><code>{settings?.whisper_model||'small'}</code></div><div className="setting-row"><span>FFmpeg</span><span>{settings?.ffmpeg_available?'Available':'Not found'}</span></div><p>Set <code>WHISPER_MODEL</code> in <code>backend/.env</code> to change speech recognition. Model weights download once on first use. CPU works; no GPU required.</p></section><section className="settings-section"><h2>A note on privacy</h2><p>Videos, transcripts, embeddings, and chat history are stored locally. OpenRouter receives transcript excerpts and summary context for analysis and answers. YouTube playback connects to YouTube.</p></section></div>}
      {view==='video'&&(video?.id===selected?<Workspace key={video.id} video={video} onRefresh={()=>{if(selected)void api<Video>(`/videos/${selected}`).then(setVideo);void refresh();}}/>:<div className="loading-workspace"><Loader2 className="spin"/>Opening your video…</div>)}
    </main></div></div>;
}
function ArcMark() {return <svg width="29" height="29" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 26L16 5L27 26M9.5 19.5H22.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 26H19" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/></svg>;}
