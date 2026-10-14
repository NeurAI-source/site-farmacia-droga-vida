// Remove cached copies of retired public administrative URLs only.
// https://developers.cloudflare.com/api/resources/cache/methods/purge/
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw Error('Cloudflare maintenance connection unavailable.');
const response = await fetch('https://api.cloudflare.com/client/v4/zones/fad6d273615be038d710b491f209eee6/purge_cache', {
  method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({prefixes:['drogavidapopular.com.br/admin','www.drogavidapopular.com.br/admin']})
});
let result; try { result = await response.json(); } catch {}
if (!response.ok || result?.success !== true) {
  console.error(`Cache maintenance rejected (HTTP ${response.status}). No credentials logged.`);
  process.exitCode=1;
} else console.log('Retired administrative cache purge accepted; verify the live URLs separately.');
