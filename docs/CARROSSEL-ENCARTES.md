# Carrossel e encartes — atualização do projeto existente

Esta atualização acrescenta uma seção independente abaixo do banner da família e uma área **Carrossel e encartes** no painel existente. Não substitui o site, o painel, o catálogo nem a infraestrutura de hospedagem.

## Comportamento

- Posts têm uma capa e um link HTTPS opcional. Encartes têm capa e até 30 páginas, reorganizáveis no editor.
- JPG, PNG e WebP: até 5 MB, dimensão máxima de 12.000 pixels por lado e 40 megapixels. Validação do conteúdo no servidor e decodificação no navegador; SVG e WebP animado não são aceitos.
- Avanço automático a cada 5 segundos, setas, indicadores e pausa. Interação manual pausa até **Reproduzir**; foco/ponteiro e preferência por movimento reduzido também suspendem a rotação.
- O visualizador permite avançar, voltar e ampliar as páginas. As imagens usam `object-fit: contain`.
- Campanhas podem ser rascunhos, publicadas ou arquivadas. A validade e o status ativo determinam a exibição. Sem campanhas válidas, a seção inteira fica oculta.
- Datas são editadas em **America/Sao_Paulo**, convertidas para UTC e armazenadas como `timestamptz`. O minuto final é inclusivo: término em 10/10/2026 às 23:59 corresponde ao limite exclusivo 11/10/2026 às 03:00:00 UTC.
- A equipe autorizada prepara e edita rascunhos. Apenas o cargo `admin`, seguindo a permissão de publicação já existente, pode aprovar/publicar. Salvar uma campanha publicada como rascunho a retira do site até nova aprovação.
- Duplicar cria um rascunho inativo com as datas originais, exigindo revisão antes de publicar. Campanhas vencidas não podem ser republicadas sem atualizar o período.
- Exclusão definitiva é oferecida somente a administradores, após arquivamento e confirmação. As campanhas arquivadas continuam pesquisáveis no filtro de status.

## Separação e segurança

A migração cria somente `campaigns`, `campaign_pages`, `campaign_assets`, dois RPCs exclusivos de `service_role` e o bucket privado `campaign-images`. Não modifica tabelas, registros ou arquivos de produtos, usuários, Neur.AI, pré-pedidos, preços ou publicações do catálogo.

As três tabelas têm RLS habilitada e nenhum acesso direto de `anon`/`authenticated`. O navegador usa a função `campaign-api`, que valida o token com `Auth.getUser` e consulta a associação ativa em `team_members`. O RPC de escrita repete a autorização em transação e bloqueia edições concorrentes por versão. Aprovação nunca depende de `user_metadata`.

Somente a função no servidor usa a chave administrativa existente. O GET público retorna os campos necessários das campanhas publicadas, ativas e válidas; o banco fornece o horário no mesmo snapshot. Imagens de rascunhos não têm URL pública. Os POSTs autenticados oferecem prévias assinadas para a equipe.

Objetos são imutáveis e podem ser compartilhados por duplicações. Excluir uma campanha remove suas páginas e metadados, mas conserva arquivos privados para não quebrar outra campanha. Uploads abandonados também permanecem privados. Uma futura limpeza de armazenamento deve verificar referências de **capa e páginas**; não remover arquivos só por idade nem tocar em `product-images`.

## Validade e cache

O endpoint e as requisições públicas usam `no-store`; cada consulta tem URL única. O cliente revalida a cada 20 segundos, no próximo início programado, ao voltar para a aba e ao recuperar a conexão. Não usa localStorage, service worker, cron local ou publicação diária.

O relógio monotônico do navegador é sincronizado com o servidor, independentemente da data configurada no dispositivo. Um temporizador remove a campanha no término e fecha seu encarte, mesmo se a rede cair. O carrossel exige uma confirmação do servidor com no máximo 60 segundos; após esse prazo sem resposta, fica oculto. Alterações como desativação administrativa são refletidas na próxima consulta (normalmente até 20 segundos; limite de 60 segundos sem rede). O vencimento agendado não espera a próxima consulta.

As URLs públicas assinadas duram 90 segundos; as prévias administrativas, uma hora. Uma URL de imagem já divulgada não é mecanismo de revogação instantânea — inclusive pode haver cache do conteúdo da imagem. A validade da oferta é garantida pela seleção no servidor, temporizadores, revalidação e prazo de confirmação. Arquivos jamais publicados não são assinados pelo endpoint público.

## Revisão local no VS Code

A atualização conjunta está na branch `feat/neurai-publicacao-automatica` do repositório existente `NeurAI-source/site-farmacia-droga-vida`. A base usada é o commit `fd874f7ca453fc02bc54af0732df7442fc659a02`. Nenhuma publicação de produção é disparada pelo envio da branch ou abertura do pull request.

No VS Code, confira e salve suas alterações locais antes de trocar de branch. Se você já aplicou o pacote ZIP, compare essa versão com a branch remota; não reaplique o patch nem descarte alterações locais.

```sh
git status --short
git fetch origin
git switch feat/neurai-publicacao-automatica
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run build
git diff --stat
```

Se houver divergência entre a branch local e a remota, revise o diff antes de integrar; não use reset ou push forçado. `catalog.json`, o banner e as imagens dos produtos não fazem parte das alterações. A ativação no Supabase e a publicação definitiva são etapas separadas, descritas abaixo.

Os testes do navegador simulam respostas da API, sem usar contas reais ou publicar campanhas. Os testes de banco executam a migração e os RPCs em PostgreSQL via PGlite, com papéis e permissões separados. Não há campanhas de exemplo carregadas no site ou no banco da farmácia.

`npm run dev` abre a versão local em `http://127.0.0.1:4173`. Sem as variáveis públicas existentes (`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`), o painel permanece bloqueado e o carrossel oculto. Nunca use uma chave administrativa nessas variáveis.

## Ativação somente depois da revisão

Projeto identificado na configuração pública atual: **bzhsnoqlbhjaaheugpku**. A conexão Supabase disponível durante o desenvolvimento não tinha permissão para esse projeto. Nenhuma migração, função, campanha ou publicação foi aplicada nele.

1. Uma pessoa com acesso ao projeto correto deve conferir o histórico de migrações e validar primeiro em homologação. Conserve os backups e o catálogo existentes. Não execute `seed`, `db reset`, `--include-all` ou substituição de catálogo para instalar este módulo.
2. Confira a estrutura existente e o histórico antes de aplicar `supabase/migrations/20261001190410_carousel_campaigns.sql`. A atualização conjunta também inclui `20261002113649_neurai_auto_publication.sql`, com implantação coordenada descrita em `NEURAI-PUBLICACAO.md`. Pelo fluxo habitual da equipe, confira os comandos disponíveis com `supabase link --help` e `supabase db push --help`, vincule exclusivamente o projeto identificado e revise o plano em modo `--dry-run`. Prossiga somente se o plano listar as novas migrações ainda pendentes e o histórico estiver consistente. Se houver divergência, reconcilie o histórico antes de aplicar; não reaplique migrações antigas. Se a equipe usa SQL Editor, execute apenas os novos arquivos verificados e registre sua aplicação no histórico usado pela equipe.
3. Prepare os arquivos compartilhados e publique **somente a nova função**:

   ```sh
   npm run prepare:functions
   npx supabase functions deploy campaign-api --project-ref bzhsnoqlbhjaaheugpku --no-verify-jwt --use-api
   ```

   A verificação JWT da plataforma fica desativada porque o GET é público. Cada POST valida explicitamente o JWT e a equipe dentro da função. Não remova essa validação.
4. Confira a variável existente `SITE_ORIGINS` (ou `SITE_ORIGIN`) sem apagar origens já autorizadas. Deve permitir as origens efetivamente usadas, incluindo `https://www.drogavidapopular.com.br` e `https://neurai-source.github.io`. Caminhos como `/admin/` não fazem parte da origem. Acrescente o domínio sem `www` apenas se ele servir o site, além das origens de homologação necessárias.
5. Em homologação, valide upload real, URLs assinadas, CRUD com contas `admin` e `editor`, restrições anônimas e o cenário de expiração descrito abaixo. Esses são os pontos que ainda precisam de verificação na infraestrutura Supabase real.
6. Após aprovação e merge, publique o código estático pelo fluxo **Publicar site** que o repositório já utiliza, preservando variáveis, domínio e provedor. Não é necessário publicar o catálogo para cada campanha depois dessa instalação inicial.

A workflow `campaign-checks.yml` executa somente verificações em pull requests; não publica sites nem altera bancos.

## Verificação antes de liberar

| Área | Verificação automatizada | Verificação na homologação real |
|---|---|---|
| Cadastro e edição | Formulário, RPC, versão, rollback, rascunho e aprovação | Salvar com duas contas e confirmar conflito |
| Imagens e páginas | JPG/PNG/WebP reais, tamanho, MIME falso, reordenação e duplicação | Upload/assinatura no bucket privado |
| Histórico e exclusão | Arquivar/excluir, permissão admin e integridade das cópias | Confirmar retirada da lista pública |
| Agendamento | UTC/São Paulo, próximo início e limites exatos | Campanha começando e terminando em poucos minutos |
| Expiração e cache | Página aberta, encarte aberto, dispositivo com data errada, rede indisponível | Manter site aberto até expirar; inspecionar resposta sem cache |
| Carrossel e encarte | Avanço, pausa, retomada, setas, páginas e ampliação | Conferir artes reais em aparelhos usados pela equipe |
| Segurança | Função HTTP, papéis SQL, RLS/grants, imagens privadas | Login real, usuário revogado e tentativa anônima |
| Preservação | Hashes do catálogo/banner e testes existentes; Neur.AI/publicação têm testes próprios na atualização conjunta | Conferir produtos, códigos, preços, imagens e pré-pedido WhatsApp |

## Reversão sem perda de dados

Se necessário, reverta apenas a integração estática do carrossel/painel e desative as campanhas. As novas tabelas e o bucket podem permanecer privados, preservando o histórico. Não apague tabelas, catálogo, usuários ou imagens para reverter a interface.

## Pacote conjunto

Esta entrega também inclui a publicação automática opcional do Neur.AI. As alterações e a implantação dessa parte estão em `docs/NEURAI-PUBLICACAO.md`. A preservação descrita acima refere-se à migração do carrossel; o fluxo de publicação é ampliado pela migração separada do Neur.AI.
