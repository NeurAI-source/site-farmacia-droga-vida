# Preparação Trier — integração desativada

O site estático, painel, catálogo e publicação existentes são preservados. Nenhum arquivo visual é modificado. O catálogo atual é JSON em `catalog_draft` e snapshots em `publications`; possui `shortCode`, `barcode`, `priceCents`, `stockQuantity` e variantes. Não existe tabela `products` a alterar.

## Arquitetura e fluxo

Trier REST → TrierClient (servidor Supabase Edge Function) → contrato oficial/decoder → mapper normalizado → InventoryService → RPC transacional → cache `trier_inventory` → GET interno público → frontend futuro.

O contrato oficial ainda é `null`, portanto mesmo habilitar a integração não realiza chamadas sem documentação. O decoder deverá também implementar paginação documentada e consulta em lote; o mapper recebe campos canônicos internos, não campos presumidos da Trier. A política de status e unidade monetária será definida explicitamente. Nenhum mock é conectado ao runtime.

## Configuração

Somente servidor: TRIER_BASE_URL, TRIER_API_TOKEN, TRIER_STORE_ID, TRIER_INTEGRATION_ENABLED=false, TRIER_SYNC_ENABLED=false, TRIER_SYNC_INTERVAL_MINUTES=15, TRIER_TIMEOUT_MS=10000, TRIER_MAX_RETRIES=2. Armazenar secrets no ambiente Supabase. Os exemplos não contêm credenciais. O build usa lista explícita de arquivos públicos e não inclui a integração.

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
