# Ecojoi CRM

CRM SaaS multiempresa criado do zero para atendimento, relacionamento e gestão comercial, com identidade visual inspirada nos materiais Ecojoi fornecidos.

## Stack
- Next.js 15 + React 19 + TypeScript
- Supabase Auth + PostgreSQL
- Row Level Security (RLS)
- RBAC no backend
- Tenant scoping em API e banco
- Feature flags por empresa
- Auditoria de ações críticas

## Módulos
Dashboard, Atendimento, Contatos, Leads, Pipeline, Tarefas, Automações, Relatórios, Equipe/Permissões e Configurações.

## Segurança multi-tenant
1. O tenant nunca é confiado a partir do payload do navegador.
2. A API deriva `tenant_id` do usuário autenticado em `profiles`.
3. Todas as queries de negócio aplicam `.eq('tenant_id', ctx.tenantId)`.
4. O banco repete a proteção com RLS via `has_tenant_access()`.
5. Triggers impedem referências cruzadas em conversas/mensagens.
6. RBAC é validado no backend antes de cada ação sensível.
7. Feature flags são filtradas por tenant e alterações exigem papel administrativo.

## Instalação
```bash
cp .env.example .env.local
npm install
npm run dev
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Banco
Execute `database/migrations/001_init.sql` no SQL Editor do Supabase. Depois crie o primeiro usuário no Supabase Auth e associe-o a um tenant conforme `database/seed.example.sql`.

## Verificações
```bash
npm run typecheck
npm test
npm run build
```

## Integrações externas
O canal `internal` do atendimento funciona sem provedor externo. WhatsApp/Instagram/Facebook foram modelados como canais, mas o envio externo exige credenciais oficiais do respectivo provedor. O backend retorna erro explícito em vez de simular envio quando o canal externo não está configurado.

## Variáveis
Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no browser nem use prefixo `NEXT_PUBLIC_` para ela.
