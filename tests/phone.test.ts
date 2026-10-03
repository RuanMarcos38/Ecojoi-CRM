import { describe, it, expect } from 'vitest';
import { inspectPhone, phoneKey, summarizePhones } from '@/lib/crm/phone';
describe('normalização conservadora de telefones', () => {
  it.each(['(47) 99937-1478', '47999371478', '5547999371478', '+55 47 99937-1478'])('unifica %s', value => {
    expect(phoneKey(value)).toBe('+5547999371478');
  });
  it('preserva original e reconhece DDD', () => {
    expect(inspectPhone('(47) 99937-1478')).toMatchObject({ original: '(47) 99937-1478', areaCode: '47', countryCode: '55', status: 'valid' });
  });
  it('não inventa DDD nem escolhe números com ramal', () => {
    expect(inspectPhone('99937-1478').normalized).toBeNull();
    expect(inspectPhone('47 99937-1478 / 48 99937-1478').status).toBe('ambiguous');
  });
  it('rejeita inválidos e é idempotente', () => {
    expect(phoneKey('00000000000')).toBeNull();
    expect(phoneKey(phoneKey('47999371478'))).toBe(phoneKey('47999371478'));
  });
  it('suporta número internacional explícito', () => expect(phoneKey('+1 213 373 4253')).toBe('+12133734253'));
  it('detecta números compartilhados sem mesclar cadastros', () => {
    const rows = [{ id: 'a', phone: '47999371478' }, { id: 'b', phone: '+5547999371478' }];
    expect(summarizePhones(rows).shared[0].ids).toEqual(['a', 'b']);
    expect(rows[0].phone).toBe('47999371478');
  });
});

