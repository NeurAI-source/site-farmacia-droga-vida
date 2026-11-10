import test from 'node:test';
import assert from 'node:assert/strict';
import {priceToCents,parseLabelCsv,labelFromTrier,printDocument,validateLabel,LABELS_PER_SHEET,A4_LAYOUT} from '../admin/labels-core.js';

test('A4 uses exactly two columns by four rows',()=>{
  assert.equal(LABELS_PER_SHEET,8);
  assert.equal(A4_LAYOUT.columns,2);
  assert.equal(A4_LAYOUT.rows,4);
  assert.equal(A4_LAYOUT.labelWidthMm,90);
  assert.equal(A4_LAYOUT.labelHeightMm,61);
});
test('Brazilian price parsing remains in integer cents',()=>{
  assert.equal(priceToCents('R$ 1.234,56'),123456);
  assert.equal(priceToCents('76,99'),7699);
  assert.equal(priceToCents(''),null);
  assert.throws(()=>priceToCents('10.123,99.9'));
});
test('CSV import recognizes semicolon, quoted content and store',()=>{
  const csv='codigo;produto;tamanhos;de;por;loja\n00123;"Fralda; Bebê";M68 G60;79,04;76,99;2\n';
  const {rows,errors}=parseLabelCsv(csv);
  assert.equal(errors.length,0);
  assert.equal(rows.length,1);
  assert.equal(rows[0].code,'00123');
  assert.equal(rows[0].name,'Fralda; Bebê');
  assert.equal(rows[0].regularPriceCents,7904);
  assert.equal(rows[0].priceCents,7699);
});
test('CSV invalid rows stay out of printable batch',()=>{
  const result=parseLabelCsv('produto;por\nOk;10,00\nErro;0,00\n');
  assert.equal(result.rows.length,1);
  assert.equal(result.errors.length,1);
  assert.match(result.errors[0],/Linha 3/);
});
test('Trier labels never cross store boundary or invent prior price',()=>{
  const item={storeId:'2',shortCode:'0001',name:'Produto',priceCents:2000,regularPriceCents:3000,discountStatus:'unavailable'};
  assert.equal(labelFromTrier(item).regularPriceCents,null);
  assert.equal(labelFromTrier({...item,discountStatus:'checked'}).regularPriceCents,3000);
  assert.throws(()=>labelFromTrier({...item,storeId:'1'}));
});
test('Price before discount must exceed current price',()=>{
  assert.throws(()=>validateLabel({name:'A',store:'2',priceCents:2000,regularPriceCents:1500}));
});
test('9 labels produce two A4 sheets, escape text and never leak scripts',()=>{
  const label={name:'<img src=x onerror=alert(1)>',size:'M68',code:'001',store:'2',priceCents:1699};
  const html=printDocument(Array.from({length:9},()=>label));
  assert.equal((html.match(/class="sheet"/g)||[]).length,2);
  assert.equal((html.match(/class="label"/g)||[]).length,9);
  assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<img src=x onerror/);
  assert.match(html,/@page\{size:A4;margin:8mm\}/);
});

test('official print style is photo-inspired, compact, without extra footer',()=>{
 const html=printDocument([{name:'Pampers Baby Shark',size:'M68 G60 XG56 XXG50',store:'2',priceCents:7699,regularPriceCents:7904}],{logoUrl:'https://example.test/logo.png'});
 assert.match(html,/repeat\\(2,90mm\\)/);
 assert.match(html,/repeat\\(4,61mm\\)/);
 assert.match(html,/DE: <s>R\\$/);
 assert.match(html,/PAMPERS BABY SHARK/i);
 assert.doesNotMatch(html,/<footer>/);
 assert.match(html,/header img/);
});
