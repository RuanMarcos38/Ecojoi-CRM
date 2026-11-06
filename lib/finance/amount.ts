export function parseAmountCents(value: string): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}
