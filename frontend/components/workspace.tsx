'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpen, Check, ChevronRight, Clock3, Copy, Loader2, MessageSquare, RotateCcw, ScanLine, Sparkles } from 'lucide-react';
import { api, Video, Message, time, parseTime, Section } from '@/lib/api';
import { Player, PlayerHandle } from './player';

function Sections({items}:{items:Section[]}) {return <>{items.map((s,i)=><section className="text-section" key={i}><h3>{s.title}</h3><p>{s.content}</p></section>)}</>;}
export default function Workspace({video,onRefresh}:{video:Video;onRefresh:()=>void}) {
  const [tab,setTab]=useState('Summary');
  const [mode,setMode]=useState('Quick');
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [range,setRange]=useState(false);
  const [search,setSearch]=useState('');
  const [copied,setCopied]=useState(false);
  const player=useRef<PlayerHandle>(null);
  const messageList=useRef<HTMLDivElement>(null);
  useEffect(()=>{let active=true;api<Message[]>(`/videos/${video.id}/chat`).then(m=>{if(active)setMessages(m);}).catch((e:Error)=>{if(active)setError(e.message);});return()=>{active=false;};},[video.id]);
  useEffect(()=>{const list=messageList.current;list?.scrollTo({top:list.scrollHeight,behavior:'smooth'});},[messages,busy]);
  function seek(n:number) {player.current?.seek(n);}
  async function send(value=question) {
    if(busy || !value.trim()) return;
    const a=range?parseTime(start):null,b=range?parseTime(end):null;
    if(range&&(a===null||b===null||a>=b)) {setError('Enter a valid range, such as 02:30 → 05:00.');return;}
    setBusy(true);setError('');
    try {
      const reply=await api<Message>(`/videos/${video.id}/chat`,{method:'POST',body:JSON.stringify({question:value,start:a,end:b})});
      setMessages(m=>[...m,{role:'user',content:value,citations:[]},reply]);setQuestion('');
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function retry() {try {await api(`/videos/${video.id}/retry`,{method:'POST'});onRefresh();}catch(e){setError((e as Error).message);}}
  const analysis=video.analysis;
  const ml=video.ml;
  const processing=['queued','processing'].includes(video.status);
  const tabs=['Summary','Timeline','Transcript','Study Notes','Topic Map'];
  return <div className="workspace">
    <div className="workspace-heading"><div><div className="eyebrow">YOUR VIDEO, UNDERSTOOD</div><h1>{video.title}</h1><div className="video-meta"><span>{video.source_type==='youtube'?'YouTube':'Uploaded video'}</span><span>·</span><span>{video.duration?time(video.duration):'Duration pending'}</span>{video.language&&<><span>·</span><span>{video.language.toUpperCase()}</span></>}<span className={`status-dot ${video.status}`}>{video.status}</span></div></div></div>
    {video.status!=='ready'&&<div className={`processing-banner ${video.status==='failed'?'failure':''}`} role="status">{processing?<Loader2 size={19} className="spin"/>:<Clock3 size={19}/>}<div><strong>{video.stage}</strong><p>{video.error || 'Processing locally. You can leave this page; your progress is saved.'}</p></div>{video.status==='failed'&&<button className="button secondary" onClick={retry}><RotateCcw size={15}/>Retry</button>}</div>}
    <div className="workspace-grid"><div className="video-column"><Player key={`${video.id}-${video.has_media}`} ref={player} video={video}/><div className="video-foot"><span><ScanLine size={14}/> Every insight leads back to a moment.</span><span>{video.chunks?.length||0} indexed sections</span></div>
      <div className="intelligence"><div className="tabs" role="tablist" aria-label="Video intelligence">{tabs.map(t=><button role="tab" aria-selected={tab===t} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
        <div className="tab-content" role="tabpanel">
          {tab==='Summary'&&(analysis?<><div className="content-toolbar"><div className="segmented">{['Quick','Detailed'].map(m=><button className={mode===m?'selected':''} key={m} onClick={()=>setMode(m)}>{m}</button>)}</div><button className="icon-button" title="Copy summary" onClick={()=>{navigator.clipboard.writeText(analysis.overview).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>setError('Clipboard access was denied.'));}}>{copied?<Check size={16}/>:<Copy size={16}/>}</button></div><div className="eyebrow">THE BIG PICTURE</div><p className="overview">{analysis.overview}</p>{mode==='Detailed'&&<Sections items={analysis.detailed_summary}/>}<h3 className="subheading">Key takeaways</h3><ul className="takeaways">{analysis.key_takeaways.map((t,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span><p>{t}</p></li>)}</ul>{analysis.important_moments.length>0&&<><h3 className="subheading">Worth revisiting</h3>{analysis.important_moments.map((m,i)=><button key={i} className="moment-row" onClick={()=>seek(m.start)}><span className="timestamp">{time(m.start)}</span><span>{m.title}</span><ChevronRight size={15}/></button>)}</>}<div className="tag-list">{analysis.topics.map((t,i)=><span key={i}>{t}</span>)}</div>{analysis.entities.length>0&&<p className="muted terms">Terms & entities: {analysis.entities.join(' · ')}</p>}</>:<Empty text="Your summary will appear after analysis. Local transcript progress is saved if the LLM provider is unavailable."/>)}
          {tab==='Timeline'&&(analysis?<><div className="eyebrow">FOLLOW THE CONVERSATION</div><h2>A chapter for every turn.</h2><div className="timeline">{analysis.chapters.map((m,i)=><button key={i} onClick={()=>seek(m.start)}><span className="timeline-index">{String(i+1).padStart(2,'0')}</span><div><h3>{m.title}</h3><p>{m.description}</p></div><span className="timestamp">{time(m.start)}</span></button>)}</div></>:<Empty text="Chapters will appear after analysis."/>)}
          {tab==='Transcript'&&(video.transcript?.length?<><div className="content-toolbar"><span className="eyebrow">{video.transcript.length} TIMESTAMPED SEGMENTS</span><input className="search-input" aria-label="Search transcript" placeholder="Find in transcript…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="transcript">{video.transcript.filter(s=>s.text.toLowerCase().includes(search.toLowerCase())).map((s,i)=><div key={i}><button className="timestamp" onClick={()=>seek(s.start)}>{time(s.start)}</button><p>{s.text}</p></div>)}</div></>:<Empty text="Your timestamped transcript will appear here."/>)}
          {tab==='Study Notes'&&(analysis?<><div className="eyebrow">MAKE IT STICK</div><h2>A little structure. A deeper understanding.</h2><Sections items={analysis.study_notes}/></>:<Empty text="Study notes will appear after analysis."/>)}
          {tab==='Topic Map'&&(ml?.points.length?<><div className="eyebrow">MACHINE LEARNING · K-MEANS + PCA</div><h2>The shape of this conversation.</h2><p className="muted">{ml.num_clusters} semantic {ml.num_clusters===1?'group':'groups'}{ml.silhouette_score!==null?` · Silhouette score ${ml.silhouette_score.toFixed(3)}`:' · Too few distinct sections for silhouette selection'}. Select a point to revisit its moment. Nearby points suggest related content; this is not a timeline.</p><TopicMap video={video} seek={seek}/><div className="topic-legend">{ml.topics.map(t=><span key={t.cluster_id}><i style={{background:colors[t.cluster_id%colors.length]}}/>{t.label||`Topic ${t.cluster_id+1}`}</span>)}</div></>:<Empty text={ml?.warning||'Topics are discovered locally after embeddings are created.'}/>)}
        </div></div></div>
      <aside className="chat-panel"><div className="chat-header"><div className="chat-mark"><Sparkles size={18}/></div><div><h2>Ask ARC</h2><p>A conversation with your video</p></div><span className="local-badge">GROUNDED</span></div><div className="chat-messages" ref={messageList} aria-live="polite">{!messages.length&&<div className="chat-empty"><MessageSquare size={28} strokeWidth={1.3}/><h3>There’s more to discover.</h3><p>Explore an idea, find a detail, or make sense of a difficult concept.</p>{['What is this video about?','What are the main arguments?','Explain the most difficult concept.'].map(q=><button disabled={!video.embedded||busy} key={q} onClick={()=>send(q)}>{q}<ChevronRight size={14}/></button>)}</div>}{messages.map((m,i)=><div key={i} className={`message ${m.role}`}><div className="message-label">{m.role==='user'?'YOU':'ARC'}</div><p>{m.content}</p>{m.citations?.length>0&&<div className="citations">{m.citations.map((c,j)=><button className="timestamp" title={c.text} key={j} onClick={()=>seek(c.start)}><Clock3 size={12}/>{time(c.start)}</button>)}</div>}</div>)}{busy&&<div className="thinking"><Loader2 size={15} className="spin"/>Finding the relevant moments…</div>}</div><div className="chat-composer">{error&&<p className="inline-error" role="alert">{error}</p>}<button className={`range-toggle ${range?'active':''}`} onClick={()=>setRange(!range)}><ScanLine size={14}/>{range?'Focus on a section':'Ask about a specific section'}<span>{range?'−':'+'}</span></button>{range&&<div className="range-inputs"><input aria-label="Range start" placeholder="00:00" value={start} onChange={e=>setStart(e.target.value)}/><span>→</span><input aria-label="Range end" placeholder={time(video.duration||0)} value={end} onChange={e=>setEnd(e.target.value)}/></div>}<form onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="Ask ARC" placeholder={video.embedded?'What would you like to understand?':'Waiting for the transcript…'} value={question} onChange={e=>setQuestion(e.target.value)} disabled={!video.embedded} rows={3} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}}/><button className="send-button" aria-label="Send question" disabled={!video.embedded||busy||!question.trim()}><ArrowUp size={19}/></button></form><p className="chat-disclaimer">Answers grounded in this video. Check the source moments.</p></div></aside>
    </div>
  </div>;
}
const colors=['#768d62','#c78b62','#739ca6','#a28aaa','#b3a354','#8588b6','#b87781','#6eaaa0'];
function TopicMap({video,seek}:{video:Video;seek:(n:number)=>void}) {
  const points=video.ml!.points;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return <svg className="topic-map" viewBox="0 0 600 300" role="group" aria-label="Interactive topic map"><path d="M30 150H570M300 20V280" className="map-axis"/>{points.map(p=><g key={p.chunk_id} role="button" tabIndex={0} aria-label={`Seek ${time(p.start)}, topic ${p.cluster_id+1}`} onClick={()=>seek(p.start)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();seek(p.start);}}}><title>{time(p.start)} · {video.ml!.topics.find(t=>t.cluster_id===p.cluster_id)?.label||'Topic'}: {video.chunks?.find(c=>c.chunk_id===p.chunk_id)?.text.slice(0,150)}</title><circle cx={maxX===minX?300:35+(p.x-minX)/(maxX-minX)*530} cy={maxY===minY?150:30+(p.y-minY)/(maxY-minY)*240} r="8" fill={colors[p.cluster_id%colors.length]}/></g>)}</svg>;
}
function Empty({text}:{text:string}) {return <div className="content-empty"><BookOpen size={26} strokeWidth={1.3}/><p>{text}</p></div>;}
