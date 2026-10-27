import { notFound } from 'next/navigation';
import VideoScreen from '@/components/video-screen';
export default async function VideoPage({params}:{params:Promise<{id:string;section?:string[]}>}){const {id,section}=await params;const view=section?.[0]||'';if((section?.length||0)>1||!['','summary','timeline','transcript','topics','notes','chat'].includes(view))notFound();return <VideoScreen key={id} id={id} section={view}/>;}
