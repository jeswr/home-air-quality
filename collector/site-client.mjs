export function siteClient({siteUrl,siteBearer,collectorToken},fetchImpl=fetch) {
  const origin=new URL(siteUrl);
  if(origin.protocol!=='https:' || !origin.hostname.endsWith('.chatgpt.site') || origin.port || origin.username || origin.password || origin.pathname!=='/' || origin.search || origin.hash) throw new Error('Invalid private dashboard origin.');
  return async function call(path,data) {
    if(!path.startsWith('/api/'))throw new Error('Invalid dashboard endpoint.');
    const response=await fetchImpl(new URL(path,origin),{method:data===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(45000),
      headers:{'OAI-Sites-Authorization':`Bearer ${siteBearer}`,Authorization:`Bearer ${collectorToken}`,'Content-Type':'application/json'},
      body:data===undefined?undefined:JSON.stringify(data)});
    if(!response.ok)throw new Error(`Private dashboard returned HTTP ${response.status}.`);
    return response.json();
  };
}
