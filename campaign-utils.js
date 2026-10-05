// Shared by the browser and the campaign Edge Function. No catalog dependencies.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PAGES = 30;
export const TIME_ZONE = 'America/Sao_Paulo';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function safeLink(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2048) throw Error('Link inválido.');
  let url; try { url = new URL(value); } catch { throw Error('Informe um link HTTPS completo.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use um link HTTPS sem credenciais.');
  return url.href;
}
export function saoPauloInput(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function saoPauloISO(value, inclusiveEnd = false) {
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Preencha a data e o horário de São Paulo.');
  const target = Date.parse(value+'Z');
  let epoch = target;
  for (let i=0;i<3;i++) epoch += target - Date.parse(saoPauloInput(epoch)+'Z');
  if (!Number.isFinite(epoch) || saoPauloInput(epoch) !== value) throw Error('Data ou horário inválido.');
  return new Date(epoch + (inclusiveEnd ? 60000 : 0)).toISOString();
}
export function campaignStatus(c, now = Date.now()) {
  if (c.publication_state === 'archived') return 'archived';
  if (c.publication_state !== 'published') return 'draft';
  if (Date.parse(c.ends_at) <= now) return 'expired';
  if (!c.active) return 'inactive';
  if (Date.parse(c.starts_at) > now) return 'scheduled';
  return 'active';
}
export function visibleCampaigns(campaigns, now) {
  return campaigns.filter(c => c.publication_state === 'published' && c.active && Date.parse(c.starts_at) <= now && now < Date.parse(c.ends_at))
    .sort((a,b) => a.sort_order-b.sort_order || a.id.localeCompare(b.id));
}
export function validateCampaign(input) {
  if (!input || !UUID.test(input.id) || !Number.isSafeInteger(input.version) || input.version < 0) throw Error('Campanha ou versão inválida.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 120) throw Error('O título deve ter de 1 a 120 caracteres.');
  if (!['post','flyer'].includes(input.kind)) throw Error('Tipo de campanha inválido.');
  if (!UUID.test(input.cover_id)) throw Error('Envie uma imagem de capa.');
  const pages = input.pages;
  if (!Array.isArray(pages) || pages.some(id=>!UUID.test(id)) || pages.length > MAX_PAGES || (input.kind === 'post' && pages.length) || (input.kind === 'flyer' && !pages.length)) throw Error('Use até 30 páginas no encarte. Posts utilizam somente a capa.');
  if (new Set(pages).size !== pages.length) throw Error('Uma página não pode ser repetida.');
  const start = Date.parse(input.starts_at), end = Date.parse(input.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error('O término deve ser posterior ao início.');
  if (!Number.isInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 9999) throw Error('A ordem deve estar entre 0 e 9999.');
  if (typeof input.active !== 'boolean' || !['draft','published'].includes(input.publication_state)) throw Error('Estado de publicação inválido.');
  return { id: input.id, version:input.version, title, kind:input.kind, cover_id:input.cover_id, pages, link_url:safeLink(input.link_url), starts_at:new Date(start).toISOString(), ends_at:new Date(end).toISOString(), sort_order:input.sort_order, active:input.active, publication_state:input.publication_state };
}
// Parse container signatures and dimensions independently of the supplied filename/MIME.
// SVG, GIF, HTML, malformed containers and decompression bombs are rejected server-side.
export function inspectImage(bytes, claimedType) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24 || bytes.length > MAX_IMAGE_BYTES) throw Error('Use imagens válidas de até 5 MB.');
  const v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii = (p,n)=>String.fromCharCode(...bytes.subarray(p,p+n));
  let mime, width, height, extension;
  if (bytes[0]===137 && ascii(1,7)==='PNG\r\n\x1a\n' && ascii(12,4)==='IHDR') {
    mime='image/png'; extension='png'; width=v.getUint32(16); height=v.getUint32(20);
    let p=8, ended=false;
    while(p+12<=bytes.length){const size=v.getUint32(p);if(p+size+12>bytes.length)break;if(ascii(p+4,4)==='IEND'){ended=size===0&&p+12===bytes.length;break;}p+=size+12;}
    if(!ended)throw Error('PNG incompleto.');
  } else if (bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217) {
    mime='image/jpeg';extension='jpg';let p=2;
    while(p+8<bytes.length){if(bytes[p++]!==255)break;while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;const len=v.getUint16(p);if(len<2||p+len>bytes.length)break;if([0xc0,0xc1,0xc2].includes(marker)){height=v.getUint16(p+3);width=v.getUint16(p+5);break;}p+=len;}
  } else if (ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP' && v.getUint32(4,true)+8===bytes.length) {
    mime='image/webp';extension='webp';const tag=ascii(12,4);
    if(tag==='VP8X' && bytes.length>=30){if(bytes[20]&2)throw Error('Use WebP sem animação.');width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
    else if(tag==='VP8L' && bytes[20]===47){const bits=v.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
    else if(tag==='VP8 ' && bytes.length>=30 && bytes[23]===157 && bytes[24]===1 && bytes[25]===42){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
  }
  if (!mime || mime !== claimedType || !width || !height || width<16 || height<16 || width>12000 || height>12000 || width*height>40000000) throw Error('Imagem inválida. Use JPG, PNG ou WebP de até 40 megapixels.');
  return { mime, width, height, extension, size:bytes.length };
}
