# Trier — preços e estoque + WhatsApp

## Escopo atual (22/10/2026)

Somente leitura da API SGF LTS: `/rest/integracao/produto/obter-v1`, com Bearer no servidor, filtros `codigo` repetidos e paginação `primeiroRegistro`/`quantidadeRegistros`. Contrato oficial em `official-contract.js`. A filial é 2; não há soma de estoque entre unidades.

O preço usa `valorVendaEcommerce` quando informado e `valorVenda` como alternativa. Não se presume aplicação de `percentualDesconto` sobre um preço que pode já incluir regras do ERP. Estoque usa `quantidadeEstoqueEcommerce` quando informado, senão `quantidadeEstoque`. O pré-pedido pelo WhatsApp exige produto ativo na Trier e estoque positivo. A opção `integracaoEcommerce` não bloqueia esse fluxo: não se cria venda no ERP. Produtos inativos e saldos zero/negativos continuam bloqueados; o catálogo publicado também precisa manter o produto ativo. A liberação só acontece após nova consulta validada, nunca por alteração manual da disponibilidade no cache. Códigos são associados aos produtos e variantes do catálogo; o item de taxa 46295 fica excluído.

A função grava estoque/preço em cache privado com auditoria. O site consulta uma lista reduzida dos itens publicados, sem consultar a Trier por visitante. O Supabase Cron verifica a cada 5 minutos se uma consulta é elegível; o intervalo mínimo real continua em 15 minutos, com lease compartilhada para impedir duplicatas. GitHub Actions e painel permanecem como execução manual/recuperação, sem segundo agendamento periódico. O navegador usa dados com até uma hora e mantém o catálogo publicado como alternativa em falhas ou dados antigos. Preços e estoque continuam sujeitos à confirmação no WhatsApp.

O cliente continua concluindo o pré-pedido pelo WhatsApp. Não há endpoint de criação de venda, envio de pedido à Trier, baixa de estoque, cobrança ou dados de cliente transmitidos à Trier nesta implementação. A opção de pedidos diretos foi adiada por solicitação do responsável.

Configuração: secrets `TRIER_BASE_URL`, `TRIER_API_TOKEN`, `TRIER_STORE_ID`, `TRIER_INTEGRATION_ENABLED`, `TRIER_SYNC_ENABLED`. O token nunca é incluído no site ou repositório. Migration aditiva `20261021170000_trier_activation.sql` mantém vínculos de códigos existentes, com reset de cache quando o operador troca um código. Tabelas e RPCs continuam restritas a service_role. Não reaplicar a migration inicial em produção.

Referência: https://api-sgf-doc.triersistemas.com.br/api/lts/sgf/openapi.json

---

## Histórico da preparação anterior (substituído pelo escopo acima)

# Preparação Trier — integração desativada

O site estático, painel, catálogo e publicação existentes são preservados. Nenhum arquivo visual é modificado. O catálogo atual é JSON em `catalog_draft` e snapshots em `publications`; possui `shortCode`, `barcode`, `priceCents`, `stockQuantity` e variantes. Não existe tabela `products` a alterar.

## Arquitetura e fluxo

Trier REST → TrierClient (servidor Supabase Edge Function) → contrato oficial/decoder → mapper normalizado → InventoryService → RPC transacional → cache `trier_inventory` → GET interno público → frontend futuro.

O contrato oficial ainda é `null`, portanto mesmo habilitar a integração não realiza chamadas sem documentação. O decoder deverá também implementar paginação documentada e consulta em lote; o mapper recebe campos canônicos internos, não campos presumidos da Trier. A política de status e unidade monetária será definida explicitamente. Nenhum mock é conectado ao runtime.

## Configuração

Somente servidor: TRIER_BASE_URL, TRIER_API_TOKEN, TRIER_STORE_ID, TRIER_INTEGRATION_ENABLED=false, TRIER_SYNC_ENABLED=false, TRIER_SYNC_INTERVAL_MINUTES=15, TRIER_TIMEOUT_MS=10000, TRIER_MAX_RETRIES=2. Armazenar secrets no ambiente Supabase. Os exemplos não contêm credenciais. O build usa lista explícita de arquivos públicos e não inclui a integração.

Limites adicionais somente no servidor: `TRIER_MAX_RESPONSE_BYTES=2097152` (2 MiB, ajustável de 1 byte até 10485760 bytes/10 MiB), `TRIER_MAX_PRODUCTS=10000` (de 1 até 100000 itens) e `TRIER_SYNC_DEADLINE_MS=120000` (120 segundos, de 100 até 300000 ms/5 minutos). Configuração fora desses intervalos é rejeitada. A resposta é lida em fluxo com limite de bytes antes de interpretar o JSON; resposta ou lote acima do limite é rejeitado sem aplicar seus itens. O prazo total é compartilhado entre aquisição, repetições e início das escritas. Após expirar, nenhuma nova escrita de estoque é iniciada; uma operação no banco já iniciada pode terminar. A finalização registra o erro controlado e preserva os itens anteriores, inclusive alterações já concluídas nesta execução. Os limites não substituem paginação e política de lotes oficiais.

## Persistência e associação

Migration aditiva `20261013120000_trier_inventory.sql`: cache, estado da sincronização, auditoria e RPCs restritas a service_role. RLS permanece ativo; anon/authenticated não acessam essas tabelas. Não altera os documentos nem publica mudanças automaticamente.

Cada vínculo contém product_id, variant_id (0 para produto principal), identificador oficial opcional, código reduzido opcional, EAN opcional e uma única store_id. Códigos mantêm zeros à esquerda. Antes de ativar, inserir vínculos revisados pelo operador em ambiente confiável, conferindo o produto/variante existente no catálogo. Sem vínculo, o item é ignorado. Correspondência segue identificador oficial → código reduzido → EAN; conflitos são rejeitados, nunca se usa nome. Índices únicos impedem vínculos duplicados. Nenhuma soma entre filiais. Trocar a filial exige procedimento explícito de revisão do cache.

Campos: external_name, external_description, external_price_cents (inteiro), stock_quantity (numérico), availability, external_status, last_trier_sync_at. O preço omitido mantém o anterior. O histórico grava valor anterior/novo em transação com a atualização. Dados adicionais poderão ser acrescentados no adapter/tipos após documentação; raw externo não é persistido nem exposto.

## Consulta, sincronização e fallback

GET `/functions/v1/trier-api?productId=<id>` consulta somente cache dos produtos ativos no último catálogo publicado e retorna estoque, disponibilidade, centavos, última atualização e variantes. Não chama Trier. Se ainda não houver snapshot publicado retorna 404; falta de cache retorna lista vazia, nunca estoque zero fictício.

POST com `{action:"status"}` ou `{action:"sync"}` valida sessão e admin/owner ativo com origem permitida. Chamadas periódicas usam exclusivamente service_role; integração e sync precisam estar habilitadas. Não há cron instalado nem polling. Após documentação, configurar scheduler confiável chamando o mesmo endpoint. Atualização sob demanda exige ação administrativa explícita; intervalo mínimo e lease compartilhada no banco impedem repetição por renderização e concorrência. Cada execução recebe um UUID: escritas e finalização exigem esse UUID e lease vigente; uma execução expirada ou substituída não pode sobrescrever/finalizar a atual. Lease expira após 30 minutos; revisar duração máxima e tamanho de lote antes de ativar. Falha ao finalizar mantém lease até expiração.

Erros 400/401/403/404 não são repetidos; 429/500/502/503/504 e falhas de rede/timeout têm até duas repetições com backoff e jitter. JSON/schema inválidos interrompem aquisição sem apagar cache. Item inválido é ignorado mantendo o anterior. Logs contêm somente códigos controlados e contagens; não contêm corpo externo, headers, URL ou token. Respostas administrativas nunca exibem secrets. DTO público usa lista explícita de campos.

## Testes e limites

## Autenticação do ambiente Supabase

Chamadas de servidor aceitam uma chave secreta atual no header `apikey`, comparada exclusivamente com o dicionário `SUPABASE_SECRET_KEYS` injetado pelo Supabase, ou a chave legada exata no header Authorization. Uma chave pública nunca autoriza sincronização; conteúdo/role de JWT sem verificação nunca é confiado. Sessões administrativas continuam validadas por Auth.getUser e vínculo ativo. Não é necessário criar nem copiar uma chave nova. O cliente privilegiado usa a chave secreta injetada, com fallback para a legada. Referência: [variáveis oficiais do Supabase](https://supabase.com/docs/guides/functions/secrets).

## Validação e implantação

Mocks exclusivamente em `tests/trier.test.mjs`: contratos fictícios em example.invalid e status MOCK_ACTIVE/MOCK_BLOCKED. Testes de mapper, centavos, códigos/EAN, estoques, status, erros, retries, fallback, sanitização, SQL/RLS/auditoria, lease expirada/substituída e identificadores conflitantes entre registros. Aplicar migration primeiro em banco local/staging e validar funções antes de implantação. Implantar somente no projeto confirmado `bzhsnoqlbhjaaheugpku`, mantendo a integração desligada; não reaplicar migrations anteriores.

## PENDENTE DA TRIER

- Base URL oficial, token e identificador da filial escolhida.
- Método de autenticação e headers obrigatórios.
- Endpoints, paginação e endpoint em lote.
- Limites/rate limit, Retry-After e política de timeout.
- Estruturas JSON oficiais e dados adicionais.
- Códigos/status e regras de bloqueio de venda.
- Unidade/formato dos preços e regras de estoque (inclusive reservas/frações).
- Possíveis webhooks e autenticação dos eventos.
- Documentação oficial.

Após documentação: implementar contrato/decoder e política real, revisar vínculos, definir limite de lote/lease e agendamento, executar uma consulta controlada somente leitura pelo backend e conferir cache. Nenhuma chamada de produção pode ser validada nesta fase.

Antes dessa documentação, a preparação pode ser validada com contratos fictícios e testes locais, mas não está conectada à Trier. O contrato continua explicitamente `null`: habilitar as flags não cria endpoints, autenticação ou regras de venda presumidas. Os limites de recursos, autorização e cache são preparativos; prontidão operacional exige o contrato oficial, configuração revisada, migration validada no ambiente de destino e a consulta controlada descrita acima.

## Sincronização confiável — 22/10/2026

Migration `20261022150050_reliable_trier_scheduler.sql` habilita pg_cron e pg_net e instala o job `trier-inventory-sync` inicialmente desativado. Após implantar a Edge Function compatível, ativar o job pelo proprietário do banco. A capacidade aleatória é gerada no banco e guardada no Vault; não é uma chave administrativa, não sai para o frontend e autoriza somente a ação sync. Funções, Vault e schemas do agendador não são acessíveis por anon/authenticated. O job consulta lease/intervalo antes de enfileirar HTTP; a RPC existente confirma a posse atomicamente.

Persistência usa no máximo quatro RPCs simultâneas. Cada uma preserva validação de código, filial, lease e auditoria; todas as operações iniciadas são aguardadas antes da finalização. O prazo total e a expiração pública de uma hora continuam iguais. Falhas temporárias ao consultar o andamento pelo GitHub repetem somente a leitura de status, sem iniciar a remarcação ou sincronização novamente.
