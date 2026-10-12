import { env } from 'cloudflare:workers';
import { CloudHistory } from '../../../lib/history.mjs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request: Request) {
  const path=new URL(request.url).pathname;
  // The owner-private Sites boundary authenticates dashboard visitors and service requests.
  // A separate writer secret prevents browser clients from reading/updating the session.
  if (path.startsWith('/api/collector')) {
    const secret=(env as unknown as Record<string,string>).COLLECTOR_TOKEN;
    if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return json({error:'Unauthorized'},401);
  }
  if (!env.DB) return json({error:'History storage is unavailable.'},503);
  const history=new CloudHistory(env.DB);
  try {
    if (request.method==='GET') {
      if(path==='/api/readings') return json(await history.state('latest') || {connected:false,monitors:[],message:'Cloud collection is starting.'});
      if(path==='/api/history/status') return json(await history.status());
      if(path==='/api/history') return json(await history.query(Object.fromEntries(new URL(request.url).searchParams)));
      if(path==='/api/collector/session') return json(await history.state('session'));
      if(['/api/history.csv','/api/history/attempts.csv','/api/history/capabilities.csv'].includes(path)) {
        const kind=path.includes('attempts')?'attempts':path.includes('capabilities')?'capabilities':'measurements';
        return new Response(history.csv(kind),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="air-quality-${kind}.csv"`,'Cache-Control':'no-store'}});
      }
    }
    if(request.method==='POST' && path.startsWith('/api/collector')) {
      const text=await request.text();if(text.length>512000)return json({error:'Batch too large.'},413);
      const data=JSON.parse(text);
      if(path==='/api/collector/session') {
        if(data?.version!==1 || !/^[A-Za-z0-9+/=]+$/.test(data.nonce) || !/^[A-Za-z0-9+/=]+$/.test(data.ciphertext) || data.ciphertext.length>250000) return json({error:'Invalid encrypted session.'},400);
        await env.DB.batch([history.setState('session',data)]);return json({saved:true});
      }
      if(path==='/api/collector/import') {await history.import(data.kind,data.rows);return json({saved:true});}
      if(path==='/api/collector') return json({added:await history.record(data)});
    }
    return json({error:'Not found.'},404);
  } catch(error) {
    return json({error:error instanceof RangeError || error instanceof SyntaxError?'Invalid request.':'Cloud operation failed.'},error instanceof RangeError || error instanceof SyntaxError?400:503);
  }
}
export const GET=handle;
export const POST=handle;
