import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePrices, applyPrices, catalogCheckup } from '../admin/neurai-utils.js';
const products = [
  {id:1,shortCode:'0012',name:'Sabonete',brand:'Marca',detail:'70g',priceCents:675,oldPriceCents:800,variants:[]},
  {id:2,shortCode:'12',name:'Shampoo',brand:'Marca',detail:'100mL',priceCents:1499,oldPriceCents:0,variants:[]},
  {id:3,shortCode:'',name:'Fralda Teste',brand:'Marca',detail:'Vários tamanhos',priceCents:3599,oldPriceCents:0,variants:[
    {id:31,size:'P',packageQuantity:34,shortCode:'0007P',priceCents:3499},
    {id:32,size:'M',packageQuantity:32,shortCode:'0007M'}
  ]}
];
test('price batch matches exact code, preserves zeros, and changes only reviewed prices', () => {
  const catalog = {products};
  const rows = analyzePrices('0012 5,99\n12 R$ 19.90', products);
  assert.ok(rows.every(r=>!r.error));
  const next = applyPrices(catalog, rows);
  assert.deepEqual(next.products.slice(0,2).map(p=>p.priceCents), [599,1990]);
  assert.equal(next.products[0].oldPriceCents,800);
  assert.equal(next.products[0].shortCode,'0012');
  assert.deepEqual(products.slice(0,2).map(p=>p.priceCents),[675,1499]);
});
test('fralda uses one reduced code and price per size, including fallback to the general price', () => {
  const rows = analyzePrices('0007P 32,99\n0007M 33,49', products);
  assert.ok(rows.every(r=>!r.error));
  assert.deepEqual(rows.map(r=>[r.variantSize,r.previousCents]), [['P',3499],['M',3599]]);
  const next = applyPrices({products}, rows);
  assert.equal(next.products[2].priceCents,3599);
  assert.deepEqual(next.products[2].variants.map(v=>v.priceCents),[3299,3349]);
  assert.equal(products[2].variants[0].priceCents,3499);
  assert.equal(products[2].variants[1].priceCents,undefined);
});
test('unknown, repeated, ambiguous and malformed codes block the entire batch', () => {
  for (const input of ['0012 5,99\nmissing 9,99','0012 5,99\n0012 6,99','0012 0','0012 -5','0012 1,234','0012 2 19,99','0012 12,3.4']) {
    const rows = analyzePrices(input,products);
    assert.ok(rows.some(r=>r.error), input);
    assert.throws(()=>applyPrices({products},rows));
  }
  assert.ok(analyzePrices('0012 5,99',[...products,{...products[0],id:4}])[0].error);
  assert.ok(analyzePrices('0007P 5,99',[...products,{id:4,shortCode:'',name:'Outra',brand:'',detail:'',priceCents:1,oldPriceCents:0,variants:[{id:40,size:'G',packageQuantity:1,shortCode:'0007P'}]}])[0].error);
  assert.throws(()=>analyzePrices('',products));
  assert.throws(()=>analyzePrices(Array(101).fill('12 1,00').join('\n'),products));
});
test('stale preview never overwrites changed product or variant prices/codes', () => {
  const productRows = analyzePrices('0012 5,99',products);
  for (const patch of [{priceCents:777},{shortCode:'2222'},{id:99}]) {
    const changed = structuredClone(products); Object.assign(changed[0],patch);
    assert.throws(()=>applyPrices({products:changed},productRows), /catálogo mudou/);
  }
  const variantRows = analyzePrices('0007P 32,99',products);
  for (const patch of [{priceCents:777},{shortCode:'2222'},{id:99}]) {
    const changed = structuredClone(products); Object.assign(changed[2].variants[0],patch);
    assert.throws(()=>applyPrices({products:changed},variantRows), /catálogo mudou/);
  }
});
test('checkup reports missing codes per size and potential duplicate presentations without changing products', () => {
  const duplicate = {...products[0],id:4,shortCode:''};
  const result = catalogCheckup([...products,duplicate]);
  assert.ok(result.find(p=>p.id===4).issues.includes('Sem código reduzido'));
  assert.ok(result.find(p=>p.id===3).issues.some(x=>x.includes('Tamanhos sem código reduzido: M')));
  assert.equal(duplicate.shortCode,'');
});
