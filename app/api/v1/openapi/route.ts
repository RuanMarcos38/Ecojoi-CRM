import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'Ecojoi CRM API',
      version: '1.0.0',
      description: 'API segura para integrar leads de sistemas externos ao Ecojoi CRM.'
    },
    servers: [{ url: base }],
    components: {
      securitySchemes: {
        bearerApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Ecojoi API Key' }
      },
      schemas: {
        LeadInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            email: { type: ['string','null'], format: 'email' },
            phone: { type: ['string','null'] },
            source: { type: ['string','null'] },
            channel: { type: 'string', enum: ['internal','whatsapp','instagram','facebook','email','external'] },
            external_id: { type: ['string','null'] },
            message: { type: ['string','null'] },
            attribution: { type: 'object', additionalProperties: true }
          }
        }
      }
    },
    paths: {
      '/api/v1/leads': {
        get: {
          summary: 'Listar leads',
          security: [{ bearerApiKey: [] }],
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } }],
          responses: { '200': { description: 'Lista de leads' }, '401': { description: 'Não autorizado' } }
        },
        post: {
          summary: 'Criar ou atualizar lead e iniciar atendimento',
          security: [{ bearerApiKey: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } }
          },
          responses: { '201': { description: 'Lead processado' }, '400': { description: 'Payload inválido' }, '401': { description: 'Não autorizado' } }
        }
      }
    }
  });
}
