import { allowedOrigin } from '../cors.js';
import { config, TrierClient, InventoryService, publicStock } from './integration.js';
import { repository } from './repository.js';
import { verifiedServerRequest } from './server-auth.js';
import { readJson, verifiedSession, panelQuota, RequestLimitError } from '../security.js';
import { createOfficialContract, officialPolicy as policy } from './official-contract.js';
export function createHandler(db, env, {background} = {}) { return async req => {
  const origin = allowedOrigin(env('SITE_ORIGINS') || env('SITE_ORIGIN'),req.headers.get('origin'));
  const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type',...(origin ? {'Access-Control-Allow-Origin':origin} : {})};
  const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
  if (req.method==='OPTIONS') return reply({},origin ? 200 : 403);
  try {
    if (req.method==='GET') {
      const query = new URL(req.url).searchParams;
      const bulk = query.get('action') === 'inventory';
      const id = bulk ? '1' : query.get('productId');
      if (!id || !/^\d{1,15}$/.test(id)) return reply({error:'invalid_product_id'},400);
      // Only published products are public; never expose private draft inventory.
      const {data:publication,error:pubError} = await db.from('publications').select('catalog').eq('status','published').order('draft_version',{ascending:false}).limit(1).maybeSingle();
      if (pubError) throw pubError;
      if (bulk) {
        const products = publication?.catalog?.products?.filter(p => p.active) || [];
        if (!products.length) return reply({inventory:[]});
        const {data,error} = await db.from('trier_inventory').select('product_id,variant_id,trier_reduced_code,stock_quantity,availability,external_price_cents,external_regular_price_cents,last_trier_sync_at').eq('store_id',env('TRIER_STORE_ID')).in('product_id',products.map(p=>p.id));
        if(error) throw error;
        const rows=(data||[]).filter(row=>row.last_trier_sync_at && products.some(p=>p.id===row.product_id && String(Number((row.variant_id?p.variants?.find(v=>v.id===row.variant_id)?.shortCode:p.shortCode)||''))===String(Number(row.trier_reduced_code))));
        return reply({inventory:rows.map(publicStock)});
      }
      const product = publication?.catalog?.products?.find((p) => String(p.id)===id && p.active);
      if (!product) return reply({error:'product_not_found'},404);
      const {data,error} = await db.from('trier_inventory').select('product_id,variant_id,stock_quantity,availability,external_price_cents,external_regular_price_cents,last_trier_sync_at').eq('product_id',id).eq('store_id',env('TRIER_STORE_ID'));
      if (error) throw error;
      return reply({inventory:(data || []).filter(row => row.last_trier_sync_at && (row.variant_id===0 || product.variants?.some((v)=>v.id===row.variant_id))).map(publicStock)});
    }
    if (req.method!=='POST') return reply({error:'method_not_allowed'},405);
    const internal = await verifiedServerRequest(req.headers, env);
    if (!internal) {
      if (!origin) return reply({error:'origin_forbidden'},403);
      const token = req.headers.get('authorization')?.replace(/^Bearer /i,'') || '';
      const {data:{user},error} = await db.auth.getUser(token);
      if (error || !user) return reply({error:'unauthorized'},401);
      if (!await verifiedSession(db,token,user)) return reply({error:'invalid_session',code:'invalid_session'},403);
      const {data:member} = await db.from('team_members').select('role').eq('user_id',user.id).eq('active',true).single();
      if (!member || !['admin','owner'].includes(member.role)) return reply({error:'forbidden'},403);
      await panelQuota(db,user.id);
    }
    const body = await readJson(req,1024);
    if (body.action==='status') {
      const {data,error} = await db.from('trier_sync_state').select('run_id,started_at,finished_at,lease_until,summary').eq('id',1).single();
      if (error) throw error;
      return reply({enabled:env('TRIER_INTEGRATION_ENABLED')==='true',contractReady:!!env('TRIER_API_TOKEN'),...data});
    }
    if (body.action!=='sync') return reply({error:'invalid_action'},400);
    const settings=config(env);
    if(!settings.enabled || (internal && !settings.syncEnabled)) return reply({status:'disabled'});
    let codes=[];
    if(settings.enabled) {
      const linked=await db.rpc('trier_refresh_bindings',{integrated_store:settings.storeId});
      if(linked.error) throw linked.error;
      const {data,error}=await db.from('trier_inventory').select('trier_reduced_code').eq('store_id',settings.storeId);
      if(error) throw error;
      codes=(data||[]).map(row=>row.trier_reduced_code).filter(Boolean);
    }
    const officialContract=createOfficialContract(codes,env('TRIER_DELIVERY_PRODUCT_CODE')||'46295');
    const repo=repository(db,settings.storeId);
    if(background) {
      const lease=await repo.claim(settings.intervalMinutes);
      if(!lease) return reply({status:'cached'});
      const service=new InventoryService({settings,client:new TrierClient(settings,officialContract),repository:{...repo,claim:async()=>lease},policy,log:entry=>console.log(JSON.stringify(entry))});
      background(service.refresh({periodic:internal}).catch(()=>console.error('trier_background_sync_failed')));
      return reply({status:'started',runId:lease},202);
    }
    const service = new InventoryService({settings,client:new TrierClient(settings,officialContract),repository:repo,policy,log:(entry)=>console.log(JSON.stringify(entry))});
    return reply(await service.refresh({periodic:internal}));
  } catch (error) { return reply({error:error instanceof RequestLimitError ? error.message : 'trier_operation_failed'},error instanceof RequestLimitError ? error.status : 503); }
}; }

