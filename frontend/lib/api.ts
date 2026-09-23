export type Segment = { start: number; end: number; text: string; original_text?: string };
export type Chunk = Segment & { chunk_id: number; cluster_id?: number };
export type Moment = { start: number; title: string; description?: string };
export type Section = { title: string; content: string };
export type Analysis = { overview: string; detailed_summary: Section[]; key_takeaways: string[]; study_notes: Section[]; chapters: Moment[]; important_moments: Moment[]; topics: string[]; entities: string[] };
export type ML = { num_clusters: number; silhouette_score: number | null; warning?: string; topics: {cluster_id: number; label: string | null; representative_chunk_ids: number[]}[]; points: {chunk_id: number; start: number; end: number; cluster_id: number; x: number; y: number}[] };
export type Video = { id: string; title: string; source_type: 'youtube' | 'upload'; youtube_id?: string; filename?: string; file_size?: number; duration: number | null; created_at: string; status: string; stage: string; error?: string; language?: string; thumbnail?: string; has_media: boolean; has_transcript?: boolean; embedded: number; transcript?: Segment[]; chunks?: Chunk[]; analysis?: Analysis; ml?: ML };
export type Message = { role: 'user' | 'assistant'; content: string; citations: Segment[] };
export type Settings = { deepseek_configured: boolean; deepseek_model: string; whisper_model: string; ffmpeg_available: boolean; max_upload_mb: number };
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, { ...options, headers: { ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options?.headers } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail.map((d: {msg: string})=>d.msg).join(' ') : 'ARC could not reach the local backend. Check that it is running.');
  }
  return res.json();
}
export function time(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60).toString().padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
export function parseTime(value: string): number | null {
  if (!/^\d+(?::[0-5]\d){0,2}$/.test(value.trim())) return null;
  return value.trim().split(':').reduce((total,part)=>total*60+Number(part),0);
}
