import assert from 'node:assert/strict';
import test from 'node:test';
import { orderTotal } from '../src/order-total.js';

test('sums ordinary order lines', () => {
  assert.equal(orderTotal([{ price: 3, quantity: 2 }, { price: 4, quantity: 1 }]), 10);
});
