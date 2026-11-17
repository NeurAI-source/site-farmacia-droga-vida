import test from 'node:test';
import assert from 'node:assert/strict';
import {A4_LAYOUT,LABELS_PER_SHEET,priceToCents,parseLabelCsv,labelFromTrier,validateLabel,printDocument} from '../labels-core.js';

test('A4 official V2 grid is 2x4 at exact 90x61 mm',()=>{
  assert.equal(LABELS_PER_SHEET,8);
  assert.deepEqual([A4_LAYOUT.columns,A4_LAYOUT.rows,A4_LAYOUT.labelWidthMm,A4_LAYOUT.labelHeightMm,A4_LAYOUT.gapMm],[2,4,90,61,6]);
});
test('BRL cents and comma handling',()=>{
  assert.equal(priceToCents('R$ 1.234,56'),123456);
  assert.equal(priceToCents('76,99'),7699);
  assert.equal(priceToCents(''),null);
  assert.throws(()=>priceToCents('12.345,67,00'));
});
test('CSV supports escaped quoted name and leading zeros',()=>{
  const data=parseLabelCsv('codigo;produto;tamanhos;de;por;loja\n00123;"Fralda; Bebê";M68;79,04;76,99;2\n');
  assert.equal(data.rows.length,1);
  assert.equal(data.errors.length,0);
  assert.deepEqual([data.rows[0].code,data.rows[0].name,data.rows[0].priceCents],['00123','Fralda; Bebê',7699]);
});
test('CSV errors are isolated by row',()=>{
  const result=parseLabelCsv('produto;por\nOk;10,00\nInválido;0,00\n');
  assert.equal(result.rows.length,1);assert.equal(result.errors.length,1);
  assert.match(result.errors[0],/Linha 3/);
});
test('store boundary and promotion verification',()=>{
  const item={storeId:'2',shortCode:'123',name:'Produto',priceCents:2000,regularPriceCents:3000,discountStatus:'unavailable'};
  assert.equal(labelFromTrier(item).regularPriceCents,null);
  assert.equal(labelFromTrier({...item,discountStatus:'checked'}).regularPriceCents,3000);
  assert.throws(()=>labelFromTrier({...item,storeId:'1'}));
  assert.throws(()=>validateLabel({name:'Teste',store:'1',priceCents:2000,regularPriceCents:1999}));
});
test('print 1/8/9/16 labels and escape input',()=>{
  const label={name:'<script>alert(1)</script>',size:'M68',code:'123',store:'2',priceCents:7699};
  for(const [count,pages] of [[1,1],[8,1],[9,2],[16,2]]){
    const html=printDocument(Array.from({length:count},()=>label));
    assert.equal((html.match(/<section class="sheet/g)||[]).length,pages);
    assert.equal((html.match(/<article class="label">/g)||[]).length,count);
    assert.match(html,/@page\{size:A4;margin:0\}/);
    assert.match(html,/repeat\(2,90mm\)/);
    assert.match(html,/repeat\(4,61mm\)/);
    assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  }
});
test('demo price sheets are watermarked; real price sheets are not',()=>{
  const standard={name:'Produto',store:'2',priceCents:1299};
  assert.match(printDocument([{...standard,origin:'demo'}]),/sheet demo/);
  assert.doesNotMatch(printDocument([standard]),/class="sheet demo"/);
  assert.match(printDocument([{...standard,origin:'demo'}]),/PREÇOS FICTÍCIOS/);
});
test('standalone printed label contains no admin/storefront navigation',()=>{
  const page=printDocument([{name:'Pampers Baby Shark',size:'M68 G60 XG56 XXG50',store:'2',priceCents:7699,regularPriceCents:7904}],{logoUrl:'https://example.invalid/logo.png'});
  assert.match(page,/DE: <s>R\$/);
  assert.match(page,/Pampers Baby Shark/);
  assert.match(page,/header img/);
  assert.doesNotMatch(page,/site-farmacia-droga-vida\/admin/);
  assert.doesNotMatch(page,/<footer>/);
});
