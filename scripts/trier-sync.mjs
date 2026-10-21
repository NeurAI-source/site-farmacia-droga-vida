const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw Error('Missing server configuration');
try {
  const headers = {'Content-Type':'application/json',apikey:key};
  if (!key.startsWith('sb_secret_')) headers.Authorization=`Bearer ${key}`;
  const response = await fetch(`${base}/functions/v1/trier-api`, {method:'POST',headers,body:JSON.stringify({action:'sync'}),signal:AbortSignal.timeout(180000)});
  if (!response.ok) { console.error(`Synchronization HTTP ${response.status}`); throw Error(); }
  let result = await response.json();
  if(result.status==='started') {
    const runId=result.runId, deadline=Date.now()+210000;
    while(Date.now()<deadline) {
      await new Promise(resolve=>setTimeout(resolve,3000));
      const statusResponse=await fetch(`${base}/functions/v1/trier-api`,{method:'POST',headers,body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(15000)});
      if(!statusResponse.ok)throw Error();
      const state=await statusResponse.json();
      if(state.run_id!==runId)throw Error();
      if(state.finished_at&&Date.parse(state.finished_at)>=Date.parse(state.started_at)){result=state.summary;break;}
    }
  }
  console.log(JSON.stringify({status:result.status,received:result.received,updated:result.updated,skipped:result.skipped,errors:result.errors,lastError:result.lastError}));
  if (!['completed','cached'].includes(result.status) || result.errors) process.exitCode=1;
} catch { console.error('Trier synchronization failed; previous inventory retained.'); process.exitCode=1; }
