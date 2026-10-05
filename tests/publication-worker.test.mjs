import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/cloud-catalog.mjs',import.meta.url));
const sample=JSON.parse(readFileSync(new URL('../catalog.json',import.meta.url)));
function run(action,body,publication='11111111-1111-4111-8111-111111111111'){
 const dir=mkdtempSync(join(tmpdir(),'neurai-worker-'));const mock=`import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,options)=>{appendFileSync('calls.jsonl',JSON.stringify({url,method:options.method,body:options.body})+'\\n');return new Response(JSON.stringify(${JSON.stringify(body)}),{status:200});};`;
 const result=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),script,action],{cwd:dir,encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://isolated.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-test',PUBLICATION_ID:publication,GITHUB_RUN_ID:'123',GITHUB_OUTPUT:join(dir,'output')}});
 return {result,dir,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('worker takes exact immutable snapshot and records completion with its own Actions run',()=>{
 for(const action of ['fetch','published','failed','dispatch-next']){const r=run(action,action==='fetch'?sample:null);try{assert.equal(r.result.status,0,r.result.stderr);const call=JSON.parse(readFileSync(join(r.dir,'calls.jsonl'),'utf8').trim());if(action==='fetch'){assert.deepEqual(JSON.parse(readFileSync(join(r.dir,'published-catalog.json'))),sample);assert.equal(JSON.parse(call.body).worker_run,'123');}if(['published','failed'].includes(action)){assert.equal(JSON.parse(call.body).result_status,action);assert.equal(JSON.parse(call.body).worker_run,'123');}}finally{r.cleanup();}}
});
test('duplicate worker exits successfully with skip output and cannot create a deployment snapshot',()=>{const r=run('fetch',null);try{assert.equal(r.result.status,0,r.result.stderr);assert.equal(readFileSync(join(r.dir,'output'),'utf8'),'skip=true\n');assert.throws(()=>readFileSync(join(r.dir,'published-catalog.json')));}finally{r.cleanup();}});
