import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchNext,reconcilePublication,neuraiAction,requestPublication} from '../supabase/functions/admin-api/publication.js';
const env=k=>({GITHUB_DEPLOY_TOKEN:'server-only-test',GITHUB_REPOSITORY:'test/repo'})[k]||'';
test('audit identity comes from verified Auth user, never browser input',async()=>{
 let captured;
 await neuraiAction({body:{action:'price-batch',batchId:'b',version:1,rows:[],autoPublish:false,actor_email:'spoof@test.invalid',actor_id:'spoof'},user:{id:'verified-user',email:'verified@test.invalid'},env,db:{rpc:async(name,args)=>{captured={name,args};return {data:{id:'b',publication_id:null}};}}});
 assert.equal(captured.name,'neurai_save_batch');assert.equal(captured.args.actor_id,'verified-user');assert.equal(captured.args.actor_email,'verified@test.invalid');
});
function fakeDb(){const updates=[],calls=[];let job={id:'job-1'},active=[],publication={id:'job-1',status:'queued'};return {updates,calls,setJob:v=>job=v,setActive:v=>active=v,setPublication:v=>publication=v,rpc:async(name,args)=>{calls.push({name,args});return {data:name==='catalog_dispatch_claim'?job:name==='catalog_request_publication'?'job-1':{id:'batch-1',publication_id:'job-1'},error:null};},from(){const query={update(v){updates.push(v);return query;},select(){return query;},in(){return query;},order(){return query;},limit(){return query;},eq(){return query;},single:async()=>({data:publication,error:null}),then(resolve){return Promise.resolve({data:active,error:null}).then(resolve);}};return query;}};}
test('empty queue does not claim that another publication is running',async()=>{
 const db=fakeDb();db.setJob(null);let sent=0;
 const idle=await dispatchNext(db,env,async()=>{sent++;});
 assert.equal(idle.state,'idle');assert.equal(idle.publication,null);assert.match(idle.notice,/Nenhuma publicação em andamento/);assert.equal(sent,0);
 for(const status of ['queued','pending','building']){db.setActive([{id:'active-1',status}]);const result=await dispatchNext(db,env,async()=>{sent++;});assert.equal(result.state,status);assert.equal(result.publication.id,'active-1');}
 assert.equal(sent,0);
});
test('publishing an already published version reports completion without dispatching or changing prices',async()=>{
 const db=fakeDb();db.setPublication({id:'job-1',status:'published',draft_version:164});let sent=0;
 const result=await requestPublication(db,env,'verified-admin',164,async()=>{sent++;});
 assert.equal(result.id,'job-1');assert.equal(result.state,'published');assert.match(result.notice,/já está publicada/);assert.equal(sent,0);assert.equal(db.updates.length,0);
 assert.deepEqual(db.calls,[{name:'catalog_request_publication',args:{actor_id:'verified-admin',expected_version:164}}]);
});
test('manual publishing dispatches a queued snapshot once and propagates conflicts without dispatch',async()=>{
 const db=fakeDb();let sent=0;
 const result=await requestPublication(db,env,'verified-admin',2,async()=>{sent++;return {ok:true};});
 assert.equal(result.id,'job-1');assert.equal(sent,1);assert.equal(db.updates[0].dispatch_state,'accepted');
 await assert.rejects(()=>requestPublication({rpc:async()=>({error:{message:'O catálogo mudou.'}})},env,'verified-admin',1,async()=>{sent++;}),/catálogo mudou/);assert.equal(sent,1);
});
test('recovering a saved batch whose snapshot was published never reapplies prices or redispatches',async()=>{
 const db=fakeDb();db.setPublication({id:'job-1',status:'published'});let sent=0;
 const result=await neuraiAction({body:{action:'price-batch',batchId:'b',version:1,rows:[],autoPublish:true},user:{id:'verified-user'},db,env,fetcher:async()=>{sent++;}});
 assert.equal(result.batch.id,'batch-1');assert.equal(result.state,'published');assert.equal(sent,0);assert.equal(db.calls.length,1);assert.equal(db.updates.length,0);
});
test('dispatch uses one ID and server-side token; accepted does not mean published',async()=>{const db=fakeDb();let count=0;const result=await dispatchNext(db,env,async(url,init)=>{count++;assert.match(url,/workflows\/publish.yml\/dispatches$/);assert.equal(JSON.parse(init.body).inputs.publication_id,'job-1');assert.equal(init.headers.Authorization,'Bearer server-only-test');return {ok:true};});assert.equal(count,1);assert.match(result.notice,/Aguardando/);assert.equal(db.updates[0].dispatch_state,'accepted');assert.ok(!db.updates.some(u=>u.status==='published'));});
test('running publication prevents duplicate dispatch and missing credentials retain queued prices',async()=>{const db=fakeDb();db.setJob(null);let requests=0;await dispatchNext(db,env,async()=>{requests++;});assert.equal(requests,0);await dispatchNext(db,()=>'',async()=>{requests++;});assert.equal(requests,0);});
test('connection loss and server errors preserve uncertain delivery; definitive GitHub rejection fails only publication',async()=>{for(const failure of ['offline',500,403]){const db=fakeDb();await dispatchNext(db,env,async()=>{if(failure==='offline')throw Error('offline');return {ok:false,status:failure};});assert.equal(db.updates.at(-1).dispatch_state,failure===403?'rejected':'uncertain');assert.equal(db.updates.at(-1).status,failure===403?'failed':undefined);assert.ok(!db.calls.some(c=>c.name==='neurai_save_batch'));}});
test('Actions reconciliation checks deployment result instead of confusing callback failure with deployment failure',async()=>{for(const deployed of [true,false]){const db=fakeDb();await reconcilePublication(db,env,{id:'job-1',run_id:'123',status:'building'},async url=>({ok:true,json:async()=>url.endsWith('/123')?{status:'completed',conclusion:'failure'}:{jobs:[{steps:[{name:'Implantar no GitHub Pages',conclusion:deployed?'success':'failure'}]}]}}));assert.equal(db.calls[0].name,'catalog_publication_finish');assert.equal(db.calls[0].args.result_status,deployed?'published':'failed');}});
test('validation error never calls GitHub; saved batch is returned even if dispatch lookup fails',async()=>{let sent=0;const request={body:{action:'price-batch',batchId:'b',version:1,rows:[],autoPublish:true},user:{id:'actor'},env,fetcher:async()=>{sent++;}};await assert.rejects(()=>neuraiAction({...request,db:{rpc:async()=>({error:{message:'Preço inválido'}})}}),/Preço inválido/);assert.equal(sent,0);const result=await neuraiAction({...request,db:{rpc:async name=>name==='neurai_save_batch'?{data:{id:'b',publication_id:'p',changes:[]}}:{error:{message:'offline'}}}});assert.equal(result.batch.id,'b');assert.match(result.notice,/salvos/);assert.equal(sent,0);});
