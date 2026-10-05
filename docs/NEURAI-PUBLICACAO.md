# Neur.AI: remarcação e publicação automática

Esta atualização altera o projeto existente e reutiliza `catalog_draft`, `publications`, `admin-api` e `publish.yml`. Nenhum produto, imagem, código, preço real ou usuário é incluído como carga de dados.

## Uso

1. Abra Neur.AI e informe um código reduzido e um preço por linha.
2. Clique em **Analisar lote**. O catálogo é recarregado antes da análise.
3. Confira produto, apresentação, código, preço anterior e novo preço.
4. Se desejar, ative **Publicar automaticamente após confirmação**.
5. Clique em **Confirmar remarcação**.

A opção começa desligada. A preferência é guardada por conta neste navegador. Somente o cargo `admin`, que já publicava antes, pode ativá-la. Outros cargos continuam salvando rascunhos.

A publicação reutiliza o catálogo completo. Portanto, inclui os demais rascunhos já salvos na versão analisada, assim como o botão manual existente. Uma alteração feita por outra pessoa depois da análise bloqueia a confirmação e exige nova análise.

Cada lote é salvo de uma vez, com histórico de usuário, horário, versão, códigos, nomes e preços. Apenas `priceCents` e a data de atualização dos produtos identificados mudam; estoque e demais campos são preservados.

## Estados e recuperação

- **Alterações salvas:** lote confirmado no banco; isso não significa que o site já mudou.
- **Aguardando publicação:** na fila ou aguardando início no GitHub.
- **Publicação em andamento:** execução assumiu a versão imutável do catálogo.
- **Publicação concluída:** implantação confirmada.
- **Falha na publicação:** preços continuam salvos. Use **Consultar / tentar novamente** no histórico.

Uma confirmação sem resposta permanece disponível em **Recuperar confirmação do lote**, inclusive após recarregar a página. A mesma identificação é reutilizada; o banco não aplica o lote duas vezes.

Publicações aguardam a anterior na tabela existente. O workflow inicia a próxima mesmo com o navegador fechado. Uma entrega incerta ao GitHub só pode ser reenviada após 60 segundos, usando a mesma publicação. Apenas uma execução consegue assumir essa publicação, prevenindo implantações duplicadas. Uma tentativa de republicar um snapshot antigo é bloqueada quando há uma versão posterior; nesse caso, revise o rascunho atual e publique pelo painel.

O acompanhamento consulta o GitHub quando uma execução terminou sem conseguir registrar o resultado no banco. Verifica a etapa de implantação para não confundir falha no registro de status com falha no site. Falhas persistentes de infraestrutura/configuração exigem correção e nova tentativa; o sistema não descarta os preços salvos.

## Recuperar preços anteriores

Abra um lote no histórico e escolha **Revisar recuperação dos preços**. Confira a nova prévia e confirme. A recuperação exige que os códigos e os preços atuais ainda correspondam ao lote original; mudanças posteriores bloqueiam a recuperação. Um novo lote auditável é criado. A preferência de publicação também se aplica a essa confirmação.

## Produtos com tamanhos

A estrutura atual possui código e preço por produto; os tamanhos não têm preço/código próprio. Para não remarcar outras apresentações implicitamente, o lote bloqueia produtos com `variants` e orienta a revisão no cadastro individual. Não foram inventados códigos por tamanho nem modificada a estrutura dos produtos. Apresentações cadastradas como produtos distintos são identificadas pelo código exato, inclusive zeros à esquerda.

## Implantação depois da revisão

O projeto da farmácia identificado no trabalho anterior é `bzhsnoqlbhjaaheugpku`. Confirme que esse é o projeto usado nas configurações atuais. A conexão disponível nesta sessão expôs apenas outro projeto, Erick IA; nenhuma migração ou implantação foi aplicada em produção.

1. Confira a estrutura real, o histórico de migrações e que não há implantação em andamento. A migração preserva publicações anteriores, mas a versão antiga do workflow não registra os novos campos de acompanhamento. Planeje a atualização coordenada do worker, workflow e `admin-api`: não use o novo backend enquanto `main` ainda contiver o worker antigo.
2. Após validar a compatibilidade, aplique **uma única vez** `supabase/migrations/20261002113649_neurai_auto_publication.sql`, registrando-a no histórico usado pela equipe. A migração é transacional e não atualiza os produtos. Não reaplique as migrações iniciais e não execute `seed` nem `db reset`.
3. Execute `npm run prepare:functions`.
4. Prepare a atualização da Edge Function `admin-api` no projeto confirmado, mantendo os mesmos segredos e origens. Implante-a na janela coordenada, depois que o workflow/worker atualizado estiver em `main` mediante aprovação. Exemplo, após conferir `npx supabase functions deploy --help`:
   `npx supabase functions deploy admin-api --project-ref bzhsnoqlbhjaaheugpku --no-verify-jwt`.
5. Atualize a configuração server-side para `GITHUB_REPOSITORY=NeurAI-source/site-farmacia-droga-vida`, nome atual do mesmo repositório após a transferência para a organização NeurAI-source. Confira que o token existente mantém acesso a esse repositório e permissão de disparar Actions na organização; preserve as demais variáveis/segredos já usados pelo workflow. Nenhuma credencial deve ser colocada em arquivos públicos, mensagens ou no repositório.
6. Somente após aprovação final, integre o código à `main`, atualize as funções preparadas e execute o workflow existente **Publicar site** uma vez com `publication_id` vazio para publicar a atualização do código. Ele preserva o último catálogo publicado. A partir daí, as confirmações de lotes com a opção ligada disparam a publicação. Não dispare esse workflow como teste de instalação sem aprovação para publicar.
7. Execute o Security Advisor no projeto correto e faça a validação de integração em ambiente de homologação com dados fictícios. Os testes locais não substituem a validação das credenciais e regras do GitHub/Supabase da instalação real.

Se o ambiente `github-pages` exigir aprovação humana, essa exigência continua válida. O código não remove regras de proteção. A automação pode ficar aguardando essa aprovação no GitHub.

## Segurança e testes

Novas funções SQL usam `security invoker`, são executáveis apenas por `service_role`, e verificam a associação ativa do ator e o cargo quando aplicável. A Edge Function obtém o usuário pelo token de sessão, sem confiar no usuário/cargo enviado pelo navegador. `price_batches` tem RLS e não concede leitura/escrita direta a clientes. O identificador do ator é preservado no histórico mesmo após exclusão de conta.

Testes sem dados reais: validação de preços/códigos, lote com vários produtos, simultaneidade, permissões/RLS, histórico, restauração, snapshots, fila, entrega incerta, falha/repetição do GitHub, worker duplicado e interface em computador/celular. Os testes HTTP usam respostas simuladas; o SQL executa em Postgres local em memória (PGlite). O navegador local de verificação foi Chromium 134; o workflow instala a versão do Playwright disponível no ambiente de CI.

Para testar: `npm ci`, `npm test`, `npx playwright install chromium`, `npm run test:ui`, `npm run build`.

A tentativa de executar `supabase db advisors --local` e `supabase migration list --local` não encontrou um serviço Postgres em `127.0.0.1:54322`. A verificação local de SQL, RLS e concessões foi realizada nos testes PGlite; os Advisors do projeto real permanecem pendentes.
