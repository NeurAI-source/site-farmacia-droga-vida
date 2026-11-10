// Pure utilities for the label tool. Prices are stored as integer cents.
export const LABELS_PER_SHEET = 8;
export const A4_LAYOUT = Object.freeze({
  pageWidthMm: 210, pageHeightMm: 297, marginMm: 8,
  columns: 2, rows: 4, gapMm: 4, labelWidthMm: 95, labelHeightMm: 67.25
});
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));
export const brl = cents => new Intl.NumberFormat('pt-BR', {
  style:'currency', currency:'BRL'
}).format(cents / 100);
export function priceToCents(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Preço inválido.');
  const raw = String(value ?? '').replace(/R\$\s*/gi,'').replace(/\s/g,'').trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g,'').replace(',','.') : raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw Error('Preço inválido: ' + raw);
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) throw Error('Preço fora do limite.');
  return cents;
}
export function validateLabel(value) {
  const name = String(value.name ?? '').trim().slice(0,120);
  const size = String(value.size ?? '').trim().slice(0,80);
  const code = String(value.code ?? '').trim().slice(0,40);
  const store = String(value.store ?? '').trim();
  const priceCents = value.priceCents;
  const regularPriceCents = value.regularPriceCents ?? null;
  if (!name || !['1','2'].includes(store) || !Number.isSafeInteger(priceCents) || priceCents <= 0)
    throw Error('Informe produto, loja e preço positivo.');
  if (regularPriceCents !== null && (!Number.isSafeInteger(regularPriceCents) || regularPriceCents <= priceCents))
    throw Error('Preço anterior precisa ser maior que o preço atual.');
  return {name,size,code,store,priceCents,regularPriceCents,
    origin:String(value.origin ?? 'manual'),checkedAt:value.checkedAt ?? null};
}
export function labelFromTrier(row) {
  if (String(row.storeId) !== '2') throw Error('Consulta Trier autorizada somente para a unidade 2.');
  const confirmedOffer = row.discountStatus === 'checked'
    && Number.isSafeInteger(row.regularPriceCents)
    && row.regularPriceCents > row.priceCents;
  return validateLabel({name:row.name,code:row.shortCode,size:row.size || row.unit || '',
    store:'2',priceCents:row.priceCents,
    regularPriceCents:confirmedOffer ? row.regularPriceCents : null,
    checkedAt:row.fetchedAt,origin:'trier'});
}
function csvRows(input) {
  const text = String(input ?? '').replace(/^\uFEFF/,'');
  const firstLine = text.split(/\r?\n/,1)[0] || '';
  const delimiter = (firstLine.match(/;/g)||[]).length >= (firstLine.match(/,/g)||[]).length ? ';' : ',';
  const records = []; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c === '"') {
      if(quoted && text[i+1] === '"'){cell+='"';i++;}else quoted=!quoted;
    } else if(c===delimiter && !quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted) {
      if(c==='\r' && text[i+1]==='\n')i++;
      row.push(cell);if(row.some(v=>v.trim()))records.push(row);row=[];cell='';
    } else cell+=c;
  }
  if(quoted)throw Error('CSV com aspas não fechadas.');
  row.push(cell);if(row.some(v=>v.trim()))records.push(row);
  return records;
}
const normalize = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseLabelCsv(text, defaultStore='1') {
  const data=csvRows(text);
  if(data.length<2)throw Error('CSV vazio. Inclua cabeçalho e produtos.');
  const header=data[0].map(normalize);
  const index = (...names) => header.findIndex(col=>names.includes(col));
  const nameI=index('produto','nome','nomeproduto','descricao');
  const priceI=index('por','preco','precoatual','valor','precovenda');
  if(nameI<0||priceI<0)throw Error('CSV precisa das colunas produto e por.');
  const oldI=index('de','precoanterior','precocheio');
  const sizeI=index('tamanhos','tamanho','apresentacao');
  const codeI=index('codigo','codigoreduzido','codreduzido','ean');
  const storeI=index('loja','unidade','filial');
  const rows=[],errors=[];
  for(const [indexRow,fields] of data.slice(1).entries()){
    try{
      if(rows.length>=500)throw Error('Limite de 500 produtos por importação.');
      const current=priceToCents(fields[priceI]);
      const previous=oldI<0?null:priceToCents(fields[oldI]);
      rows.push(validateLabel({name:fields[nameI],size:sizeI<0?'':fields[sizeI],
        code:codeI<0?'':fields[codeI],store:storeI<0?defaultStore:fields[storeI]||defaultStore,
        priceCents:current,regularPriceCents:previous,origin:'csv'}));
    }catch(error){errors.push('Linha '+(indexRow+2)+': '+error.message);}
  }
  return {rows,errors};
}
export function printDocument(labels,{logoUrl=''}={}) {
  if(!labels.length)throw Error('Adicione uma etiqueta antes de imprimir.');
  const items=labels.map(validateLabel);
  const sheets=[];
  for(let start=0;start<items.length;start+=LABELS_PER_SHEET){
    const page=items.slice(start,start+LABELS_PER_SHEET);
    const cells=page.map(item=>{
      const origin=item.origin==='trier'?'Consultado na Trier':'Conferir preço na loja';
      const old=item.regularPriceCents?'<span class="old">DE: <s>'+escapeHtml(brl(item.regularPriceCents))+'</s></span>':'<span class="old">&nbsp;</span>';
      return '<article class="label"><header>'+ (logoUrl?'<img alt="" src="'+escapeHtml(logoUrl)+'">':'')+
        '<b>Droga Vida Popular</b><small>Porque Saúde é Vida.</small></header>'+
        '<div class="details"><strong class="name">'+escapeHtml(item.name)+'</strong>'+
        '<span class="size">'+escapeHtml(item.size)+'</span>'+
        '<div class="prices">'+old+'<strong>'+escapeHtml(brl(item.priceCents))+'</strong></div>'+
        '<footer><span>Loja '+escapeHtml(item.store)+'</span><span>'+escapeHtml(item.code)+'</span></footer>'+
        '</div></article>';
    }).join('');
    sheets.push('<section class="sheet">'+cells+'</section>');
  }
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>Etiquetas — Droga Vida Popular</title><style>'+
    '@page{size:A4;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#101010;font-family:Arial,sans-serif}'+
    '.tools{padding:14px;background:#eee;font:14px Arial;display:flex;gap:14px;align-items:center;flex-wrap:wrap}'+
    '.tools button{border:0;background:#222;color:#fff;padding:10px 18px;border-radius:8px;cursor:pointer}'+
    '.sheet{width:194mm;height:281mm;display:grid;grid-template-columns:repeat(2,95mm);grid-template-rows:repeat(4,67.25mm);gap:4mm;break-after:page;page-break-after:always}'+
    '.sheet:last-child{break-after:auto;page-break-after:auto}'+
    '.label{border:1.4mm solid #202020;min-width:0;min-height:0;overflow:hidden;background:white;display:flex;flex-direction:column}'+
    '.label header{height:11mm;background:#202020;color:#fff;text-align:center;display:flex;gap:0;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;position:relative}'+
    '.label header img{max-height:9mm;max-width:22mm;object-fit:contain;position:absolute;left:2mm;top:1mm}'+
    '.label header b{font-size:12pt}.label header small{font-size:6pt}'+
    '.details{padding:1.5mm 2mm;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between}'+
    '.name{font-size:14pt;font-weight:900;line-height:1.03;min-height:12mm;text-align:center;text-transform:uppercase;overflow-wrap:anywhere}'+
    '.size{font-size:9.5pt;font-weight:bold;text-align:center;min-height:5mm}'+
    '.prices{width:100%;display:flex;align-items:end;justify-content:space-between;gap:1mm}'+
    '.prices strong{font-weight:900;font-size:25pt;white-space:nowrap;letter-spacing:-1pt}'+
    '.prices .old{font-size:8pt;font-weight:bold;white-space:nowrap}'+
    '.details footer{width:100%;display:flex;justify-content:space-between;font-size:6pt;color:#444}'+
    '@media screen{body{background:#ddd}.sheet{background:#fff;margin:12px auto;box-shadow:0 2px 12px #0002}}'+
    '@media print{.tools{display:none!important}body{background:white}.sheet{margin:0;box-shadow:none}'+
    'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
    '</style></head><body><div class="tools"><button onclick="window.print()">Imprimir / Salvar PDF</button>'+
    '<span>Use papel A4, escala 100% e desative cabeçalhos/rodapés do navegador. '+items.length+' etiquetas · '+sheets.length+' folha(s).</span></div>'+
    sheets.join('')+'</body></html>';
}
