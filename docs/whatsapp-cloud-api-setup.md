# WhatsApp Business Cloud API — ativação segura

Esta alteração preserva os canais existentes, especialmente a Evolution API. Não altera automaticamente o provedor ativo nem cria disparos.

## Credenciais de produção

No ambiente **servidor** do cPanel, configure (nunca com prefixo `NEXT_PUBLIC_`):

- `META_GRAPH_ACCESS_TOKEN`: token de usuário do sistema com permissões `whatsapp_business_messaging` e `whatsapp_business_management` e acesso aos ativos corretos;
- `META_APP_SECRET`: segredo do aplicativo Meta, usado na autenticação HMAC dos webhooks;
- `META_WEBHOOK_VERIFY_TOKEN`: string aleatória forte criada para validar a assinatura inicial do webhook;
- `META_GRAPH_API_VERSION`: versão da Graph API suportada pelo aplicativo (opcional, o código atual usa v23.0 como padrão).

No ECOJOI CRM, em **Configurações**, cadastre o WhatsApp Business Account ID (WABA ID) e o WhatsApp Phone Number ID. O Meta Business ID é opcional para envio do WhatsApp e serve como identificador administrativo.

## Configuração na Meta

1. Confirme o portfólio empresarial, o aplicativo e os ativos de WhatsApp associados ao usuário do sistema.
2. No aplicativo Meta/WhatsApp, configure a URL pública **https://crm.ecojoi.com.br/api/integrations/meta/webhook** e o mesmo `META_WEBHOOK_VERIFY_TOKEN` armazenado no servidor.
3. Inscreva o aplicativo no evento `messages` da conta do WhatsApp Business. A aprovação do webhook exige HTTPS acessível publicamente.
4. Configure eventuais modelos de mensagens e número comercial conforme requisitos da Meta.
5. No CRM, abra **Integrações → WhatsApp → Meta Cloud API**, selecione o provedor e clique em **Testar conexão oficial**.

## Interpretação do diagnóstico

- **Token e ativos Meta válidos**: o servidor conseguiu consultar o telefone e a WABA pela Graph API. Não significa que o webhook ou os envios já estejam operando.
- **Segredos do webhook configurados**: há valores no ambiente do servidor, mas a inscrição e a entrega de eventos ainda precisam ser confirmadas no painel Meta.
- **Conexão ainda não validada**: confira o token, privilégios e identificadores.

## Checklist antes do deploy em produção

1. Revisar PR e rodar `npm run typecheck`, `npm test`, `npm run build`.
2. Publicar pelo fluxo já existente de `cpanel-deploy` sem alterar ou apagar variáveis e dados ativos.
3. Confirmar que os IDs da empresa estão corretos e o botão de diagnóstico mostra conexão válida.
4. Verificar o webhook GET pelo challenge da Meta e POST assinado pelo aplicativo, sem registrar segredos.
5. Executar envio e recebimento reais com um número autorizado; verificar armazenamento de histórico e estado de entrega.
6. Testar que a Evolution API continua funcional e que não houve regressão em outros módulos.

**Segurança:** não copie tokens para GitHub, capturas de tela, logs ou conversas. A verificação foi intencionalmente feita somente no backend com permissão `settings.view`, sem retornar token ou erros brutos da Graph API.
