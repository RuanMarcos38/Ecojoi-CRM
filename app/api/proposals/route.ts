import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';

const itemSchema=z.object({
  product_id:z.string().uuid().optional().nullable(),
  description:z.string().trim().min(1).max(1000),
  quantity:z.coerce.number().positive(),
  unit_price:z.coerce.number().min(0),
  discount_percent:z.coerce.number().min(0).max(100).default(0)
});
const schema=z.object({
  deal_id:z.string().uuid().optional().nullable(),
  contact_id:z.string().uuid().optional().nullable(),
  title:z.string().trim().min(2).max(180),
  currency:z.string().trim().min(3).max(3).default('BRL'),
  valid_until:z.string().optional().nullable(),
  notes:z.string().max(5000).optional().nullable(),
  terms:z.string().max(5000).optional().nullable(),
  discount_percent:z.coerce.number().min(0).max(100).default(0),
  items:z.array(itemSchema).min(1)
});
function line(i:z.infer<typeof itemSchema>){const gross=i.quantity*i.unit_price;return Math.round((gross-(gross*i.discount_percent/100))*100)/100;}

export async function GET(){
  try{const ctx=await requirePermission('deals.view');const supabase=await createClient();
    const {data,error}=await supabase.from('proposals').select('id,proposal_number,title,status,currency,subtotal,discount_percent,discount_value,total,valid_until,sent_at,accepted_at,rejected_at,created_at,contact:contacts(id,name,email,phone),deal:deals(id,title)').eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}).limit(200);
    if(error)throw error;return NextResponse.json({data:data??[]});
  }catch(e){if(e instanceof Response)return e;return NextResponse.json({error:'proposals_fetch_failed'},{status:500});}
}
export async function POST(req:Request){
  try{const ctx=await requirePermission('deals.update');const body=schema.parse(await req.json());const supabase=await createClient();
    const subtotal=body.items.reduce((s,i)=>s+line(i),0);
    const discountValue=Math.round((subtotal*body.discount_percent/100)*100)/100;
    const total=Math.max(0,Math.round((subtotal-discountValue)*100)/100);
    const proposalNumber='PROP-'+Date.now().toString(36).toUpperCase();
    const {data,error}=await supabase.from('proposals').insert({
      tenant_id:ctx.tenantId,deal_id:body.deal_id??null,contact_id:body.contact_id??null,proposal_number:proposalNumber,title:body.title,
      status:'draft',currency:body.currency,subtotal,discount_percent:body.discount_percent,discount_value:discountValue,total,
      valid_until:body.valid_until??null,notes:body.notes??null,terms:body.terms??null,created_by:ctx.userId
    }).select().single();
    if(error)throw error;
    const {error:itemError}=await supabase.from('proposal_items').insert(body.items.map((i,index)=>({
      tenant_id:ctx.tenantId,proposal_id:data.id,product_id:i.product_id??null,description:i.description,quantity:i.quantity,
      unit_price:i.unit_price,discount_percent:i.discount_percent,line_total:line(i),sort_order:index
    })));
    if(itemError)throw itemError;
    return NextResponse.json({data},{status:201});
  }catch(e){if(e instanceof Response)return e;if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});return NextResponse.json({error:'proposal_create_failed'},{status:500});}
}
