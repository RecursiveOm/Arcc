'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Video } from '@/lib/api';

type YTPlayer = { seekTo: (seconds:number, allowSeekAhead:boolean)=>void; playVideo: ()=>void; destroy: ()=>void };
type YTApi = { Player: new (element: HTMLElement, options: { videoId: string; width: string; height: string; playerVars: Record<string,number|string>; events: {onReady: ()=>void; onError: ()=>void} })=>YTPlayer };
declare global { interface Window { YT?: YTApi; onYouTubeIframeAPIReady?: ()=>void } }
let ready: Promise<void> | undefined;
function youtubeReady() {
  if (window.YT?.Player) return Promise.resolve();
  if (!ready) ready = new Promise<void>((resolve,reject)=>{
    window.onYouTubeIframeAPIReady=resolve;
    const script=document.createElement('script');
    script.src='https://www.youtube.com/iframe_api';
    script.onerror=()=>{ ready=undefined; reject(new Error('YouTube player could not load.')); };
    document.head.appendChild(script);
  });
  return ready;
}
export type PlayerHandle = { seek: (seconds: number)=>void };
export const Player=forwardRef<PlayerHandle,{video:Video}>(function Player({video},ref) {
  const native=useRef<HTMLVideoElement>(null);
  const host=useRef<HTMLDivElement>(null);
  const yt=useRef<YTPlayer|null>(null);
  const loaded=useRef(false);
  const pending=useRef<number|null>(null);
  const [error,setError]=useState('');
  useImperativeHandle(ref,()=>({seek(seconds) {
    if (video.source_type==='youtube') {
      if (loaded.current && yt.current) { yt.current.seekTo(seconds,true); yt.current.playVideo(); }
      else pending.current=seconds;
    } else if(native.current) { native.current.currentTime=seconds; void native.current.play().catch(()=>{}); }
  }}),[video.source_type]);
  useEffect(()=>{
    if(!video.youtube_id) return;
    let cancelled=false;
    void youtubeReady().then(()=>{
      if(cancelled || !host.current || !window.YT) return;
      const target=document.createElement('div'); host.current.replaceChildren(target);
      yt.current=new window.YT.Player(target,{videoId:video.youtube_id!,width:'100%',height:'100%',playerVars:{origin:window.location.origin,playsinline:1,rel:0},events:{
        onReady:()=>{loaded.current=true; if(pending.current!==null) {yt.current?.seekTo(pending.current,true);yt.current?.playVideo();pending.current=null;}},
        onError:()=>setError('YouTube playback is unavailable here. You can still explore the saved transcript.')
      }});
    }).catch((e:Error)=>{if(!cancelled)setError(e.message);});
    return ()=>{cancelled=true;loaded.current=false;yt.current?.destroy();yt.current=null;};
  },[video.youtube_id]);
  return <div className="player-wrap">{video.source_type==='youtube'?<div ref={host} className="youtube-player"/>:video.has_media?<video ref={native} controls preload="metadata" src={`/api/videos/${video.id}/media`} onError={()=>setError('Playback is unavailable while this file is being prepared.')} />:<div className="player-placeholder">Your video will appear here after ingestion.</div>}{error&&<div className="player-error" role="status">{error}</div>}</div>;
});
