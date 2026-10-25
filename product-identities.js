// Pure identity helpers shared by the editor and backend validation.
export const canonicalCode = value => {
  const code=String(value??'').trim().toUpperCase();
  return /^\d+$/.test(code)?code.replace(/^0+(?=\d)/,''):code;
};
export const identityItems = product => [product,...(product.variants||[])];
export function mergeEditedVariant(previous, fields) {
  const next={...previous,...fields};
  // A different ERP code is a new association: do not attribute an old sync to it.
  if(previous&&canonicalCode(previous.shortCode)!==canonicalCode(fields.shortCode))delete next.trier;
  return next;
}
export function duplicateIdentities(products) {
  const seen=new Map(),collisions=[];
  for(const product of products)for(const item of identityItems(product)){
    for(const [type,value] of [['code',canonicalCode(item.shortCode)],['ean',item.ean],['trier',item.trier?.id]]){
      if(!value)continue;
      const key=type+':'+value,owner={productId:product.id,variantId:item===product?null:item.id};
      if(seen.has(key))collisions.push({type,value,owners:[seen.get(key),owner]});else seen.set(key,owner);
    }
  }
  return collisions;
}
export function newIdentityCollisions(products,previous=[]) {
  const groups=list=>{
    const result=new Map();
    for(const p of list)for(const item of identityItems(p))for(const [type,value] of [['code',canonicalCode(item.shortCode)],['ean',item.ean],['trier',item.trier?.id]]){
      if(!value)continue;const key=type+':'+value;
      if(!result.has(key))result.set(key,[]);
      result.get(key).push({owner:`${p.id}/${item===p?'root':item.id}`,type,value});
    }
    return result;
  };
  const old=groups(previous),current=groups(products),out=[];
  for(const [key,items] of current)if(items.length>1){
    const before=(old.get(key)||[]).map(i=>i.owner),after=items.map(i=>i.owner);
    // An unchanged/reduced legacy collision can be reviewed without blocking unrelated edits.
    const remaining=[...before];let added=false;
    for(const owner of after){const i=remaining.indexOf(owner);if(i<0){added=true;break;}remaining.splice(i,1);}
    if(added)out.push({type:items[0].type,value:items[0].value});
  }
  return out;
}
