import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTag, selectDepartment, SELLER_DEPARTMENTS } from '../src/routing.js';

const COMMERCIAL = '20a67e6a-83dc-4f95-9430-5bc51eeae7e4';

test('normaliza caixa, espaços e acentos', () => {
  assert.equal(normalizeTag('  Mônica '), 'MONICA');
  assert.equal(normalizeTag('Suelen'), 'SUELEN');
});

test('seleciona a equipe do vendedor pela tag', () => {
  const result = selectDepartment(['Cliente', 'mônica'], COMMERCIAL);
  assert.deepEqual(result, {
    matchedTag: 'MONICA',
    departmentId: SELLER_DEPARTMENTS.MONICA,
    usedFallback: false,
  });
});

test('usa Comercial quando nenhuma tag é reconhecida', () => {
  assert.deepEqual(selectDepartment(['VIP'], COMMERCIAL), {
    matchedTag: null,
    departmentId: COMMERCIAL,
    usedFallback: true,
  });
});

