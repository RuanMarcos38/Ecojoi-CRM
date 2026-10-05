import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';
const blocked=new BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['192.0.2.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const) blocked.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['2001:db8::',32],['2001::',32],['2002::',16]] as const) blocked.addSubnet(ip,bits,'ipv6');
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6');
export function isPublicAddress(ip:string){
 const family=isIP(ip);
 return family===4?!blocked.check(ip,'ipv4'):family===6&&globalV6.check(ip,'ipv6')&&!blocked.check(ip,'ipv6');
}
export function validateWebhookUrl(value:string){
 const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
 if(url.protocol!=='https:'||url.username||url.password||url.hash||['localhost','localhost.localdomain'].includes(host.toLowerCase())||(isIP(host)&&!isPublicAddress(host)))throw new Error('webhook_https_public_endpoint_required');
 return url;
}
export async function postWebhook(endpoint:string,body:string,headers:Record<string,string>){
 const url=validateWebhookUrl(endpoint),host=url.hostname.replace(/^\[|\]$/g,'');
 let dnsTimer:ReturnType<typeof setTimeout>|undefined;
 let addresses:Array<{address:string;family:number}>;
 try{
  addresses=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([
   lookup(host,{all:true}),new Promise<never>((_,reject)=>{dnsTimer=setTimeout(()=>{const e=new Error('webhook_dns_timeout');e.name='TimeoutError';reject(e);},5000);})
  ]);
 }finally{if(dnsTimer)clearTimeout(dnsTimer);}

 if(!addresses.length||addresses.some(item=>!isPublicAddress(item.address)))throw new Error('webhook_private_endpoint_blocked');
 const pinned=addresses[0];
 return await new Promise<{status:number;ok:boolean}>((resolve,reject)=>{
  const req=request(url,{method:'POST',headers:{...headers,'content-length':String(Buffer.byteLength(body))},
   lookup:(_hostname,options,callback)=>{
    if(typeof options==='object'&&options.all)callback(null,[{address:pinned.address,family:pinned.family}]);
    else callback(null,pinned.address,pinned.family);
   }
  },response=>{
   response.on('error',reject);response.resume();
   const status=response.statusCode??0;
   response.on('end',()=>resolve({status,ok:status>=200&&status<300}));
  });
  const timer=setTimeout(()=>{const error=new Error('webhook_timeout');error.name='TimeoutError';req.destroy(error);},12000);
  req.once('error',error=>{clearTimeout(timer);reject(error);});
  req.once('close',()=>clearTimeout(timer));req.end(body);
 });
}

