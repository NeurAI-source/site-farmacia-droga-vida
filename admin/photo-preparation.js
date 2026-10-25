// Edits actual pixels only. No inpainting, reconstructed labels or image generation.
export function photoCrop(width,height,{left=0,top=0,right=0,bottom=0}={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Imagem inválida.');
  const values=[left,top,right,bottom].map(Number);
  if(values.some(v=>!Number.isFinite(v)||v<0||v>45))throw Error('Use recortes entre 0 e 45%.');
  return {x:Math.floor(width*values[0]/100),y:Math.floor(height*values[1]/100),
    width:Math.max(1,Math.floor(width*(100-values[0]-values[2])/100)),
    height:Math.max(1,Math.floor(height*(100-values[1]-values[3])/100))};
}
export function whiteBorderBounds({data,width,height}) {
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    if(data[i+3]<16||(data[i]>=248&&data[i+1]>=248&&data[i+2]>=248))continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left)return {x:0,y:0,width,height};
  const pad=Math.ceil(Math.max(width,height)*0.03);
  left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(width-1,right+pad);bottom=Math.min(height-1,bottom+pad);
  return {x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function sharpenPhoto(image,amount=0.15) {
  if(!Number.isFinite(amount)||amount<0||amount>0.3)throw Error('Nitidez inválida.');
  const {data,width,height}=image,source=new Uint8ClampedArray(data);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=(y*width+x)*4;
    for(let c=0;c<3;c++)data[i+c]=source[i+c]*(1+4*amount)-amount*(source[i-4+c]+source[i+4+c]+source[i-width*4+c]+source[i+width*4+c]);
  }
  return image;
}
