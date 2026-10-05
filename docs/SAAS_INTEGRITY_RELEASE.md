# Ecojoi CRM — integridade SaaS
Base preservada: main f69eff98f4dc348b4a651e2b3fee1668274fa040. A correção de runtime/cPanel dos PRs 32 e 33 permanece intacta.

## Escopo
A especificação INDENIZE foi usada como referência. Não foram criados módulos jurídicos, cálculos de indenização nem tabelas paralelas de leads, contatos, conversas ou mensagens.
As alterações reutilizam contacts, contact_channels, conversations, messages, integration_events, outbound_message_queue, webhook_deliveries, webhook_subscriptions, webhook_secrets, pipelines, pipeline_stages_v2, ai_knowledge_documents e ai_usage_logs.

## Comportamento
- Meta confirma recebimento após persistir a entrada. O worker processa com reserva, tentativas limitadas e fila de falhas. Eventos históricos ficam completed e não são reexecutados.
- Resolução de identidade e vínculo de canal usam transação e trava por empresa. Conversa aberta é reutilizada por contato/canal. Telefone compartilhado sem identidade específica exige revisão manual.
- Mensagens conservam a unicidade tenant/provider_message_id existente. Retry de mensagem já persistida não renova last_inbound_at.
- Atendimento humano exige proprietário atual. Mudanças de fila e oportunidade usam atualização condicional e retornam 409 em conflito.
- Pipeline usa os registros existentes. Etapas personalizadas conservam as seis categorias de relatórios/automações; pipeline_stage_id guarda a etapa real. Retirada/exclusão de etapa ocupada é bloqueada no banco.
- Webhooks têm edição, pausa, teste enfileirado, rotação de segredo, histórico da última tentativa por entrega e reprocessamento. Segredos não aparecem em GET.
- IA tem decisões respond/clarify/escalate, limiar de confiança, limite de três respostas por última entrada, fallback para equipe e kill switch por empresa.
- Resposta da IA, mensagem, fila e auditoria são registradas atomicamente. Takeover cancela envios IA ainda pendentes.
- Conhecimento tem rascunho, publicação, retirada do agente e recuperação das vinte versões anteriores como rascunho. Documentos existentes continuam publicados.
- Conferência de telefones é paginada e somente leitura. Não há alteração ou fusão em lote de contatos.

## Preparação de publicação
Alvo exclusivo: projeto Supabase ECOJOI CRM (othhkdynxjjpldkreoqc), aplicação crm.ecojoi.com.br. Não executar migrações em outros projetos.
1. Confirmar snapshot/backup recuperável do banco e preservar o pacote cPanel que está em execução.
2. Pausar o agendamento dos workers durante a troca. Eventos de entrada antigos continuam respondendo conforme a versão em execução.
3. Aplicar 024 até 032, em ordem, via migrações do Supabase, conferindo cada resultado. São alterações aditivas e controles de integridade; não há exclusão em lote de dados.
4. Conferir configuração real de Meta, n8n/IA, WORKER_SECRET e identificadores por empresa. Nunca incluir segredos no repositório, relatório ou navegador.
5. Integrar a mudança depois das verificações do PR. A CI prepara cpanel-deploy mantendo o wrapper e runtime isolado já corrigidos.
6. Atualizar o repositório gerenciado e publicar no cPanel; reiniciar somente o serviço deste CRM.
7. Executar login, /api/health, abertura dos módulos e conferência de preservação dos contatos/conversas/mensagens anteriores.
8. Retomar o agendamento autenticado POST /api/workers/tick. Sem agendamento, entradas e respostas enfileiradas aguardam execução manual em Integrações.
9. Fazer um ensaio autorizado com conversa e número de teste: entrada Meta, mensagem persistida, IA, takeover, anexo, fila, webhook e retry.

Não publicar o frontend novo antes das migrações: as novas APIs precisam das funções e campos adicionados.
A migração 025 também corrige ai_usage_logs legado, no qual CREATE TABLE IF NOT EXISTS da 021 não havia criado total_tokens/request_id.

## Contrato do webhook de saída
Payload 1.0: event_id, event_type, occurred_at, source, entity_id, schema_version e data. Campos legados event/payload/delivered_at permanecem.
Headers: idempotency-key, x-ecojoi-delivery, x-ecojoi-event e x-ecojoi-timestamp (segundos UTC).
- x-ecojoi-signature: sha256=HMAC_SHA256(segredo, body).
- x-ecojoi-signature-v2: sha256=HMAC_SHA256(segredo, timestamp + "." + body).
O receptor deve verificar a assinatura sobre o corpo bruto, aceitar relógio com tolerância curta (por exemplo cinco minutos) e registrar event_id antes de produzir efeitos. Uma resposta 2xx encerra a entrega.
Retentativas podem repetir uma entrega aceita cuja confirmação se perdeu; idempotência do receptor é necessária. Não há garantia de exatamente uma chamada HTTP.
Somente HTTPS público é aceito. DNS privado/reservado é rejeitado, IP é fixado para a conexão e redirects não são seguidos. DNS tem limite de cinco segundos e requisição de doze segundos.

## Contrato da ponte IA e compatibilidade
O segredo mestre N8N_WEBHOOK_TOKEN ou AI_AGENT_WEBHOOK_TOKEN permanece somente no servidor. O token enviado à ponte é derivado por HMAC_SHA256(master, "ecojoi-ai-tenant:" + tenant_id), em base64url.
O workflow deve usar o Bearer recebido para responder a /api/ai-agent/reply e devolver event_id ou Idempotency-Key da entrada. Token da empresa A não autoriza resposta para B.
Workflows antigos que dependem do token mestre precisam ser adaptados antes de ativar o agente. Compatibilidade temporária é possível somente com AI_AGENT_LEGACY_TENANT_ID explicitamente vinculado à única empresa autorizada; o padrão não aceita token mestre no callback.
A ponte requer endpoint HTTPS público e token configurado. Falha ou ausência de configuração devolve atendimento automático para a equipe.
Texto antigo em body/response continua aceito. Mensagens WhatsApp fora da janela conhecida exigem template aprovado; ausência de last_inbound_at não abre artificialmente a janela.
Conteúdo e versões publicadas são enviados à ponte. Rascunhos e documentos retirados não entram no contexto.

## Resultado de envio incerto
A aceitação externa não pode ser revertida pelo banco. Confirmação de sucesso atualiza fila/mensagem/conversa em uma transação.
Aceite seguido de falha de persistência, falha de rede com resultado incerto ou reserva abandonada vão para conciliação manual, evitando reenvio automático que possa duplicar mensagem.
Rejeições confirmadas pelo provedor podem ser tentadas novamente. Mensagem já em trânsito no provedor não pode ser cancelada pelo takeover.

## Validação
- 111 testes em 15 arquivos: telefone, permissões, assinatura, destinos privados, IA por empresa, filas, retries, lease, migrações, conhecimento, etapas e identidade.
- Migrações executadas em PostgreSQL local via PGlite. Isso valida SQL, regras e atomicidade; não substitui ensaio de concorrência com múltiplas conexões no ambiente de homologação.
- Typecheck e build standalone.
- scripts/smoke-build.mjs usa configuração fictícia: login e JavaScript 200, /app redirecionado, APIs protegidas 401, banco/IA sem configuração 503. Não usa credenciais de produção.
- Navegador com dados fictícios: rascunho/publicação, etapa nova, etapa ocupada bloqueada, seletor e arrastar/soltar do Kanban, retry de webhook/entrada Meta, diagnóstico e viewport móvel.
- CI de PR é somente leitura no GitHub e não publica. Workflow de main mantém publicação da branch cpanel-deploy.

## Limites e evolução
Não foram validados envios reais de WhatsApp/Meta/n8n sem conectores e destinatário de teste configurados. Não há alegação de funcionamento externo 100%.
Persistência assíncrona completa foi adicionada ao conector Meta. APIs de outros conectores existentes mantêm seus contratos; idempotência da identidade não torna todos os efeitos arbitrários idempotentes.
Diagnóstico identifica compartilhamentos na página de 500 contatos; pesquisa de vínculo consulta o banco por empresa. Não há migração automática ou fusão de números legados.
Relatório de webhook mostra a última tentativa de cada entrega, não um registro separado para cada tentativa.
O arquivo de referência descreve uma base possível, não uma aprovação para apagar dados, aplicar migrações, compartilhar arquivos ou modificar outros projetos.

## Reversão
Preservar o snapshot do banco e os artefatos da versão atual antes da troca. Se a verificação falhar, voltar o pacote cPanel à versão f69eff98f4dc348b4a651e2b3fee1668274fa040 e reiniciar somente o CRM.
Manter as colunas aditivas e os dados novos até uma revisão específica de reversão de schema. Não remover mensagens, histórico ou contatos para voltar o código.
Desativar IA e pausar integrações com falha durante a investigação. A reversão da aplicação não desfaz chamadas já aceitas por provedores externos.

