# Neur.AI Etiquetas V2 — aplicativo web INDEPENDENTE

**Este aplicativo não pertence ao site da Droga Vida Popular.** É um site/web app privado, com sua própria interface, servidor de desenvolvimento, configuração e fluxo de implantação. O código permanece neste repositório apenas para revisão no PR #73, mas **nunca** é incluído no build dist/ do site existente. Não criar links, botões ou menus de etiquetas no painel da farmácia.

## Funcionalidades
- Layout preto/roxo responsivo para iPhone e desktop.
- Modelo V2 inspirado na foto: moldura preta, logo centralizada, nome, apresentação/tamanhos, preço atual grande e preço anterior riscado somente quando validado.
- A4: **2 × 4**, etiquetas de **90 × 61 mm**, intervalo 6 mm; grade centralizada com 12 mm horizontais e 17,5 mm verticais. Impressão em 100% sem cabeçalhos/rodapés.
- Cadastro e edição manuais; reorganizar/remover itens; importar CSV UTF-8 exportado do Excel (até 500 itens válidos).
- Consulta da Loja 2 pelas ações registration-search e registration-preview da função Trier existente, SOMENTE após login autorizado e origem CORS liberada.
- Consulta do monitor via ação labels-history da função Trier proposta no PR #73, após migração e deploy coordenados.
- Demonstração local sem credenciais reais; **preços fictícios recebem marca d'água na impressão**.
- Não cria pedidos, não faz baixa de estoque, não altera preços no ERP e não publica produtos.

## Executar localmente
Node.js 22+; sem dependências externas.

    cd etiquetas-app
    npm run dev

Abra http://127.0.0.1:4273. Clique em **Experimentar com dados fictícios**. O servidor serve somente os arquivos da pasta independente.

Testes:

    npm test

## Ativação de dados reais — NÃO realizada
1. Hospedar os arquivos de etiquetas-app em **endereço separado** (domínio/subdomínio exclusivo). NÃO publicar em /admin e NÃO copiar para dist/ do site comercial.
2. Preencher apenas supabaseUrl e supabasePublishableKey em config.js com valores públicos da instância existente; nunca colocar tokens de integração ou chaves secret/service_role.
3. Autorizar a origem HTTPS EXATA do novo endereço em SITE_ORIGINS da Edge Function trier-api. A função usa allowlist CORS; liberar somente depois de confirmar o endereço.
4. O aplicativo usa Supabase Auth e confere team_members ativo; o backend verifica independentemente sessão e permissão. Não habilitar signup público.
5. Antes de ativar o monitor, revisar a migration de label_price_changes, aplicá-la em staging, testar a segurança e implantar a Edge Function trier-api de forma coordenada.
6. A Loja 1 permanece manual/CSV até aprovação de integração própria; nunca reutilizar silenciosamente o preço da Loja 2.
7. Proteger o domínio independente com login. O modo demonstração é público se a aplicação for hospedada publicamente, mas não acessa dados reais.

## Impressão
Em Chrome/Edge/Safari selecione A4, escala 100%, impressão de fundos e sem cabeçalhos/rodapés. Imprimir uma folha teste em papel comum, medir 90 × 61 mm com régua e confirmar nitidez/recorte na impressora da farmácia.

**Logo:** na etapa de protótipo a URL pública da logo institucional é usada apenas para exibição, sem alterar o site. Antes do deploy, copiar a imagem original para a hospedagem **independente** para impressão autocontida.

## Limitações
- Login e lote são mantidos apenas na memória da aba; sair limpa a sessão.
- O token Trier fica exclusivamente no servidor Supabase.
- Não existe integração real no modo demonstração.
- Não há histórico de lotes impressos no banco nesta primeira versão.
- CSV inválido não modifica catálogo; erros por linha.
- Importação direta de XLSX é futura: exportar CSV UTF-8.
