const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBudgetSaveRequest, validateSetAddressRequest } = require('../lib/validators');

test('nome do orçamento: normaliza, vazio vira null, recusa acima de 150', () => {
  assert.deepEqual(validateBudgetSaveRequest({ name: '  Loja Centro  ' }), { name: 'Loja Centro' });
  assert.deepEqual(validateBudgetSaveRequest({ name: '' }), { name: null });
  assert.throws(() => validateBudgetSaveRequest({ name: 'x'.repeat(151) }), /muito longo/);
});

test('endereço não pede mais nome do cliente', () => {
  assert.deepEqual(validateSetAddressRequest({ address: 'Rua A, Centro', number: '10', clientName: 'ignorado' }), { address: 'Rua A, Centro', number: '10' });
});
