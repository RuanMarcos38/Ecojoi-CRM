export function whatsappPhoneVariants(phone: string, raw = phone) {
  const variants = [phone, phone.slice(1), raw];
  const local = phone.startsWith('+55') ? phone.slice(3) : '';
  if (local.length === 10 || local.length === 11) {
    const area = local.slice(0, 2);
    const number = `${local.slice(2, -4)}-${local.slice(-4)}`;
    variants.push(local, `55${local}`, `(${area}) ${number}`, `(${area})${number}`, `${area} ${number}`, `+55 (${area}) ${number}`, `+55 ${area} ${number}`, `${area}${number}`);
  }
  return [...new Set(variants)];
}
