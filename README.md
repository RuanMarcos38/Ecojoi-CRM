# Ecojoi CRM

CRM SaaS multiempresa para atendimento, relacionamento e gestão comercial, com identidade visual inspirada nos materiais Ecojoi.

## Stack
- Next.js 15 + React 19 + TypeScript
- Supabase Auth + PostgreSQL
- Row Level Security (RLS)
- RBAC no backend
- Tenant scoping em API e banco
- Feature flags por empresa
- Auditoria append-only via função segura

## Módulos
- Dashboard com métricas reais
- Atendimento/inbox interno
- Contatos e Leads
- Pipeline comercial
- Tarefas e follow-ups
- Automações (cadastro/ativação de regras)
- Relatórios
- Equipe e permissões
- Configurações e Feature Flags
- Auditoria
- Área Super Admin para tenants

## Segurança multi-tenant
1. O tenant nunca é confiado a partir do payload do navegador.
2. A API deriva `tenant_id` do perfil autenticado.
3. Queries de negócio usam `id + tenant_id` para impedir IDOR.
4. O PostgreSQL repete a proteção com RLS e `has_tenant_access()`.
5. Triggers impedem referências cruzadas entre tenants.
6. RBAC é validado no backend antes de ações sensíveis.
7. Feature flags são tenant-scoped e também bloqueadas no backend.
8. Logs de auditoria são escritos por RPC `SECURITY DEFINER`, sem UPDATE/DELETE público.
9. Contas e tenants inativos são bloqueados no contexto autenticado.

## Instalação local
```bash
cp .env.example .env.local
npm install
npm run dev
```

Preencha pelo menos:
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Para convites de usuários pela tela de Equipe, configure no servidor:
```env
SUPABASE_SERVICE_ROLE_KEY=
```
Nunca exponha essa chave no navegador nem use prefixo `NEXT_PUBLIC_` para ela.

## Banco
Aplique em ordem:
1. `database/migrations/001_init.sql`
2. `database/migrations/002_security_and_modules.sql`

Depois crie o primeiro usuário pelo fluxo `/register`. Ao entrar sem perfil, o sistema direciona para `/setup`, que chama a função protegida `bootstrap_tenant()` e cria a primeira empresa, o administrador e as flags padrão.

`database/seed.example.sql` é apenas referência para cenários manuais/de teste; não coloque IDs reais no repositório.

## Verificações
```bash
npm run typecheck
npm test
npm run build
```

## Integrações externas
O canal `internal` do Atendimento funciona com o banco do CRM. WhatsApp, Instagram, Facebook e e-mail estão modelados como canais, porém o envio externo real exige credenciais/API oficial do respectivo provedor. Enquanto um provedor externo não estiver configurado, o backend bloqueia o envio em vez de simular sucesso.

## Automações
O CRM permite cadastrar, ativar, editar e excluir regras de automação com isolamento por tenant. A execução assíncrona de regras/eventos externos deve ser ligada a um worker/Edge Function quando o provedor final for escolhido.
