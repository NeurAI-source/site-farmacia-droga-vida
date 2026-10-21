# Carrinho adicional e estoque público — 21/10/2026

O site atual continua sendo a referência visual. Cabeçalho, carrinho do topo,
banner, carrossel, categorias, cores, fontes e imagens não são redesenhados.
As regras também estão em `AGENTS.md` para futuras alterações.

O carrinho flutuante e o botão do topo usam o mesmo estado e armazenamento
`dv-cart`. Adicionar abre o pré-pedido em forma de conversa. Produtos, quantidades,
recebimento e revisão da mensagem ficam na janela, sem voltar ao início. A página
individual abre o mesmo carrinho sem redirecionar o cliente à home. Fechar ou
continuar comprando preserva a posição da página. Dados de nome/bairro ficam
somente em memória; WhatsApp continua no número existente e não envia mensagens
automaticamente. Não há pagamento, reserva ou baixa de estoque.

Todos os cards ativos e detalhes mostram estoque da loja 2 pelo cache público
da Trier. Tamanhos mostram seus próprios saldos; a quantidade por embalagem não
é confundida com pacotes disponíveis. Sem variantes, a quantidade é expressa na
unidade de venda. Saldo antigo do JSON nunca é apresentado como confirmado.
Sem vínculo, dado inválido ou cache com mais de uma hora, aparece consulta de
disponibilidade; zero confirmado é esgotado. Itens bloqueados pela Trier não
são anunciados como disponíveis, mesmo com saldo positivo.

O navegador revalida somente o cache já existente a cada minuto e ao voltar à
aba. Não consulta a Trier por visitante. O workflow de sincronização existente
também roda quando `product-stock.js` entra na main, para atualizar o cache na
ativação. Conserva agendamento, credenciais, intervalo mínimo e lease existentes.
Não há alteração de banco, Edge Function, permissões, preços do catálogo ou
cadastros. A precedência de preços da Trier continua a mesma.

Testes usam somente catálogo local e APIs interceptadas. Cobrem carrinho comum
e flutuante, tamanhos, estoque ausente/zero/antigo, limites, entrega/retirada,
mensagem WhatsApp interceptada e ausência de persistência dos dados pessoais.
