import { spawn } from 'node:child_process';
import { z } from 'zod';

// cPanel local MTA: credentials remain in the hosting service, never in the browser.
export async function sendAccessEmail(email:string,name:string,link:string):Promise<boolean>{
  if(!z.string().email().safeParse(email).success || /[\r\n]/.test(email))return false;
  const url=new URL(link);
  if(url.protocol!=='https:')return false;
  const sender='nao-responda@ecojoi.com.br';
  const message=[`From: Ecojoi CRM <${sender}>`,`To: ${email}`,'Subject: Ecojoi CRM - acesso a sua conta',
    'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',
    `Olá, ${name.replace(/[\r\n]/g,' ')}.`, '', 'Use o link individual abaixo para definir ou redefinir sua senha no CRM Ecojoi:',link,'',
    'Você já está vinculada à Ecojoi. Não é necessário cadastrar outra empresa.',
    'O link é de uso único e expira conforme a configuração de segurança. Se expirar, solicite um novo link ao administrador.',
    'Não compartilhe este link com outras pessoas.','', 'Equipe Ecojoi',''].join('\n');
  return new Promise(resolve=>{
    const proc=spawn('/usr/sbin/sendmail',['-i','-f',sender,'--',email],{stdio:['pipe','ignore','ignore']});
    const timer=setTimeout(()=>{proc.kill();resolve(false);},15000);
    proc.on('error',()=>{clearTimeout(timer);resolve(false);});
    proc.on('close',code=>{clearTimeout(timer);resolve(code===0);});
    proc.stdin.on('error',()=>{});
    proc.stdin.end(message);
  });
}
