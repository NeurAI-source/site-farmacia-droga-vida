import {syncInventory} from './trier-sync-client.mjs';
const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw Error('Missing server configuration');
try{
 const result=await syncInventory({base,key});
 console.log(JSON.stringify({status:result.status,received:result.received,updated:result.updated,skipped:result.skipped,errors:result.errors,lastError:result.lastError}));
 if(!['completed','cached'].includes(result.status)||result.errors)process.exitCode=1;
}catch{console.error('Trier synchronization could not be confirmed; inspect the saved status before retrying.');process.exitCode=1;}
