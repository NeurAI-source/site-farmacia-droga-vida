// A failed status read must not report a still-running background sync as failed.
export async function syncInventory({base,key,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,pollMs=3000,deadlineMs=210000}){
 const headers={'Content-Type':'application/json',apikey:key};
 if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
 const call=action=>fetcher(`${base}/functions/v1/trier-api`,{method:'POST',headers,body:JSON.stringify({action}),redirect:'error',signal:AbortSignal.timeout(action==='sync'?180000:10000)});
 const response=await call('sync');if(!response.ok)throw Error('sync_request_failed');
 let result=await response.json();if(result.status!=='started')return result;
 const runId=result.runId,deadline=now()+deadlineMs;
 while(now()<deadline){
  await sleep(pollMs);
  let response;
  try{response=await call('status');}catch{continue;}
  if([401,403].includes(response.status))throw Error('sync_status_unauthorized');
  if(!response.ok)continue;
  let state;try{state=await response.json();}catch{continue;}
  if(state.run_id!==runId)throw Error('sync_superseded');
  if(state.finished_at&&Date.parse(state.finished_at)>=Date.parse(state.started_at))return state.summary;
 }
 throw Error('sync_status_timeout');
}
