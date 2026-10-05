import {spawn} from 'node:child_process';
import {access,cp} from 'node:fs/promises';
import path from 'node:path';
const runtime=path.resolve('.next/standalone'),port=3218,base='http://127.0.0.1:'+port;
await access(path.join(runtime,'server.js'));
await cp(path.resolve('.next/static'),path.join(runtime,'.next/static'),{recursive:true});
try{await cp(path.resolve('public'),path.join(runtime,'public'),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
const env={...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',NODE_ENV:'production'};
for(const key of Object.keys(env))if(/SUPABASE|META_|N8N_|AI_AGENT_|WORKER_SECRET/.test(key))delete env[key];
env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
env.NEXT_PUBLIC_SUPABASE_ANON_KEY='smoke-only-public-placeholder-not-a-real-key';
const child=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:runtime,env,stdio:'ignore',windowsHide:true});
const check=async(url,options={})=>fetch(base+url,{redirect:'manual',signal:AbortSignal.timeout(5000),...options});
const assert=(value,message)=>{if(!value)throw new Error(message);};
try{
 const deadline=Date.now()+45000;let ready=false;
 while(Date.now()<deadline){
  try{if((await check('/login')).status===200){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert(ready,'standalone did not start');
 const login=await check('/login'),html=await login.text();
 assert(login.status===200&&html.includes('Ecojoi'),'login does not render');
 const asset=html.match(/src="([^"]*\/_next\/static\/[^"]+\.js[^"]*)"/)?.[1];
 assert(asset,'login JavaScript asset missing');
 assert((await check(asset)).status===200,'static asset unavailable');
 const app=await check('/app');assert([307,308].includes(app.status),'protected UI does not redirect');
 for(const endpoint of ['/api/contacts','/api/pipeline-stages','/api/integrations/ai/knowledge','/api/integrations/meta/events']){
  assert((await check(endpoint)).status===401,'unauthenticated access not rejected: '+endpoint);
 }
 const health=await check('/api/health');assert(health.status===503,'missing service credentials must report degraded health');
 const healthBody=await health.json();assert(healthBody.database==='error','health hides missing DB configuration');
 const ai=await check('/api/ai-agent/reply',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert(ai.status===503,'unconfigured AI callback must fail closed');
 console.log(JSON.stringify({login:'ok',javascript_asset:'ok',protected_app:'redirected',protected_apis:'401',database_unconfigured:'503',ai_unconfigured:'503',real_credentials_used:false}));
}finally{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}

