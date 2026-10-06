const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBudgetSaveRequest, validateSetAddressRequest } = require('../lib/validators');

test('nome do orçamento: normaliza, vazio vira null, recusa acima de 150', () => {
  assert.deepEqual(validateBudgetSaveRequest({ name: '  Loja Centro  ' }), { name: 'Loja Centro' });
  assert.deepEqual(validateBudgetSaveRequest({ name: '' }), { name: null });
  assert.throws(() => validateBudgetSaveRequest({ name: 'x'.repeat(151) }), /muito longo/);
});

test('endereço em campos: monta a linha de exibição, limpa o CEP e exige rua/número/cidade/UF', () => {
  const ok = validateSetAddressRequest({ cep: '01310-100', street: 'Av. Paulista', number: '1000', complement: 'Sala 5', district: 'Bela Vista', city: 'São Paulo', state: 'sp', clientName: 'ignorado' });
  assert.deepEqual(ok, {
    address: 'Av. Paulista, 1000 - Sala 5, Bela Vista, São Paulo - SP',
    number: '1000',
    addressParts: { cep: '01310100', street: 'Av. Paulista', complement: 'Sala 5', district: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  });
  assert.equal(validateSetAddressRequest({ street: 'Rua A', number: '1', city: 'X', state: 'MG' }).address, 'Rua A, 1, X - MG');
  assert.throws(() => validateSetAddressRequest({ street: 'Rua A', number: '1', city: 'X', state: 'MG', cep: '123' }), /CEP/);
  assert.throws(() => validateSetAddressRequest({ street: 'Rua A', number: '1', city: 'X' }), /UF/);
  assert.throws(() => validateSetAddressRequest({ street: 'Rua A', city: 'X', state: 'MG' }), /número/);
});
