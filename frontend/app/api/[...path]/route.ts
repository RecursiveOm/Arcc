import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Stream uploads and media through a same-origin endpoint without buffering them.
async function proxy(request: NextRequest, context: {params: Promise<{path:string[]}>}) {
  const {path}=await context.params;
  const headers=new Headers();
  for(const name of ['content-type','range','if-range','origin']) {
    const value=request.headers.get(name);if(value)headers.set(name,value);
  }
  const init: RequestInit & {duplex?: 'half'}={method:request.method,headers,signal:request.signal,cache:'no-store'};
  if(!['GET','HEAD'].includes(request.method)){init.body=request.body;init.duplex='half';}
  try {
    const response=await fetch(`http://127.0.0.1:8000/api/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,init);
    const output=new Headers(response.headers);
    output.delete('content-encoding');output.delete('transfer-encoding');
    return new Response(response.body,{status:response.status,headers:output});
  } catch {
    return Response.json({detail:'ARC could not reach the local backend. Start the backend on port 8000.'},{status:502});
  }
}
export {proxy as GET,proxy as POST,proxy as DELETE,proxy as HEAD};
