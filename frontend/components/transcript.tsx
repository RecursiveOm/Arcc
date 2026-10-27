'use client';

import { useState } from 'react';
import { api, time, type Segment, type Video } from '@/lib/api';
import { ErrorNotice } from './app-shell';

export function Transcript({video,seek,onRefresh}:{video:Video;seek:(start:number)=>void;onRefresh:()=>void}) {
  const [view,setView]=useState<'english'|'original'|'both'>('english');
  const [search,setSearch]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const segments=video.transcript||[];
  const source=video.language==='mr'?'Marathi':video.language==='hi'?'Hindi':video.language?.toUpperCase()||'Original';
  const bilingual=['hi','mr'].includes(video.language||'');
  const pending=bilingual&&segments.some(s=>s.translation_language!=='en');
  function original(s:Segment){return s.original_text??s.text;}
  function english(s:Segment){return bilingual&&s.translation_language!=='en'?'':s.text;}
  const visible=segments.filter(s=>[...(view!=='english'?[original(s)]:[]),...(view!=='original'?[english(s)]:[])].some(text=>text.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  async function translate(){setBusy(true);setError('');try{await api(`/videos/${video.id}/translate`,{method:'POST'});onRefresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function download(){
    const text=segments.map(s=>`[${time(s.start)} – ${time(s.end)}]\n`+(view==='original'?original(s):view==='both'?`${english(s)||'[English translation pending]'}\n${original(s)}`:english(s)||'[English translation pending]')).join('\n\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`arc-${video.id}-${view}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(!segments.length)return <p className="muted">Your timestamped transcript will appear here.</p>;
  return <section aria-label="Video transcript">
    {error&&<ErrorNotice detail={error}/>}
    <div className="content-toolbar transcript-controls">
      {bilingual?<div className="segmented" role="group" aria-label="Transcript language">{(['english','original','both'] as const).map(value=><button key={value} className={view===value?'selected':''} aria-pressed={view===value} onClick={()=>setView(value)}>{value==='english'?'English':value==='original'?`Original (${source})`:'Both'}</button>)}</div>:<span className="eyebrow">{segments.length} TIMESTAMPED SEGMENTS</span>}
      <button className="button secondary" onClick={download}>Download transcript</button>
    </div>
    {bilingual&&<p className="muted">{source} speech · English for analysis · original timestamps preserved.</p>}
    {pending&&<div className="translation-notice"><p>English translation is not complete. The original {source} transcript is saved. Summaries and Q&A will use English after translation and indexing finish.</p>{!['queued','processing'].includes(video.status)&&<button className="button secondary" disabled={busy} onClick={translate}>{busy?'Starting…':'Translate to English'}</button>}</div>}
    <div className="content-toolbar"><input className="search-input" aria-label="Search transcript" placeholder="Find in the selected transcript…" value={search} onChange={e=>setSearch(e.target.value)}/><span className="eyebrow">{visible.length} SEGMENTS</span></div>
    {!visible.length&&<p className="muted">No matching passages. Try a different word.{bilingual&&' You can also switch transcript language.'}</p>}
    <div className="transcript">{visible.map(s=><div key={`${s.start}:${s.end}`}><button className="timestamp" onClick={()=>seek(s.start)}>{time(s.start)}</button><div className="transcript-wording">{view!=='original'&&<p lang={bilingual?'en':video.language}>{english(s)||'English translation pending.'}</p>}{view!=='english'&&<p lang={video.language} className={view==='both'?'original-speech':undefined}>{original(s)}</p>}</div></div>)}</div>
  </section>;
}
