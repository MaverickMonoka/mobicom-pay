import test from 'node:test';
import assert from 'node:assert/strict';
import {phpUrlEncode,orderedSignature,itnParamString,itnSignature} from '../lib/payfast-core.mjs';

test('PHP-style URL encoding uses plus for spaces and uppercase escapes',()=>{
  assert.equal(phpUrlEncode('Hello World / ~'),'Hello+World+%2F+%7E');
});

test('checkout signature is order-sensitive',()=>{
  const a=orderedSignature([['merchant_id','100'],['amount','10.00']],'secret');
  const b=orderedSignature([['amount','10.00'],['merchant_id','100']],'secret');
  assert.notEqual(a,b);
  assert.equal(a.length,32);
});

test('ITN param string stops before signature',()=>{
  assert.equal(itnParamString([['m_payment_id','abc'],['amount_gross','10.00'],['signature','deadbeef'],['ignored','x']]),'m_payment_id=abc&amount_gross=10.00');
});

test('ITN signature is generated from the posted order before signature',()=>{
  const entries=[['m_payment_id','abc'],['amount_gross','10.00'],['signature','placeholder']];
  assert.equal(itnSignature(entries,'secret'),orderedSignature([['m_payment_id','abc'],['amount_gross','10.00']],'secret'));
});
