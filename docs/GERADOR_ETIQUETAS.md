# Neur.AI Etiquetas V2 — arquitetura isolada (10/11/2026)

## Decisão de produto
**A ferramenta será um aplicativo web privado INDEPENDENTE.** O responsável não quer módulos, botões, rotas ou menus no site da Droga Vida Popular.

O código do aplicativo está exclusivamente em etiquetas-app/ neste repositório de revisão. O build do site comercial lista explicitamente os arquivos publicados e não inclui etiquetas-app. Os arquivos admin/admin.js, admin/index.html e scripts/build.mjs foram restaurados à versão principal. Nenhum endereço do site público apontará para o aplicativo.

## Implementação V2
- UI preta/roxa, responsiva, própria, com sessão de usuário autorizada pela equipe.
- Modo demonstração offline sem acessar a Trier.
- Importação CSV UTF-8 e edição manual dos preços, tamanhos, códigos e filial.
- 8 etiquetas A4, grade 2 × 4, 90 × 61 mm, 6 mm entre etiquetas, moldura preta, faixa superior, logo, nome, apresentação, preço gigante e preço anterior riscado quando confirmado.
- Folhas com dados de demonstração são identificadas com marca d'água de preços fictícios.
- Funcionalidade de consulta Trier só da Loja 2, com login e conferência por endpoint existente: registration-search seguido de registration-preview.
- Monitor de remarcação via ação labels-history da Edge Function, exclusivamente para equipe autenticada.

## Segurança e isolamento
- Não habilitar integração/monitor de produção sem revisar migration, autenticação, CORS e staging.
- Para hospedar em domínio separado, adicionar SOMENTE a origem exata desse domínio na allowlist SITE_ORIGINS da Edge Function. Não abrir CORS para todas as origens.
- Manter credenciais do ERP e chave secret/service_role apenas no servidor. App público usa chave publishable e tokens de sessão.
- Filial 1 ainda sem integração ERP. CSV e entrada manual podem indicar filial 1, sempre com revisão de preços.
- O aplicativo não escreve preços no ERP, no cache Trier nem no site, e não cria vendas.
- Site comercial, ADM e scripts de publicação permanecem inalterados no PR.

## Executar e testar
Dentro da pasta etiquetas-app:

    npm run dev
    npm test

Acesse http://127.0.0.1:4273. A demonstração funciona sem conexão à API. A autenticação real exige config.js preenchido com URL e chave publishable públicas e a origem de hospedagem aprovada.

O PDF de teste separado foi gerado com 8 etiquetas A4 e medidas físicas. Verificar impressão a 100%, sem cabeçalho ou rodapé, com fundos habilitados. Valores do PDF são ilustrativos e não devem ser usados na loja.

## Antes do lançamento
1. Rodar testes do aplicativo isolado e testes de regressão do site original.
2. Conferir 1, 8, 9 e 16 etiquetas, caracteres especiais, nomes compridos, valores em R$ e sanitização.
3. Revisar layout real impresso A4 com uma régua e aprovação da equipe.
4. Testar autenticação e autorização em domínio independente, com cada cargo e conta não autorizada.
5. Testar CORS allowlist apenas para o domínio independente, sem expor chaves secretas.
6. Validar migration de histórico em staging e executar deploy coordenado de trier-api.
7. Escolher a hospedagem separada e preparar logo local no aplicativo antes de produção.
8. Não fazer merge, deploy, seed ou alterar o site da farmácia até aprovação.

## Próximas versões
- Importação XLSX nativa.
- Histórico dos lotes e de impressões.
- Agrupamento inteligente de fraldas por tamanhos/variantes.
- Integração própria da Loja 1 somente após validação técnica.
- Notificações e etiquetas pendentes após remarcação.
