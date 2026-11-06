import { describe, expect, it } from 'vitest';
import { parseAmountCents } from '../lib/finance/amount';

describe('valores financeiros em centavos', () => {
  it.each([['0,01', 1], ['1,1', 110], ['999999999.99', 99_999_999_999], ['12', 1200]])(
    'converte %s sem arredondar',
    (input, expected) => expect(parseAmountCents(input)).toBe(expected)
  );

  it.each(['0,00', '-1', '1.234', '1e3', '1.234,50', '1000000000'])(
    'rejeita %s',
    input => expect(parseAmountCents(input)).toBeNull()
  );
});
