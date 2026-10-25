import { buildRegistration } from '../../../registration-utils.js';
import { validateCatalog } from '../_shared/catalog-validation.js';
const check=r=>{if(r.error)throw Error('Não foi possível salvar. O catálogo pode ter mudado; recarregue e revise.');return r.data;};
export const registrationActions=['registration-commit','registration-result','registration-inventory'];
export async function registrationAction({body,db,user}) {
  if(body.action==='registration-inventory')return {inventory:check(await db.from('trier_inventory').select('product_id,variant_id,last_trier_sync_at,external_price_cents,external_regular_price_cents,availability').eq('store_id','2'))};
  if(typeof body.batchId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.batchId))throw Error('Lote inválido.');
  const existing=check(await db.from('registration_batches').select('actor_id,request,version,report').eq('id',body.batchId).maybeSingle());
  if(body.action==='registration-result'){
    if(existing&&existing.actor_id!==user.id)throw Error('Lote de outro usuário.');
    return existing?{version:existing.version,report:existing.report,completed:true}:{completed:false};
  }
  if(existing){
    const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
    if(existing.actor_id!==user.id||canonical(existing.request)!==canonical(body))throw Error('Identificador de lote já utilizado.');
    return {version:existing.version,report:existing.report,completed:true};
  }
  if(!Array.isArray(body.choices)||body.choices.length<1||body.choices.length>30||!Number.isSafeInteger(body.version)||typeof body.previewId!=='string')throw Error('Revise até 30 itens por lote.');
  const cache=check(await db.from('trier_registration_cache').select('actor_id,payload,expires_at').eq('key',body.previewId).maybeSingle());
  if(!cache||cache.actor_id!==user.id||Date.parse(cache.expires_at)<Date.now())throw Error('Prévia vencida. Consulte a Trier e revise novamente.');
  const draft=check(await db.from('catalog_draft').select('catalog,version').eq('id',1).single());
  if(draft.version!==body.version)throw Error('O catálogo mudou. Recarregue e revise antes de importar.');
  const result=buildRegistration(draft.catalog,cache.payload.rows,body.choices);validateCatalog(result.catalog);
  return check(await db.rpc('registration_save',{actor_id:user.id,batch_id:body.batchId,expected_version:body.version,payload:result.catalog,request_body:body,report_rows:result.report}));
}
