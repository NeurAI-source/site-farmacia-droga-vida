# Preço normal e promocional da Trier

A integração existente da loja 2 consulta também
`/rest/integracao/produto/desconto/melhor/obter-todos-v1` em páginas de até 500
registros. Não há consulta por visitante nem escrita no ERP. O token continua
somente nos secrets já configurados da Edge Function `trier-api`.

São aceitos somente pares explícitos `valorVenda` / `valorPromocao`, positivos,
em centavos exatos, com preço promocional menor, código único e sem condição de
pagamento específica. Campos de condição ausentes, duplicados ou valores inválidos
não autorizam promoção. Um preço específico de e-commerce diferente do preço base
é preservado. Não se reaplica o percentual de desconto.

A varredura é limitada a 20 mil registros e a até 30 segundos,
reservando tempo para a gravação já existente. Resultado parcial ou falha não é
usado: mantém preço normal e estoque, limpa a promoção do cache e informa
`discountStatus: unavailable` no resumo da sincronização. Uma próxima execução
pode recuperar os descontos sem reaplicar remarcações.

A migration aditiva `20261021232807_trier_promotional_prices.sql` adiciona
`external_regular_price_cents` ao cache existente, valida o par e preserva o mesmo
lease, vínculo por código/variante/filial, auditoria e permissões. Não muda o JSON
do catálogo, preços editoriais, produtos, estoque no ERP ou imagens.

O DTO público inclui `regularPriceCents`. Cards e página individual mostram o
preço normal riscado junto ao promocional. Variantes usam seu próprio par; a
vitrine mostra o par da apresentação com menor preço. Carrinho e mensagem de
WhatsApp usam o preço efetivo. A atualização periódica atualiza também os preços
visíveis e remove dados com mais de uma hora, conforme a política existente.

A API de melhor desconto não fornece validade da oferta nesse DTO. A informação
é uma consulta de preço da Trier no momento da sincronização, não uma garantia de
validade futura; disponibilidade, preço e entrega continuam sujeitos à confirmação
no atendimento. Sem par válido, exibe-se somente o preço de venda.

Testes usam fixtures, banco local PGlite e APIs interceptadas, incluindo WebKit
com perfil iPhone. Nenhum produto real é usado como dado de teste de escrita.

Se o preço atual do produto já for exatamente o `valorPromocao` do par universal
confirmado, o preço atual é mantido e o `valorVenda` da mesma oferta é anexado
como De. A comparação usa centavos exatos, código único e as mesmas validações
de condição de pagamento. Preço de e-commerce diferente tanto do normal quanto
do promocional continua preservado sem De presumido.
