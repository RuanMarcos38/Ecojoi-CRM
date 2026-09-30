import { NextResponse } from 'next/server';

export async function GET(request:Request){
  const base=new URL(request.url).origin;
  const security=[{bearerApiKey:[]}];
  return NextResponse.json({
    openapi:'3.1.0',
    info:{title:'Ecojoi CRM API',version:'2.0.0',description:'API multiempresa para integrações de CRM, atendimento e automações.'},
    servers:[{url:base}],
    components:{
      securitySchemes:{bearerApiKey:{type:'http',scheme:'bearer',bearerFormat:'Ecojoi API Key'}},
      schemas:{
        Contact:{type:'object',properties:{id:{type:'string'},name:{type:'string'},email:{type:['string','null']},phone:{type:['string','null']},source:{type:['string','null']}}},
        LeadInput:{type:'object',required:['name'],properties:{name:{type:'string'},email:{type:['string','null'],format:'email'},phone:{type:['string','null']},source:{type:['string','null']},channel:{type:'string',enum:['internal','whatsapp','instagram','facebook','email','external']},external_id:{type:['string','null']},message:{type:['string','null']},attribution:{type:'object',additionalProperties:true}}}
      }
    },
    paths:{
      '/api/v1/leads':{
        get:{summary:'Listar leads',security,description:'Scope: leads:read',responses:{'200':{description:'OK'}}},
        post:{summary:'Criar/atualizar lead',security,description:'Scope: leads:write',responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/contacts':{
        get:{summary:'Listar contatos',security,description:'Scope: contacts:read',responses:{'200':{description:'OK'}}},
        post:{summary:'Criar contato',security,description:'Scope: contacts:write',responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/deals':{
        get:{summary:'Listar oportunidades',security,description:'Scope: deals:read',responses:{'200':{description:'OK'}}},
        post:{summary:'Criar oportunidade',security,description:'Scope: deals:write',responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/tasks':{
        get:{summary:'Listar tarefas',security,description:'Scope: tasks:read',responses:{'200':{description:'OK'}}},
        post:{summary:'Criar tarefa',security,description:'Scope: tasks:write',responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/conversations':{
        get:{summary:'Listar conversas e mensagens',security,description:'Scope: conversations:read',responses:{'200':{description:'OK'}}}
      },
      '/api/v1/conversations/{id}/messages':{
        post:{summary:'Enviar mensagem',security,description:'Scope: messages:write. Respeita janela do WhatsApp oficial.',parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}],responses:{'201':{description:'Criado'},'409':{description:'Janela do WhatsApp fechada'}}}
      }
    }
  });
}
