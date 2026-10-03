import {describe,it,expect} from 'vitest';
import {isPublicAddress,validateWebhookUrl} from '@/lib/server/webhook-transport';
describe('endpoint webhook seguro',()=>{
 it.each(['127.0.0.1','10.2.3.4','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])('bloqueia %s',ip=>expect(isPublicAddress(ip)).toBe(false));
 it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])('aceita IP público %s',ip=>expect(isPublicAddress(ip)).toBe(true));
 it.each(['http://example.com','https://localhost','https://127.0.0.1','https://[::1]','https://user:secret@example.com','https://example.com/#fragment'])('rejeita endpoint %s',url=>expect(()=>validateWebhookUrl(url)).toThrow());
 it('aceita HTTPS',()=>expect(validateWebhookUrl('https://example.com/hooks').pathname).toBe('/hooks'));
});

