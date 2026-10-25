import { config, TrierClient, moneyToCents } from './integration.js';
import { createOfficialContract } from './official-contract.js';
const checked=r=>{if(r.error)throw Error('registration_storage_unavailable');return r.data;};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const clean=(s,n=200)=>typeof s==='string'?s.slice(0,n):'';
export function registrationDTO(p,storeId,fetchedAt) {
  if(!Number.isSafeInteger(p.codigo)||p.codigo<1||typeof p.ativo!=='boolean'||typeof p.nome!=='string')throw Error('unexpected_product_schema');
  const stock=p.quantidadeEstoqueEcommerce??p.quantidadeEstoque;
  if(!Number.isSafeInteger(stock)||Math.abs(stock)>100000000)throw Error('unexpected_product_stock');
  let priceCents=null;try{priceCents=moneyToCents(p.valorVendaEcommerce??p.valorVenda,'decimal');}catch{}
  return {shortCode:String(p.codigo),externalId:clean(p.idProduto,128)||String(p.codigo),ean:/^\d{8,14}$/.test(String(p.codigoBarras))?String(p.codigoBarras):'',name:clean(p.nomeEcommerce||p.nome,120),description:clean(p.descricaoEcommerce,2400),priceCents,regularPriceCents:null,stockQuantity:stock,active:p.ativo,storeId,fetchedAt,
    laboratory:clean(p.nomeLaboratorio),group:clean(p.nomeGrupo),providerCategory:clean(p.nomeCategoria),unit:clean(p.unidade,30),size:clean(p.tamanhoEcommerce?.nome,30),discountStatus:'not_checked'};
}
export async function lookupRegistration(settings,{mode='browse',query='',offset=0,activeOnly=true,codes},fetcher=fetch) {
  if(settings.storeId!=='2')throw Error('registration_wrong_store');
  if(!Number.isInteger(offset)||offset<0||offset>100000)throw Error('registration_invalid_offset');
  if(!['browse','code','ean','name'].includes(mode)||typeof query!=='string'||query.length>120)throw Error('registration_invalid_query');
  if(mode==='code'&&!/^\d{1,12}$/.test(query)||mode==='ean'&&!/^\d{8,14}$/.test(query)||mode==='name'&&query.trim().length<3)throw Error('registration_invalid_query');
  const result=[],pageSize=50,limit=mode==='name'?4:1,stamp=new Date().toISOString();let nextOffset=offset,hasMore=false;
  const seen=new Set(),deadline=Date.now()+20000;
  for(let scan=0;scan<limit;scan++){
    const contract={request(){const url=new URL(settings.baseUrl.replace(/\/$/,'')+'/rest/integracao/produto/obter-v1');
      if(codes)for(const c of codes)url.searchParams.append('codigo',String(Number(c)));
      else if(mode==='code'||mode==='ean')url.searchParams.append(mode==='code'?'codigo':'codigoBarras',String(Number(query)));
      if(activeOnly)url.searchParams.set('ativo','true');url.searchParams.set('primeiroRegistro',String(nextOffset));url.searchParams.set('quantidadeRegistros',String(pageSize));
      return {url:url.href,headers:{Authorization:`Bearer ${settings.token}`,Accept:'application/json'}};
    },decode(data){if(!Array.isArray(data)||data.length>pageSize)throw Error();return data;}};
    const rows=await new TrierClient(settings,contract,fetcher).products({deadline});nextOffset+=rows.length;hasMore=rows.length===pageSize;
    for(const p of rows){const dto=registrationDTO(p,settings.storeId,stamp);
      if(dto.shortCode==='46295'||seen.has(dto.shortCode)||activeOnly&&!dto.active)continue;seen.add(dto.shortCode);
      if(codes&&!codes.some(c=>String(Number(c))===dto.shortCode)||mode==='code'&&dto.shortCode!==String(Number(query))||mode==='ean'&&dto.ean!==String(Number(query)))throw Error('registration_unexpected_identity');
      if(mode==='name'&&!norm(dto.name).includes(norm(query.trim())))continue;result.push(dto);
    }
    if(!hasMore||result.length>=50)break;
  }
  return {rows:result,nextOffset,hasMore,note:mode==='name'?'Busca por nome feita no backend em blocos de até 200 registros: a Trier não documenta filtro de nome neste endpoint. Continue nas próximas páginas se necessário.':''};
}
async function digest(value){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(data)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function discoveryAction({body,db,env,user,fetcher=fetch}) {
  const settings=config(env);if(!settings.enabled)throw Error('registration_integration_disabled');
  if(body.action==='registration-search'){
    const params={mode:body.mode||'browse',query:body.query||'',offset:body.offset??0,activeOnly:body.activeOnly!==false};
    const key='search:'+await digest({...params,storeId:settings.storeId});
    const cached=checked(await db.from('trier_registration_cache').select('payload,expires_at').eq('key',key).maybeSingle());
    if(cached&&Date.parse(cached.expires_at)>Date.now())return {...cached.payload,cached:true};
    try{const result=await lookupRegistration(settings,params,fetcher);checked(await db.from('trier_registration_cache').upsert({key,actor_id:null,payload:result,expires_at:new Date(Date.now()+900000).toISOString()}));return result;}
    catch{if(cached)return {...cached.payload,stale:true,note:'Trier indisponível. Resultado anterior preservado; consulte novamente antes de importar.'};throw Error('registration_provider_unavailable');}
  }
  if(body.action!=='registration-preview'||!Array.isArray(body.codes)||!body.codes.length||body.codes.length>30||body.codes.some(c=>!/^\d{1,12}$/.test(String(c))))throw Error('registration_invalid_selection');
  const codes=[...new Set(body.codes.map(c=>String(Number(c))))];
  const result=await lookupRegistration(settings,{codes,activeOnly:false},fetcher);
  if(result.rows.length!==codes.length)throw Error('registration_product_missing');
  const mapped=await new TrierClient({...settings,syncDeadlineMs:45000},createOfficialContract(codes),fetcher).products();
  for(const row of result.rows){const p=mapped.find(p=>p.reducedCode===row.shortCode);if(!p)throw Error('registration_product_missing');
    row.priceCents=moneyToCents(p.price,'decimal');row.regularPriceCents=p.regularPrice==null?null:moneyToCents(p.regularPrice,'decimal');row.stockQuantity=p.stockQuantity;row.active=p.status==='sellable';row.discountStatus=mapped.discountStatus;row.fetchedAt=new Date().toISOString();}
  const key='preview:'+crypto.randomUUID();checked(await db.from('trier_registration_cache').insert({key,actor_id:user.id,payload:{rows:result.rows},expires_at:new Date(Date.now()+900000).toISOString()}));
  return {previewId:key,rows:result.rows,expiresAt:new Date(Date.now()+900000).toISOString()};
}
