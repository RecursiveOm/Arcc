'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Video } from '@/lib/api';
import Workspace from './workspace';
import Chat from './chat';
import Processing from './processing';
import { ErrorNotice } from './app-shell';
export default function VideoScreen({id,section}:{id:string;section:string}){const [video,setVideo]=useState<Video|null>(null),[error,setError]=useState('');const refresh=useCallback(async()=>{try{setVideo(await api<Video>(`/videos/${id}`));setError('');}catch(e){setError((e as Error).message);}},[id]);useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>;let previous='';async function load(){try{const status=await api<Video>(`/videos/${id}/status`);if(!active)return;const fingerprint=`${status.status}:${status.embedded}:${status.has_transcript}`;if(fingerprint!==previous){const full=await api<Video>(`/videos/${id}`);if(!active)return;setVideo(full);previous=fingerprint;}else setVideo(v=>v?{...v,...status}:v);setError('');if(['queued','processing'].includes(status.status))timer=setTimeout(load,3000);}catch(e){if(active)setError((e as Error).message);}}void load();return()=>{active=false;clearTimeout(timer);};},[id,video?.status]);
if(!video)return <div className="page">{error?<><ErrorNotice title="We couldn’t open this video." detail={error} retry={()=>void refresh()}/><Link className="button secondary" href="/library">Back to library</Link></>:<div className="page-loading" role="status"><div className="skeleton"/><p>Opening your video…</p></div>}</div>;
if(video.status!=='ready'&&(!section||section==='summary'))return <Processing video={video} onRefresh={()=>void refresh()}/>;
return <>{error&&<ErrorNotice detail={error} retry={()=>void refresh()}/>} {section==='chat'?<Chat key={id} video={video}/>:<Workspace video={video} section={section} onRefresh={()=>void refresh()}/>}</>;}
