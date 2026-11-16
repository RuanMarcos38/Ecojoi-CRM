export function campaignPhone(raw: string) {
  const value = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(value)) return '';
  const digits = value.replace(/\D/g, '');
  const normalized = !value.startsWith('+') && [10, 11].includes(digits.length) ? '55' + digits : digits;
  return /^[1-9]\d{7,14}$/.test(normalized) ? normalized : '';
}

export const campaignBatchSize = 500;
