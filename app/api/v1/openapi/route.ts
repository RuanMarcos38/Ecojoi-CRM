import { NextResponse } from 'next/server';
const security = [{ bearerApiKey: [] }];

const commonResponses = {
  '401': { description: 'Chave ausente, inválida, revogada ou expirada' },
  '403': { description: 'Chave sem permissão para a operação' },
  '429': { description: 'Limite de requisições excedido' },
  '503': { description: 'Serviço temporariamente indisponível' }
};

export async function GET() {
  return NextResponse.json({
    openapi:'3.1.0',
    info:{
      title:'Ecojoi CRM API',
      version:'2.1.0',
      description:'API multiempresa do Ecojoi CRM com autenticação Bearer, escopos e rate limit por chave.'
    },
    servers:[{url:'/'}],
    components:{
      securitySchemes:{bearerApiKey:{type:'http',scheme:'bearer',bearerFormat:'Ecojoi API Key'}},
      schemas:{
        ContactInput:{
          type:'object',required:['name'],
          properties:{name:{type:'string'},email:{type:['string','null'],format:'email'},phone:{type:['string','null']},source:{type:['string','null']},status:{type:'string',enum:['lead','active','inactive']},external_id:{type:['string','null']},custom_fields:{type:'object',additionalProperties:true}}
        },
        DealInput:{
          type:'object',required:['title'],
          properties:{title:{type:'string'},stage:{type:'string',enum:['new','qualification','proposal','closing','won','lost']},value:{type:'number'},probability:{type:'integer'},contact_id:{type:['string','null'],format:'uuid'},owner_id:{type:['string','null'],format:'uuid'}}
        },
        TaskInput:{
          type:'object',required:['title'],
          properties:{title:{type:'string'},description:{type:['string','null']},priority:{type:'string',enum:['low','medium','high']},due_at:{type:['string','null'],format:'date-time'},related_contact_id:{type:['string','null'],format:'uuid'},assigned_to:{type:['string','null'],format:'uuid'}}
        }
      }
    },
    paths:{
      '/api/v1/leads':{
        get:{summary:'Listar leads',description:'Escopo exigido: `leads:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Criar ou atualizar lead',description:'Escopo exigido: `leads:write`.',security,responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/contacts':{
        get:{summary:'Listar contatos',description:'Escopo exigido: `contacts:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Criar ou atualizar contato',description:'Escopo exigido: `contacts:write`.',security,requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/ContactInput'}}}},responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/deals':{
        get:{summary:'Listar negócios',description:'Escopo exigido: `deals:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Criar negócio',description:'Escopo exigido: `deals:write`.',security,requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/DealInput'}}}},responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/tasks':{
        get:{summary:'Listar tarefas',description:'Escopo exigido: `tasks:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Criar tarefa',description:'Escopo exigido: `tasks:write`.',security,requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/TaskInput'}}}},responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/conversations':{
        get:{summary:'Listar conversas',description:'Escopo exigido: `conversations:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Criar conversa',description:'Escopo exigido: `conversations:write`.',security,responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/conversations/{id}/messages':{
        get:{summary:'Listar mensagens',description:'Escopo exigido: `conversations:read`.',security,parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Enviar mensagem',description:'Escopo exigido: `messages:write`.',security,parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{...commonResponses,'201':{description:'Enviada ou enfileirada'}}}
      },
      '/api/v1/reports':{
        get:{summary:'Resumo de indicadores comerciais',description:'Escopo exigido: `reports:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}}
      },
      '/api/v1/emails':{
        get:{summary:'Listar e-mails sincronizados',description:'Escopo exigido: `emails:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Sincronizar e-mail externo',description:'Escopo exigido: `emails:write`.',security,responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/calendar-events':{
        get:{summary:'Listar eventos de calendário',description:'Escopo exigido: `calendar:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Sincronizar evento de calendário',description:'Escopo exigido: `calendar:write`.',security,responses:{...commonResponses,'201':{description:'Criado'}}}
      },
      '/api/v1/transcripts':{
        get:{summary:'Listar resumos/transcrições',description:'Escopo exigido: `transcripts:read`.',security,responses:{...commonResponses,'200':{description:'OK'}}},
        post:{summary:'Registrar transcrição e próximos passos',description:'Escopo exigido: `transcripts:write`.',security,responses:{...commonResponses,'201':{description:'Criado'}}}
      }
    }
  }, { headers: { 'cache-control': 'public, max-age=300' } });
}
