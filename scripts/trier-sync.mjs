const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw Error('Missing server configuration');
try {
  const headers = {'Content-Type':'application/json',apikey:key};
  if (!key.startsWith('sb_secret_')) headers.Authorization=`Bearer ${key}`;
  const response = await fetch(`${base}/functions/v1/trier-api`, {method:'POST',headers,body:JSON.stringify({action:'sync'}),signal:AbortSignal.timeout(180000)});
  if (!response.ok) { console.error(`Synchronization HTTP ${response.status}`); throw Error(); }
  const result = await response.json();
  console.log(JSON.stringify({status:result.status,received:result.received,updated:result.updated,skipped:result.skipped,errors:result.errors,lastError:result.lastError}));
  if (!['completed','cached'].includes(result.status) || result.errors) process.exitCode=1;
} catch { console.error('Trier synchronization failed; previous inventory retained.'); process.exitCode=1; }
