import {photoCrop} from './photo-preparation.js';
export const PHOTO_MAX_BYTES=5*1024*1024;
export async function prepareProductPhoto(file,crop={}){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>PHOTO_MAX_BYTES)throw Error('Use JPG, PNG ou WebP de até 5 MB.');
 let source,url;
 try{
  if(typeof createImageBitmap==='function')source=await createImageBitmap(file);
  else{url=URL.createObjectURL(file);source=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Não foi possível abrir a imagem.'));im.src=url;});}
  const width=source.width,height=source.height;if(!width||!height||width*height>40000000)throw Error('Imagem inválida ou grande demais.');
  const bounds=photoCrop(width,height,crop),canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(1200,1200):document.createElement('canvas');canvas.width=canvas.height=1200;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('O navegador não conseguiu preparar a foto.');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,1200);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const scale=Math.min(1080/bounds.width,1080/bounds.height),w=bounds.width*scale,h=bounds.height*scale;ctx.drawImage(source,bounds.x,bounds.y,bounds.width,bounds.height,(1200-w)/2,(1200-h)/2,w,h);
  const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>PHOTO_MAX_BYTES)throw Error('PNG final acima de 5 MB.');
  const fileName=String(file.name||'produto').replace(/\.[^.]+$/,'').slice(0,60)+'.png';
  return {file:new File([blob],fileName,{type:'image/png'}),width,height,lowResolution:Math.min(bounds.width,bounds.height)<600,processor:'contain-white-png1200-v1',crop};
 }finally{source?.close?.();if(url)URL.revokeObjectURL(url);}
}
