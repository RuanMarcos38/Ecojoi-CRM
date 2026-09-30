import { NextResponse } from 'next/server';

const security=[{bearerApiKey:[]}];

export async function GET(request:Request){
  const base=new URL(request.url).origin;
  return NextResponse.json({
    openapi:'3.1.0',
    info:{
      title:'Ecojoi CRM API',
      version:'2.0.0',
      description:'API multiempresa do Ecojoi CRM com autenticação Bearer, escopos e rate limit por chave.'
    },
    servers:[{url:base}],
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
        get:{summary:'Listar leads',security,responses:{'200':{description:'OK'}}},
        post:{summary:'Criar ou atualizar lead',security,responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/contacts':{
        get:{summary:'Listar contatos',security,responses:{'200':{description:'OK'}}},
        post:{summary:'Criar ou atualizar contato',security,requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/ContactInput'}}}},responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/deals':{
        get:{summary:'Listar negócios',security,responses:{'200':{description:'OK'}}},
        post:{summary:'Criar negócio',security,requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/DealInput'}}}},responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/tasks':{
        get:{summary:'Listar tarefas',security,responses:{'200':{description:'OK'}}},
        post:{summary:'Criar tarefa',security,requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/TaskInput'}}}},responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/conversations':{
        get:{summary:'Listar conversas',security,responses:{'200':{description:'OK'}}},
        post:{summary:'Criar conversa',security,responses:{'201':{description:'Criado'}}}
      },
      '/api/v1/conversations/{id}/messages':{
        get:{summary:'Listar mensagens',security,parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'200':{description:'OK'}}},
        post:{summary:'Enviar mensagem',security,parameters:[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}],responses:{'201':{description:'Enviada ou enfileirada'}}}
      },
      '/api/v1/reports':{
        get:{summary:'Resumo de indicadores comerciais',security,responses:{'200':{description:'OK'}}}
      }
    }
  });
}
