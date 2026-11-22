
  const isPhotoPending = product => Boolean(product && (product.imagePending === true || !String(product.imageUrl || '').trim() || product.imageUrl === 'assets/product-pending.svg'));
  function matchPhotoFilename(filename,products){
    const tokens=new Set(String(filename||'').replace(/\.[^.]+$/,'').match(/\d{3,14}/g)||[]);
    if(!tokens.size)return null;
    const matches=(products||[]).filter(product=>{
      const values=[product.ean,product.shortCode,...(product.variants||[]).flatMap(v=>[v.ean,v.shortCode])];
      return values.some(value=>{
        const code=String(value||'').trim();
        return code.length>=3&&/^\d+$/.test(code)&&(tokens.has(code)||tokens.has(String(Number(code))));
      });
    });
    return matches.length===1?matches[0]:null;
  }

export { isPhotoPending, matchPhotoFilename };
