import {photoTargets,photoIdentity,canManageRegistration} from '../../../photo-queue-utils.js';
import {readBytes,RequestLimitError} from '../security.js';
import {inspectImage} from '../_shared/campaign-utils.js';
export const photoActions=['photo-source-status','photo-find','photo-source-file'];
const HOST='images.openbeautyfacts.org',API='https://world.openbeautyfacts.org',LICENSE='https://creativecommons.org/licenses/by-sa/3.0/';
const checked=r=>{if(r.error)throw Error('Armazenamento de fotos temporariamente indisponível.');return r.data;};
export function allowedBeautyImage(value,ean){
 try{const u=new URL(value),path=ean.length>9?ean.replace(/(\d{3})(\d{3})(\d{3})(.*)/,'$1/$2/$3/$4'):ean;return u.protocol==='https:'&&u.hostname===HOST&&!u.port&&!u.username&&!u.password&&!u.search&&u.pathname.startsWith('/images/products/'+path+'/')&&/\/front_[a-z_-]+\.\d+\.\d+\.jpg$/.test(u.pathname);}catch{return false;}
}
export function beautyCandidate(data,ean,now=Date.now()){
 const p=data?.product;if(data?.status!==1||!p||String(p.code)!==ean||!allowedBeautyImage(p.image_front_url,ean))return null;
 const front=p.image_front_url.match(/\/(front_[a-z_-]+)\./)?.[1],image=p.images?.[front],author=p.images?.[image?.imgid]?.uploader;
 return {provider:'open-beauty-facts',ean,name:String(p.product_name||'').slice(0,160),brand:String(p.brands||'').slice(0,100),quantity:String(p.quantity||'').slice(0,80),imageUrl:p.image_front_url,sourceUrl:API+'/product/'+ean,license:'CC BY-SA 3.0',licenseUrl:LICENSE,attribution:String(author||'Open Beauty Facts e colaboradores').slice(0,160),fetchedAt:new Date(now).toISOString()};
}
export async function photoSourceAction({body,db,user,role,env,fetcher=fetch,now=Date.now()}){
 if(!canManageRegistration(role))throw new RequestLimitError('Somente administradores podem gerenciar esta operação.',403);
 const enabled=env('PHOTO_OPENBEAUTY_ENABLED')==='true';
 if(body.action==='photo-source-status')return {enabled,provider:'Open Beauty Facts',license:'CC BY-SA 3.0',limitPerMinute:10,note:enabled?'Busca por EAN exato; aprovação visual e atribuição obrigatórias.':'A fonte gratuita ainda não está habilitada no backend. Upload local continua disponível.'};
 if(!enabled)throw new RequestLimitError('Busca externa desativada. Use upload local ou solicite a configuração do backend após revisão.',409);
 if(typeof body.key!=='string'||!/^\d{1,15}:\d{1,15}$/.test(body.key))throw new RequestLimitError('Selecione um produto ou variação.',400);
 const draft=checked(await db.from('catalog_draft').select('catalog').eq('id',1).single());
 const target=photoTargets(draft.catalog).find(t=>t.key===body.key);if(!target||!/^\d{8,14}$/.test(String(target.ean||'')))return {candidate:null,reason:'Sem EAN oficial neste produto/variação. Informe e valide o código antes de procurar a foto.'};
 const key='photo-obf:'+target.ean;
 let cached=checked(await db.from('trier_registration_cache').select('payload,expires_at').eq('key',key).maybeSingle());
 if(!cached||Date.parse(cached.expires_at)<=now){
  if(body.action==='photo-source-file')throw new RequestLimitError('A sugestão venceu. Procure novamente antes de preparar.',409);
  // One globally shared slot per six seconds: at most ten provider reads/minute,
  // even with several administrators or Edge isolates. Negative results are cached.
  checked(await db.from('trier_registration_cache').delete().like('key','photo-obf-slot:%').lt('expires_at',new Date(now).toISOString()));
  const slot=await db.from('trier_registration_cache').insert({key:'photo-obf-slot:'+Math.floor(now/6000),actor_id:null,payload:{},expires_at:new Date(now+60000).toISOString()});
  if(slot.error){if(slot.error.code==='23505')throw new RequestLimitError('Fonte ocupada. Aguarde seis segundos antes da próxima consulta.',429);checked(slot);}
  const response=await fetcher(API+'/api/v2/product/'+target.ean+'.json?fields=code,product_name,brands,quantity,image_front_url,images',{headers:{'User-Agent':'DrogaVidaCadastro/1.0 (+https://www.drogavidapopular.com.br)','Accept':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok&&response.status!==404)throw new RequestLimitError('Fonte de imagens temporariamente indisponível. Tente mais tarde; nenhuma foto foi alterada.',503);
  const data=response.status===404?{status:0}:JSON.parse(new TextDecoder().decode(await readBytes(response,256*1024)));
  cached={payload:{candidate:beautyCandidate(data,target.ean,now)},expires_at:new Date(now+86400000).toISOString()};
  checked(await db.from('trier_registration_cache').upsert({key,actor_id:null,...cached}));
 }
 const candidate=cached.payload?.candidate;
 if(!candidate)return {candidate:null,reason:'Nenhuma foto frontal confiável encontrada nessa fonte para o EAN. Mantido pendente.'};
 const identity=photoIdentity(target,candidate);
 if(body.action==='photo-find')return {candidate:{...candidate,...identity},cached:true};
 if(body.action!=='photo-source-file'||identity.blocked||!allowedBeautyImage(candidate.imageUrl,target.ean))throw new RequestLimitError('A imagem não corresponde à identificação atual. Confira os dados.',409);
 const response=await fetcher(candidate.imageUrl,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new RequestLimitError('A imagem não pôde ser carregada. O cadastro foi preservado.',503);
 const bytes=await readBytes(response,3*1024*1024),metadata=inspectImage(bytes,response.headers.get('content-type')?.split(';')[0]);
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {base64:btoa(binary),mime:metadata.mime,source:{...candidate,...identity}};
}
