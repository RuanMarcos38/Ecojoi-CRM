# Ecojoi CRM — Security Model

## Multi-tenancy
Toda entidade pertencente a cliente utiliza `tenant_id`. O frontend não escolhe o tenant da requisição: APIs derivam o contexto de `auth.uid()` -> `profiles` e repetem o filtro no banco. PostgreSQL RLS é uma segunda barreira independente.

## IDOR
Rotas por objeto combinam o identificador solicitado com `tenant_id` do usuário. Referências entre contatos, conversas, mensagens, negócios, tarefas e automações são validadas por triggers para impedir relacionamentos cruzados entre empresas.

## RBAC
Papéis: `super_admin`, `company_admin`, `manager`, `user`. Permissões são validadas no backend e no RLS. Ocultar menus no frontend é apenas UX e nunca a única proteção.

Usuários comuns podem ler o próprio perfil para formar o contexto autenticado; leitura da equipe inteira continua condicionada a `team.view`.

## Super Admin
Somente `super_admin` pode listar/administrar tenants globalmente. Triggers impedem que administradores de empresa alterem contas `super_admin`, se desativem ou se rebaixem por manipulação direta.

## Feature Flags
Flags são tenant-scoped. Usuários do tenant podem ler flags para montar a interface, mas somente quem possui `features.manage` pode alterá-las. Funcionalidades protegidas também verificam a flag no backend.

## Auditoria
Clientes não escrevem diretamente na tabela `audit_logs`. A aplicação usa `write_audit_log()` (`SECURITY DEFINER`) para registros append-only associados ao tenant autenticado. Não há política pública de UPDATE/DELETE dos logs.

## Onboarding
`bootstrap_tenant()` usa o usuário autenticado, impede duplicidade de perfil e cria tenant + primeiro `company_admin` + configurações/flags padrão em uma transação.

## Segredos
Arquivos `.env` reais são ignorados. `SUPABASE_SERVICE_ROLE_KEY` é exclusivamente server-side e usada apenas para operações administrativas como convite de usuários. Nunca use prefixo `NEXT_PUBLIC_` para secrets.

## Integrações externas
Mensagens para WhatsApp/Instagram/Facebook/e-mail não são simuladas. Sem um provedor oficial configurado, a API retorna erro explícito e não registra envio falso.
