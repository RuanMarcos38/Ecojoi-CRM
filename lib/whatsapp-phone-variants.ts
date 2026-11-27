export function whatsappPhoneVariants(phone: string, raw = phone) {
  const variants = [phone, phone.replace(/^\+/, ''), raw];
  const local = /^\+55(\d{10,11})$/.exec(phone)?.[1];
  if (!local) return [...new Set(variants)];

  const area = local.slice(0, 2);
  const subscriber = local.slice(2);
  const numbers = [subscriber];
  if (/^[6-9]\d{7}$/.test(subscriber)) numbers.push('9' + subscriber);
  if (/^9[6-9]\d{7}$/.test(subscriber)) numbers.push(subscriber.slice(1));

  for (const digits of numbers) {
    const number = `${digits.slice(0, -4)}-${digits.slice(-4)}`;
    variants.push(`+55${area}${digits}`, `55${area}${digits}`, area + digits,
      `(${area}) ${number}`, `(${area})${number}`, `${area} ${number}`,
      `+55 (${area}) ${number}`, `+55 ${area} ${number}`);
  }
  return [...new Set(variants)];
}
