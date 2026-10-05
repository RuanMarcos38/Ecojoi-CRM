import { createHash } from 'node:crypto';
import { z } from 'zod';
export const aiReplySchema=z.object({
 tenant_id:z.string().uuid(),conversation_id:z.string().uuid(),
 action:z.enum(['respond','clarify','escalate']).default('respond'),
 confidence:z.number().min(0).max(1).optional(),reason:z.string().trim().max(2000).optional(),
 body:z.string().trim().min(1).max(4000).optional(),response:z.string().trim().min(1).max(4000).nullable().optional(),
 event_id:z.string().trim().min(1).max(200).optional(),
 summary:z.string().trim().max(8000).nullable().optional(),next_action:z.string().trim().max(2000).nullable().optional(),
 usage:z.object({provider:z.string().trim().max(80).default('external'),model:z.string().trim().max(160).nullable().optional(),
 input_tokens:z.coerce.number().int().min(0).max(10000000).default(0),output_tokens:z.coerce.number().int().min(0).max(10000000).default(0),
 estimated_cost:z.coerce.number().min(0).max(100000).default(0),request_id:z.string().trim().max(200).nullable().optional()}).optional()
}).refine(value=>value.action==='escalate'||Boolean(value.body||value.response),{message:'response_required'});
export function aiDecision(input:z.infer<typeof aiReplySchema>,threshold=0.7){
 const lowConfidence=input.confidence!==undefined&&input.confidence<threshold;
 return {action:lowConfidence?'escalate':input.action,body:lowConfidence||input.action==='escalate'?null:input.body??input.response,
 reason:lowConfidence?'confidence_below_threshold':input.reason??(input.action==='escalate'?'agent_requested_handoff':null)};
}
export function aiRequestKey(input:{tenant:string;conversation:string;eventId?:string|null;lastInbound?:string|null;action:string;body?:string|null}){
 return createHash('sha256').update(JSON.stringify([input.tenant,input.conversation,input.eventId??null,input.eventId?null:input.lastInbound??null,input.action,input.eventId?null:input.body??null])).digest('hex');
}

