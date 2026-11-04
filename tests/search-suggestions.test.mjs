import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestProducts } from '../search-suggestions-utils.js';

const product = (id, overrides = {}) => ({id, name:'Absorvente Always Noites Tranquilas', brand:'P&G', detail:'16 unidades', category:'Higiene', subcategory:'Absorventes', active:true, ...overrides});

test('NI matches Nivea and Ninho, not units or internal fragments', () => {
  const list = [product(1), product(2,{name:'Creme Nivea',brand:'Nivea'}), product(3,{name:'Leite Ninho',brand:'Nestlé'}), product(4,{name:'Creme Nivea oculto',active:false}), product(5,{name:'Vitamina',brand:'Fabricante',detail:'30 unids'})];
  assert.deepEqual(suggestProducts(list,' NI ').map(p=>p.id),[3,2]);
  assert.deepEqual(suggestProducts(list,'nive').map(p=>p.id),[2]);
});

test('name and brand rank before category or presentation; all terms must match', () => {
  const list = [product(1,{name:'Talco',brand:'A',subcategory:'Ninho'}),product(2,{name:'Leite Ninho',brand:'Z'}),product(3,{name:'Sabonete',brand:'Nivea',detail:'200 mL'})];
  assert.deepEqual(suggestProducts(list,'ni').map(p=>p.id),[2,3,1]);
  assert.deepEqual(suggestProducts(list,'nive 200').map(p=>p.id),[3]);
  assert.deepEqual(suggestProducts(list,'nive 300'),[]);
});

test('suggestions normalize accents, separators and case with a five-product limit', () => {
  const list = Array.from({length:8},(_,i)=>product(i,{name:`Loção Nivea ${i}`,brand:'Nivea',detail:null}));
  assert.equal(suggestProducts(list,'LOCAO-NI').length,5);
  assert.deepEqual(suggestProducts(list,' n '),[]);
  assert.deepEqual(suggestProducts(list,' . '),[]);
  assert.deepEqual(suggestProducts(list,'inexistente'),[]);
  assert.deepEqual(suggestProducts(list,'___ni').map(p=>p.id),[0,1,2,3,4]);
});
