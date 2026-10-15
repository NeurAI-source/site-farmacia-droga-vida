import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogChanges,runProgress,publicationHistory} from '../supabase/functions/admin-api/publication-history.js';
const id='11111111-1111-4111-8111-111111111111';
const env=k=>({GITHUB_REPOSITORY:'test/repo',GITHUB_DEPLOY_TOKEN:'server-test'})[k]||'';
function db(result){return {from(table){assert.equal(table,'publications');const q={select(){return q;},eq(){return q;},in(){return q;},lt(){return q;},order(){return q;},range(){return q;},limit(){return q;},single(){return q;},then(resolve){return Promise.resolve({data:result.shift(),error:null}).then(resolve);}};return q;}};}
test('percent follows completed stages and never reaches 100 before confirmed deployment',()=>{
 const steps=[{name:'Build',status:'completed',conclusion:'success'},{name:'Publicar no Cloudflare Pages',status:'in_progress'},{name:'Confirmar publicação',status:'queued'}];
 assert.equal(runProgress({status:'in_progress'},[{steps}]).percent,31);
 assert.equal(runProgress({status:'in_progress'},[{steps:[{name:'Build',status:'completed',conclusion:'success'}]}]).percent,95);
 assert.equal(runProgress({status:'completed',conclusion:'success'},[{steps:[]}]).status,'skipped');
 assert.equal(runProgress({status:'completed',conclusion:'failure'},[{steps:[]}]).percent,null);
 assert.equal(runProgress({status:'completed',conclusion:'failure'},[{steps:[{name:'Publicar no Cloudflare Pages',conclusion:'success'}]}]).percent,100);
});
test('catalog comparison covers additions, removal, prices, sizes, settings and ignores edit timestamps',()=>{
 const before={products:[{id:1,name:'A',priceCents:100,updatedAt:'old',variants:[{size:'P',priceCents:90}]},{id:2,name:'B'}],expandedProductPage:false,categories:[]};
 const after={products:[{id:1,name:'A',priceCents:200,updatedAt:'new',variants:[{size:'P',priceCents:190}]},{id:3,name:'C'}],expandedProductPage:true,categories:[]};
 const result=catalogChanges(before,after);assert.equal(result.changes.length,5);assert.equal(result.changes.find(c=>c.field==='Preço').money,true);assert.ok(result.changes.some(c=>c.after==='Removido'));assert.ok(!result.changes.some(c=>c.field==='updatedAt'));
 assert.equal(catalogChanges(null,after).baselineAvailable,false);
});
test('history survives GitHub outage and never substitutes fake progress',async()=>{
 const result=await publicationHistory({body:{action:'publication-history'},db:db([[{id,status:'building',run_id:'123'}],[]]),env,fetcher:async()=>{throw Error('offline');}});
 assert.equal(result.items[0].percent,null);assert.match(result.warning,/Não foi possível/);assert.equal(result.items[0].progressAvailable,false);
});
test('run id joins one catalogue record, includes source updates and keeps secrets server-side',async()=>{
 const rows=[{id,status:'building',run_id:'123',created_at:'2026-10-15T12:00:00Z'}];let requests=0;
 const result=await publicationHistory({body:{action:'publication-history'},db:db([rows,rows]),env,fetcher:async(url,options)=>{requests++;assert.equal(options.headers.Authorization,'Bearer server-test');return {ok:true,json:async()=>url.includes('/jobs?')?{jobs:[{steps:[{name:'Build',status:'completed'},{name:'Deploy',status:'in_progress'}]}]}:{total_count:2,workflow_runs:[{id:123,status:'in_progress',created_at:'2026-10-15T12:00:00Z'},{id:124,status:'queued',created_at:'2026-10-15T12:01:00Z',head_commit:{message:'Update'}}]}};}});
 assert.equal(result.items.length,2);assert.equal(result.items.find(i=>i.id===id).percent,47);assert.equal(requests,3);assert.ok(!JSON.stringify(result).includes('server-test'));
});
test('snapshot detail compares against last published version, not current mutable draft',async()=>{
 const result=await publicationHistory({body:{action:'publication-detail',id},db:db([{id,status:'published',draft_version:4,catalog:{products:[{id:1,name:'A',priceCents:200}]}},[{draft_version:2,catalog:{products:[{id:1,name:'A',priceCents:100}]}}]]),env});
 assert.equal(result.baselineVersion,2);assert.equal(result.changes[0].before,100);assert.equal(result.catalog.products[0].priceCents,200);
});
test('invalid identifiers and page ranges cannot construct external requests',async()=>{
 for(const body of [{action:'publication-detail',id:'github:../../secrets'},{action:'publication-detail',id:'<script>'},{action:'publication-history',offset:-1},{action:'publication-history',offset:0.5}])await assert.rejects(publicationHistory({body,db:db([]),env,fetcher:()=>{throw Error('must not fetch');}}),/inválid/);
 const source=readFileSync(new URL('../supabase/functions/admin-api/index.ts',import.meta.url),'utf8');assert.ok(source.indexOf('await panelQuota')<source.indexOf("['publication-history'"));
});
test('code details reject unrelated workflows and expose only comparison metadata',async()=>{
 await assert.rejects(publicationHistory({body:{action:'publication-detail',id:'github:123'},db:db([]),env,fetcher:async()=>({ok:true,json:async()=>({path:'.github/workflows/backup.yml'})})}),/inválida/);
 let n=0;const payloads=[{id:123,path:'.github/workflows/publish.yml',status:'completed',conclusion:'success',created_at:'2026-10-15',head_sha:'a'.repeat(40)},{jobs:[{steps:[{name:'Publicar no Cloudflare Pages',conclusion:'success'}]}]},{workflow_runs:[{id:122,created_at:'2026-10-14',head_sha:'b'.repeat(40)}]},{files:[{filename:'admin/session.js',status:'modified',additions:2,deletions:4,patch:'do not expose source'}]}];
 const result=await publicationHistory({body:{action:'publication-detail',id:'github:123'},db:db([]),env,fetcher:async()=>({ok:true,json:async()=>payloads[n++]})});assert.equal(result.publication.percent,100);assert.equal(result.files[0].name,'admin/session.js');assert.ok(!JSON.stringify(result).includes('do not expose source'));
});
