import { allowedOrigin } from '../cors.js';
import { config, TrierClient, InventoryService, publicStock } from './integration.js';
import { repository } from './repository.js';
const officialContract = null;
const policy = {priceUnit:'cents',isSellable:() => { throw Error('official_status_policy_pending'); }};
export function createHandler(db, env) { return async req => {
  const origin = allowedOrigin(env('SITE_ORIGINS') || env('SITE_ORIGIN'),req.headers.get('origin'));
  const headers = {'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type',...(origin ? {'Access-Control-Allow-Origin':origin} : {})};
  const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
  if (req.method==='OPTIONS') return reply({},origin ? 200 : 403);
  try {
    if (req.method==='GET') {
      const id = new URL(req.url).searchParams.get('productId');
      if (!id || !/^\d{1,15}$/.test(id)) return reply({error:'invalid_product_id'},400);
      // Only published products are public; never expose private draft inventory.
      const {data:publication,error:pubError} = await db.from('publications').select('catalog').eq('status','published').order('draft_version',{ascending:false}).limit(1).maybeSingle();
      if (pubError) throw pubError;
      const product = publication?.catalog?.products?.find((p) => String(p.id)===id && p.active);
      if (!product) return reply({error:'product_not_found'},404);
      const {data,error} = await db.from('trier_inventory').select('product_id,variant_id,stock_quantity,availability,external_price_cents,last_trier_sync_at').eq('product_id',id);
      if (error) throw error;
      return reply({inventory:(data || []).filter(row => row.last_trier_sync_at && (row.variant_id===0 || product.variants?.some((v)=>v.id===row.variant_id))).map(publicStock)});
    }
    if (req.method!=='POST') return reply({error:'method_not_allowed'},405);
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const internal = !!serviceKey && req.headers.get('authorization')===`Bearer ${serviceKey}`;
    if (!internal) {
      if (!origin) return reply({error:'origin_forbidden'},403);
      const token = req.headers.get('authorization')?.replace(/^Bearer /i,'') || '';
      const {data:{user},error} = await db.auth.getUser(token);
      if (error || !user) return reply({error:'unauthorized'},401);
      const {data:member} = await db.from('team_members').select('role').eq('user_id',user.id).eq('active',true).single();
      if (!member || !['admin','owner'].includes(member.role)) return reply({error:'forbidden'},403);
    }
    const raw = await req.text(); if (raw.length>1024) return reply({error:'request_too_large'},413);
    const body = JSON.parse(raw);
    if (body.action==='status') {
      const {data,error} = await db.from('trier_sync_state').select('started_at,finished_at,summary').eq('id',1).single();
      if (error) throw error;
      return reply({enabled:env('TRIER_INTEGRATION_ENABLED')==='true',contractReady:false,...data});
    }
    if (body.action!=='sync') return reply({error:'invalid_action'},400);
    const settings=config(env);
    const service = new InventoryService({settings,client:new TrierClient(settings,officialContract),repository:repository(db,settings.storeId),policy,log:(entry)=>console.log(JSON.stringify(entry))});
    return reply(await service.refresh({periodic:internal}));
  } catch { return reply({error:'trier_operation_failed'},503); }
}; }

