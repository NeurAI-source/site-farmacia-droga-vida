# Droga Vida Popular

Site responsivo da Droga Vida Popular, com catálogo atualizado pelo painel, imagens, preços, tamanhos, busca, categorias, favoritos e pré-pedido. O cliente revisa o pré-pedido e conclui o atendimento pelo WhatsApp da loja.

## Executar

Requer Node.js 22 ou superior.

```sh
npm ci
npm run dev
npm test
npm run build
```

Abra http://127.0.0.1:4173. `dist/` contém o site estático para hospedagem, inclusive em um subdiretório.

## Dados e manutenção

- Fonte: https://site-do-erick.erick-fabrini3.chatgpt.site/ — importação em 26/09/2026.
- `catalog.json`: produtos, categorias, preços em centavos e tamanhos. Imagens em `assets/products/`.
- `index.html`: endereços, horários, telefones e conteúdo institucional.
- `app.js`: atendimento pelo WhatsApp `5517996630482`.
- `styles.css`: layout responsivo, cores e tipografia.
- A foto da família foi gerada para este projeto. Logo, produtos e fotos das lojas vieram do site fornecido.

O catálogo inicial foi importado da fonte indicada. A integração Supabase permite editar rascunhos e publicar pelo painel depois da ativação descrita em [SUPABASE-SETUP.md](SUPABASE-SETUP.md). Não há pagamento online. Carrinho e favoritos ficam no navegador; falhas de armazenamento não impedem o uso.

As alegações do mockup sobre entrega nacional, parcelamento em 12 vezes e mais de 20 anos não foram usadas porque não constam na fonte real. Categorias sem produtos oferecem consulta à equipe, sem inventar itens ou preços.

## Página individual de produto (reversível)

A página individual `produto.html?id=<ID>` pode ser ativada e desativada no painel administrativo em **Visão geral → Nova página individual de produto**. A flag `expandedProductPage` no catálogo publicado controla o comportamento; quando desligada, o modal antigo continua funcionando. O catálogo e os dados dos produtos são preservados.

O cadastro aceita EAN e campos editoriais opcionais: descrição completa, para que serve, benefícios, modo de uso, advertências e características técnicas. Campos sem informação verificada ficam ocultos no site. Textos anteriores podem ser restaurados pelo histórico no painel, sem reverter preço ou estoque.

O pré-pedido permanece no WhatsApp; o estoque não é integrado a sistemas externos e deve ser confirmado por atendentes.

## Verificação

`npm test` verifica busca por acentos, categorias, integridade dos arquivos, cálculo em centavos, variantes e recuperação segura do carrinho. Validar também visualmente em desktop e celular antes de publicar alterações.

O carrinho prepara um PRÉ-PEDIDO com nome, forma de recebimento e bairro obrigatório para entrega. O cliente pode visualizar o texto antes de abrir o WhatsApp. Os dados de atendimento ficam apenas na memória da página, sem gravação no navegador ou servidor.

## Painel administrativo — Supabase conectado

Acesse `/admin/` pelo link separado. Sem configuração do Supabase, o painel fica bloqueado e mostra conexão pendente. A integração inclui login, autorização por perfil, rascunho na nuvem, upload de imagens, publicação pelo GitHub Actions e métricas de acesso. Só administradores cadastram usuários e publicam; editores alteram o catálogo. Categorias e lojas continuam somente para consulta. O botão Exportar baixa uma cópia e não publica. Auth, RLS, Storage e publicação pelo painel foram verificados no projeto conectado. Consulte o guia para reinstalação e renovação do token de publicação.

## Código reduzido e Neur.AI

No cadastro/edição, informe o **Código reduzido** usado pela farmácia. Ele é salvo
como `shortCode` no JSON do produto, separado do ID interno. Zeros à esquerda
são preservados. Produtos antigos podem continuar sem código até serem revisados;
códigos preenchidos não podem se repetir (sem diferenciar maiúsculas/minúsculas).
A pesquisa administrativa também encontra esse código.

O botão **Neur.AI**, no canto inferior direito após o login e carregamento do
catálogo, abre a remarcação em lote. Cole até 100 linhas no formato:

```text
001234 19,99
5678 8,50
```

Clique em **Analisar lote**, confira o produto e os preços atual/novo e confirme.
Qualquer linha inválida, código desconhecido ou repetido bloqueia o lote inteiro.
O salvamento usa a mesma RPC `save_catalog`, com versão esperada, e mantém o
fluxo existente de rascunho e publicação. Nenhum preço muda antes da confirmação.
O check-up aponta códigos ausentes, possíveis cadastros duplicados e preços
anteriores que precisam de revisão. A análise é local e não exige uma API de IA.

Esta adaptação não transfere métricas, leitura de fotos/OCR nem o banco de dados
do painel hospedado no ChatGPT. O projeto GitHub ainda não coleta interesse por
produto, portanto não apresenta rankings fictícios. Os códigos reais precisam
ser preenchidos nos produtos existentes; IDs internos não são usados como códigos.

Não há migração de banco para o campo: o catálogo existente usa JSONB. Após
incorporar o código, publique a interface pelo workflow **Publicar site** (Actions,
Run workflow, branch `main`, `publication_id` vazio), que mantém a última versão
publicada do catálogo. Para também atualizar a validação na função de publicação,
execute `npm run prepare:functions` e faça o deploy de `admin-api` conforme
`SUPABASE-SETUP.md`. Não execute o seed para esta atualização.
