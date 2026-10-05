import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js/max';

export type PhoneStatus = 'valid' | 'incomplete' | 'ambiguous' | 'invalid';
export function inspectPhone(value?: string | null, country: CountryCode = 'BR') {
  const original = String(value ?? '').trim();
  const empty = { original, normalized: null, countryCode: null, areaCode: null, status: 'incomplete' as PhoneStatus };
  if (!original) return empty;
  if (!/^[+\d\s().-]+$/.test(original)) return { ...empty, status: 'ambiguous' as PhoneStatus };
  const digits = original.replace(/\D/g, '');
  // Meta supplies a complete international number without the "+" prefix.
  const candidate = !original.startsWith('+') && country === 'BR' && /^55\d{10,11}$/.test(digits)
    ? '+' + digits : original;
  try {
    const phone = parsePhoneNumberWithError(candidate, { defaultCountry: country, extract: false });
    if (!phone.isPossible()) return { ...empty, status: digits.length < 10 ? 'incomplete' as PhoneStatus : 'invalid' as PhoneStatus };
    if (!phone.isValid()) return { ...empty, status: 'invalid' as PhoneStatus };
    return { original, normalized: String(phone.number), countryCode: String(phone.countryCallingCode),
      areaCode: phone.country === 'BR' ? String(phone.nationalNumber).slice(0, 2) : null,
      status: 'valid' as PhoneStatus };
  } catch {
    return { ...empty, status: digits.length < 10 ? 'incomplete' as PhoneStatus : 'invalid' as PhoneStatus };
  }
}

export function phoneKey(value?: string | null) {
  return inspectPhone(value).normalized;
}

export function summarizePhones(rows: Array<{ id: string; phone?: string | null }>) {
  const summary = { valid: 0, incomplete: 0, ambiguous: 0, invalid: 0, sharedNumbers: 0 };
  const groups = new Map<string, string[]>();
  const records = rows.map(row => {
    const phone = inspectPhone(row.phone);
    summary[phone.status]++;
    if (phone.normalized) groups.set(phone.normalized, [...(groups.get(phone.normalized) ?? []), row.id]);
    return { id: row.id, ...phone };
  });
  summary.sharedNumbers = [...groups.values()].filter(ids => ids.length > 1).length;
  return { summary, records, shared: [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([normalized, ids]) => ({ normalized, ids })) };
}

