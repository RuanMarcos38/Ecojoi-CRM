import {createHmac,timingSafeEqual} from 'node:crypto';
export function aiTenantToken(master:string,tenantId:string){
 return createHmac('sha256',master).update('ecojoi-ai-tenant:'+tenantId).digest('base64url');
}
function matches(value:string,expected:string){
 const left=Buffer.from(value),right=Buffer.from(expected);
 return left.length===right.length&&timingSafeEqual(left,right);
}
export function verifyAiAuthorization(header:string|null,master:string,tenantId:string,legacyTenantId?:string){
 if(!header||!master)return false;
 if(matches(header,'Bearer '+aiTenantToken(master,tenantId)))return true;
 return legacyTenantId===tenantId&&matches(header,'Bearer '+master);
}

