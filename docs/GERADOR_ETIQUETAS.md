# Neur.AI Etiquetas — projeto técnico e protótipo (10/11/2026)

## Situação
Esta branch é **uma proposta em desenvolvimento, ainda não publicada**. O site de vendas, o carrinho, a publicação de produtos e o backend Trier em produção não devem ser alterados automaticamente.

### Implementado nesta branch
- Nova seção no painel administrativo existente: **Etiquetas de preços**.
- Interface responsiva em preto/roxo sem alterar o tema do site público.
- Cadastro manual de produto, apresentação, código, preço anterior e preço atual.
- Pesquisa pelo Trier SGF via ações já existentes do endpoint autenticado:
  - POST trier-api com action "registration-search", mode, query, offset 0, activeOnly false
  - POST trier-api com action "registration-preview", codes [codigo], para rever preço **antes** de adicionar; nesta etapa, 1 código por vez.
- Separação explícita por filial: ERP conectado = **filial 2**; filial 1 = importação CSV/manual, sem supor que preços sejam os mesmos.
- Importação de CSV UTF-8 com cabeçalho: codigo;produto;tamanhos;de;por;loja. Até 500 linhas válidas; erros linha a linha. Excel pode exportar como CSV.
- Organização de lotes com remover, subir/descer e limpar.
- Documento de impressão com **A4 / 2 colunas × 4 linhas** (até 8 etiquetas por página), escapando caracteres especiais e mostrando marca, apresentação, preço "de" quando comprovado, preço "por", loja e código.
- Exemplo de demonstração marcado como fictício.
- Monitor de remarcações: UI + ação segura labels-history + RPC de histórico (exige aplicação coordenada da migração e deploy da função).

### Não implementado nesta primeira entrega
- Publicação/merge/deploy em produção; este trabalho **não** altera a instalação real.
- Credenciais/consulta de preços da unidade 1 na Trier; validar autorização para acesso à filial.
- Importação direta de XLSX: usar CSV UTF-8 até a próxima etapa.
- Persistência em servidor dos lotes e histórico de impressões; lote em memória da aba.
- Notificação automática ou scheduler adicional: a interface consulta histórico quando o operador solicita.
- Impressão térmica, calibragem física com cada impressora e leitor de códigos de barras por câmera.
- Foto/imagem do produto nas etiquetas (prioridade é legibilidade no papel).

## Arquitetura
1. Browser: sessão Supabase do painel existente, checagem de equipe ativa. Admin/labels.js apresenta consulta, lote e monitor. Admin/labels-core.js trata centavos, CSV, validação e documento de impressão.
2. Trier (servidor): reutilizar funções existentes, segredos protegidos no Supabase, endpoint documentado SGF LTS. **Nunca** transmitir Bearer Trier ao navegador.
3. Leitura de preços para rótulos: a consulta registration-search descobre um item; registration-preview verifica preço e melhor desconto. ValorVendaEcommerce tem precedência sobre valorVenda; descontos não são recalculados no browser.
4. Auditoria: trier_inventory_audit (existente) guarda previous_value/new_value. A nova função SQL filtra somente diferenças de external_price_cents, excluindo eventos apenas de estoque. Filtro por store_id. labels-history limita resposta aos 100 mais recentes e exige sessão válida + vínculo ativo da equipe no servidor.
5. Impressão: HTML/CSS auto-contido criado somente no evento de clique; navegador gera PDF/impressão. Não exige serviço externo de renderização.

## Medidas de impressão
- A4: 210 × 297 mm.
- Margem lógica CSS @page: 8 mm nos quatro lados.
- Área útil: 194 × 281 mm.
- Duas colunas de **90 mm**, quatro linhas de **61 mm**.
- Espaçamento entre células: **6 mm** (3 espaços verticais, 1 horizontal); grade centralizada em A4, com margens externas finais de 12 mm na horizontal e 17,5 mm na vertical.
- Cortes feitos pelo espaço entre as etiquetas; sem marcas de corte.
- Testar em papel A4 real: escala **100%**, sem cabeçalhos/rodapés automáticos do navegador. Algumas impressoras têm margens não imprimíveis; ajuste após medição física. print-color-adjust: exact solicita fundo escuro no cabeçalho, mas a impressão de fundos também depende da opção do navegador/impressora.

## Template oficial visual — revisão de 10/11/2026
- Inspiração direta no modelo físico enviado pelo responsável: moldura preta grossa (1,7 mm), faixa preta superior (9,8 mm) e **logo centralizada**.
- Campo branco sem elementos desnecessários: nome maiúsculo, apresentação/tamanhos, preço atual bem grande e preço anterior riscado e discreto no canto inferior esquerdo.
- Preços não apresentam código, filial, status nem linhas de controle no papel; esses dados permanecem no lote do painel.
- Nome com ajuste de tipografia conforme extensão para evitar extrapolar a etiqueta.
- O painel de impressão usa a logo original do site (assets/logo.png). A amostra PDF é uma demonstração visual construída a partir do recorte da foto enviada e **não é um arquivo de preço válido**.
- Aprovação final depende de impressão em papel na impressora real da farmácia, além de conferência de margens, nitidez da logo e recorte.

## Regras comerciais e segurança
- Nunca tratar "preço anterior" na auditoria como um preço promocional de/por: **histórico de remarcação** e **preço de comparação comercial** são conceitos diferentes.
- Só mostrar preço anterior no rótulo Trier quando discountStatus for "checked" e regularPriceCents > priceCents. Não inventar promoção em falha ou timeout de desconto.
- CSV/manual exige conferência humana; qualquer etiqueta sem consulta fresca é manual/CSV na lista.
- A filial 2 não autoriza copiar preços para filial 1. Uma integração de filial 1 exige credenciais e configurações independentes, se suportadas oficialmente.
- Os dados não atualizam o catálogo, trier_inventory ou o ERP.
- A função label_price_changes usa SECURITY INVOKER, com EXECUTE somente para service_role; anon e authenticated não têm execução. A Edge Function trier-api verifica sessão, membro ativo e quota antes de ler o histórico.
- Não disponibilizar link de acesso ao painel no site público; usar o caminho reservado já existente do build (ADMIN_PANEL_PATH).

## Layout do código
- admin/labels.js — interface + conexão ao endpoint autenticado.
- admin/labels-core.js — CSV, centavos, dados impressos e HTML A4.
- admin/labels.css — responsividade e tema do módulo.
- admin/admin.js e admin/index.html — montagem e rota interna protegida.
- scripts/build.mjs — cópia explícita do novo CSS.
- supabase/functions/trier-api/handler.js — nova ação administrativa labels-history.
- supabase/migrations/20261110090000_labels_price_history.sql — RPC restrita.
- tests/labels.test.mjs — verificações automatizadas.

## Critérios de aceite antes de produção
1. Rodar npm ci, npm test, npm run build com ambiente local apropriado; confirmar que labels.css está presente no diretório reservado do painel.
2. Conferir papéis: sem sessão / sem equipe ativa não acessam; equipe válida consegue consultar a Trier; histórico somente por endpoint autorizado; anon não executa a RPC.
3. Conferir 1, 8, 9 e 16 etiquetas; preços com vírgula e centavos; nomes longos e HTML potencialmente malicioso; navegador Safari do iPhone e desktop.
4. Testar CSV com aspas e ponto e vírgula no nome, linhas inválidas e arquivo de 1 MB.
5. Em banco **de testes** aplicar migration e executar label_price_changes com uma variação de estoque somente e uma alteração de preço, incluindo casos de preço ausente. Confirmar separação por loja.
6. Implantação coordenada: migration aprovada, npm run prepare:functions, deploy da nova versão trier-api, revisão da rota administrativa, merge e publicação do frontend após aprovação. **Não executar seed nem reaplicar migrações já instaladas.**
7. Imprimir 1 folha teste e medir margens, fonte e espaço de recorte na impressora usada pela farmácia.
8. Testar exceções/quotas do SGF com operador autorizado, sem expor resposta bruta de terceiros.

## Evolução planejada
- Lotes salvos em banco e histórico de reimpressão com estado: rascunho, pronto, impresso, cancelado.
- Importação XLSX com validação por linha; seleção e edição em massa.
- Impressão agrupada por loja; variantes da mesma família em etiqueta única, incluindo regras de tamanhos/preço.
- Filtros avançados de remarcação: dia, loja, operador, desconto e preço antigo/novo.
- Integração independente para preços da Unidade 1 após confirmar escopo com a Trier.
- Alertas de divergência de preço entre ERP, rascunho do catálogo e última etiqueta efetivamente impressa.
