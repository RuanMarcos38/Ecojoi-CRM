import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/server/audit';

const itemSchema=z.object({
  product_id:z.string().uuid().optional().nullable(),
  description:z.string().trim().min(1).max(500),
  quantity:z.coerce.number().positive().max(999999),
  unit_price:z.coerce.number().min(0).max(999999999),
  discount:z.coerce.number().min(0).max(999999999).default(0)
});
const schema=z.object({
  contact_id:z.string().uuid().optional().nullable(),
  deal_id:z.string().uuid().optional().nullable(),
  title:z.string().trim().min(2).max(180),
  valid_until:z.string().date().optional().nullable(),
  notes:z.string().trim().max(5000).optional().nullable(),
  discount:z.coerce.number().min(0).max(999999999).default(0),
  items:z.array(itemSchema).min(1).max(100)
});

function proposalNumber(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  const h=String(d.getHours()).padStart(2,'0');
  const min=String(d.getMinutes()).padStart(2,'0');
  return `PROP-${y}${m}${day}-${h}${min}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

export async function GET(){
  try{
    const ctx=await requirePermission('deals.view');
    const supabase=await createClient();
    const {data,error}=await supabase.from('proposals')
      .select('id,proposal_number,title,status,currency,subtotal,discount_percent,discount_value,total,valid_until,notes,terms,public_token,approved_at,sent_at,accepted_at,rejected_at,created_at,contact:contacts(id,name,email,phone),deal:deals(id,title),proposal_items(id,product_id,description,quantity,unit_price,discount_percent,line_total)')
      .eq('tenant_id',ctx.tenantId).order('created_at',{ascending:false}).limit(200);
    if(error)throw error;
    return NextResponse.json({data:data??[]});
  }catch(e){
    if(e instanceof Response)return e;
    return NextResponse.json({error:'proposals_fetch_failed'},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const ctx=await requirePermission('deals.update');
    const input=schema.parse(await req.json());
    const supabase=await createClient();

    if(input.contact_id){
      const {data:contact}=await supabase.from('contacts').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.contact_id).maybeSingle();
      if(!contact)return NextResponse.json({error:'contact_not_found'},{status:404});
    }
    if(input.deal_id){
      const {data:deal}=await supabase.from('deals').select('id').eq('tenant_id',ctx.tenantId).eq('id',input.deal_id).maybeSingle();
      if(!deal)return NextResponse.json({error:'deal_not_found'},{status:404});
    }

    const normalized=input.items.map((item,index)=>{
      const gross=item.quantity*item.unit_price;
      const discountValue=Math.min(gross,item.discount);
      const discountPercent=gross>0?(discountValue/gross)*100:0;
      const lineTotal=Math.max(0,gross-discountValue);
      return {...item,sort_order:index,discount_percent:discountPercent,line_total:lineTotal};
    });
    const subtotal=normalized.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);
    const itemDiscounts=normalized.reduce((sum,item)=>sum+((item.quantity*item.unit_price)-item.line_total),0);
    const proposalDiscount=Math.min(Math.max(0,subtotal-itemDiscounts),input.discount);
    const discountValue=itemDiscounts+proposalDiscount;
    const discountPercent=subtotal>0?(discountValue/subtotal)*100:0;
    const total=Math.max(0,subtotal-discountValue);

    const {data:proposal,error}=await supabase.from('proposals').insert({
      tenant_id:ctx.tenantId,
      contact_id:input.contact_id??null,
      deal_id:input.deal_id??null,
      proposal_number:proposalNumber(),
      title:input.title,
      status:'draft',
      currency:'BRL',
      subtotal,
      discount_percent:discountPercent,
      discount_value:discountValue,
      total,
      valid_until:input.valid_until??null,
      notes:input.notes??null,
      created_by:ctx.userId
    }).select().single();
    if(error)throw error;

    const items=normalized.map(item=>({
      tenant_id:ctx.tenantId,
      proposal_id:proposal.id,
      product_id:item.product_id??null,
      description:item.description,
      quantity:item.quantity,
      unit_price:item.unit_price,
      discount_percent:item.discount_percent,
      line_total:item.line_total,
      sort_order:item.sort_order
    }));
    const {error:itemError}=await supabase.from('proposal_items').insert(items);
    if(itemError){
      await supabase.from('proposals').delete().eq('tenant_id',ctx.tenantId).eq('id',proposal.id);
      throw itemError;
    }

    await audit({tenantId:ctx.tenantId,userId:ctx.userId,action:'proposal.create',entity:'proposal',entityId:proposal.id,metadata:{total}});
    return NextResponse.json({data:{...proposal,items}},{status:201});
  }catch(e){
    if(e instanceof Response)return e;
    if(e instanceof z.ZodError)return NextResponse.json({error:'invalid_payload',details:e.flatten()},{status:400});
    return NextResponse.json({error:'proposal_create_failed'},{status:500});
  }
}
