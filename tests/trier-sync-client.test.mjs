import test from 'node:test';import assert from 'node:assert/strict';
import {syncInventory} from '../scripts/trier-sync-client.mjs';
const started={status:'started',runId:'lease'},done={run_id:'lease',started_at:'2026-10-22T14:00:00Z',finished_at:'2026-10-22T14:00:30Z',summary:{status:'completed',updated:196,errors:0}};
function setup(replies){let time=0;const calls=[];return {calls,options:{base:'https://example.invalid',key:'sb_secret_TEST_ONLY',now:()=>time,deadlineMs:30,pollMs:5,sleep:async ms=>{time+=ms;},fetcher:async(_,options)=>{calls.push(JSON.parse(options.body).action);const value=replies.shift();if(value instanceof Error)throw value;return value instanceof Response?value:Response.json(value||{run_id:'lease'});}}};}
test('status network errors and 503 retry only the status read, never apply the sync again',async()=>{const {options,calls}=setup([started,Error('network'),new Response('',{status:503}),{...done,finished_at:null},done]);assert.deepEqual(await syncInventory(options),done.summary);assert.deepEqual(calls,['sync','status','status','status','status']);});
test('unauthorized, superseded and timeout are explicit; cached does not poll',async()=>{
 for(const [reply,message]of[[new Response('',{status:403}),'sync_status_unauthorized'],[{run_id:'other'},'sync_superseded']]){const s=setup([started,reply]);await assert.rejects(()=>syncInventory(s.options),new RegExp(message));assert.deepEqual(s.calls,['sync','status']);}
 const timed=setup([started]);await assert.rejects(()=>syncInventory(timed.options),/sync_status_timeout/);assert.equal(timed.calls.filter(x=>x==='sync').length,1);
 const cached=setup([{status:'cached'}]);assert.deepEqual(await syncInventory(cached.options),{status:'cached'});assert.deepEqual(cached.calls,['sync']);
});
