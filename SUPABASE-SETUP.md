# Ativação do painel Droga Vida

## Atualização do projeto existente

Para instalar Neur.AI + Carrossel/Encartes, use exclusivamente o projeto existente `bzhsnoqlbhjaaheugpku` e os procedimentos de `docs/NEURAI-PUBLICACAO.md` e `docs/CARROSSEL-ENCARTES.md`. Confira a estrutura real e o histórico antes de aplicar as duas novas migrações. Não crie outro projeto, não execute `seed`, não recrie usuários e não repita as migrações iniciais. A publicação no domínio principal depende de aprovação final.

As seções de instalação inicial abaixo documentam a configuração original e não são o procedimento desta atualização.

Integração ativada no projeto `bzhsnoqlbhjaaheugpku`. GitHub Pages usa Actions, o cadastro público está desativado e o administrador da farmácia é autorizado por `team_members`. As instruções abaixo servem para reinstalação; não repita migrações já aplicadas. O token de publicação no Supabase expira em 27/12/2026 e precisará ser renovado antes dessa data.

Validação em 28/09/2026: login, perfis admin/editor/sem autorização, RLS, conflito de edição, cadastro de usuário, envio de imagem, registro de acessos e publicação completa pelo painel aprovados. Contas temporárias de teste são removidas após a verificação.

## 1. Criar projeto gratuito

Entre em https://supabase.com/dashboard, crie uma organização no plano Free e um projeto `droga-vida-popular`. Escolha a região disponível mais próxima de São Paulo. Gere uma senha de banco forte e guarde no seu gerenciador de senhas. Não envie a senha pelo chat nem salve no repositório.

Quando o projeto estiver pronto, compartilhe apenas a URL do projeto e o e-mail do primeiro administrador. A chave publishable é configuração pública; a chave secret/service_role nunca vai para o navegador.

## 2. Banco e primeiro administrador

Execute, nessa ordem, `supabase/migrations/202609270000_team.sql` e `supabase/migrations/202609270001_admin.sql` no SQL Editor. Não repita uma migração já aplicada. Desative novos cadastros públicos em Authentication > Providers > Email. Cadastros pelo Auth Admin API continuam disponíveis ao backend. Configure a Site URL e as URLs de redirecionamento para o domínio do site.

Crie o primeiro usuário no painel Authentication do Supabase; guarde sua senha fora do código. Copie o UUID desse usuário e execute, substituindo o exemplo:

```sql
insert into public.team_members(user_id, role) values ('UUID_DO_PRIMEIRO_USUARIO', 'admin');
```

O perfil `editor` pode editar rascunhos e enviar imagens. Só `admin` pode cadastrar usuários e publicar. A opção não aparece para editores, e o servidor também verifica a permissão. Remova o acesso mudando `active` para `false` em `team_members`. Não há link de administração no site público. `/admin/` é um endereço separado, mas não é um segredo: a proteção real é Auth e autorização no banco/servidor.

## 3. Configuração local e funções

Copie `exemple.env` para `.env` localmente e preencha somente no computador. O exemplo contém placeholders e não mascara nem criptografa segredos. `.env`, `.env.*`, `.venv/` e `venv/` estão ignorados. O build usa uma lista explícita de arquivos públicos.

Com Node 22 e Supabase CLI autenticado:

```text
npm ci
npm run prepare:functions
supabase link --project-ref SEU_PROJECT_REF
node --env-file=.env scripts/cloud-catalog.mjs seed
supabase functions deploy admin-api
supabase functions deploy page-view
```

Cadastre nos Secrets de Edge Functions: `SITE_ORIGIN=https://neurai-source.github.io`, `GITHUB_REPOSITORY=NeurAI-source/site-farmacia-droga-vida` e `GITHUB_DEPLOY_TOKEN`. URL e service role são fornecidas pelo próprio Supabase às funções. Nunca colocar token em argumentos de terminal, logs ou arquivos versionados.

O token GitHub deve ser fine-grained, limitado a este repositório, com **Actions: write**, prazo de validade e autorização da organização quando exigida. Ele serve apenas para disparar `publish.yml`; não use um token amplo de sua conta.

## 4. GitHub Pages e publicação

No repositório, crie Variables de Actions `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Crie o Secret `SUPABASE_SERVICE_ROLE_KEY`. Configure Pages para **GitHub Actions**, envie este código e execute `Publicar site` uma vez sem `publication_id`.

O botão do painel cria uma cópia do rascunho no banco e dispara o workflow. O workflow busca essa cópia, valida, gera `dist/` e publica. Somente depois da confirmação do Pages marca a publicação como concluída. Alterações posteriores no rascunho não alteram uma publicação em andamento. Uma publicação manual de código reutiliza o último catálogo publicado.

Se um workflow for cancelado, ou se a comunicação com o GitHub falhar de maneira incerta, a publicação pode continuar pendente. Confira primeiro Actions e o site publicado; depois corrija o status no banco. Não liberar uma publicação pendente enquanto outro deploy estiver rodando. Se o deploy concluir mas a confirmação no banco falhar, reconciliar com o resultado do Pages antes de repetir.

## 5. Verificação antes de liberar

- Anônimo não lê rascunhos, equipe ou métricas e não publica.
- Usuário sem vínculo ativo não entra; editor não cadastra nem publica.
- Administrador cadastra usuário; edição simultânea rejeita versão antiga.
- Upload aceita JPG/PNG/WebP até 5 MB, sem sobrescrever imagens já publicadas.
- Publicar produto de teste, aguardar conclusão e conferir a vitrine no computador e celular.
- Conferir registro de acesso e ausência de `.env`, `.venv` e chaves secretas no artefato Pages.

Métricas começam na ativação; não recuperam visitas antigas. Visualizações são limitadas a uma por sessão a cada 30 segundos. Visitas são estimativas por sessão e dia, com nova sessão após 30 minutos de inatividade; não representam pessoas únicas. Bloqueadores, sessões em abas diferentes e robôs afetam a contagem. O endpoint público não é um sistema antifraude; proteção contra automação e política de retenção continuam como evolução futura.

## Desenvolvimento

`npm test` valida catálogo e isolamento de configuração. `npm run dev` gera e serve apenas `dist/`, em loopback. Para carregar a configuração local use `node --env-file=.env scripts/build.mjs` e depois `node scripts/serve.mjs`. O projeto usa Node; não precisa de `.venv`.

### Cargos adicionais

A migração `202609280000_team_roles.sql` acrescenta Proprietário(a) e Gerente. Esses cargos podem editar o catálogo e enviar imagens, como Editor. Cadastrar usuários e publicar continuam exclusivos de Administrador. O cargo aparece no cabeçalho do painel.

A migração `202609290000_remove_users.sql` permite excluir contas pelo menu Usuários, somente para Administrador, com confirmação do e-mail. Protege a própria conta e mantém imagens e publicações. Se o Auth recusar a exclusão, o acesso permanece desativado e o painel permite tentar novamente.

## Cloudflare Pages e domínio próprio

A hospedagem de destino é Cloudflare Pages, projeto droga-vida-popular, plano gratuito. O domínio permanece registrado no Registro.br.

O workflow existente recebe a publicação do ADM e envia dist/ ao Cloudflare quando a variável GitHub CLOUDFLARE_ACCOUNT_ID estiver configurada. A chave CLOUDFLARE_API_TOKEN fica somente em GitHub Actions Secrets, com permissão Pages Write na conta selecionada. Sem essa variável, o fluxo anterior do GitHub Pages continua disponível.

As funções admin-api e page-view aceitam SITE_ORIGINS, lista de origens HTTPS separadas por vírgula. A origem antiga e o domínio próprio podem coexistir durante a migração. Autenticação e cargos continuam validados no Supabase. Nenhuma chave administrativa do Supabase é enviada para a hospedagem pública.

Ativação depende da criação do projeto e da credencial, da troca de nameservers no Registro.br, da associação dos domínios no Pages e da validação do HTTPS e do DNSSEC.

## Carrossel e encartes

A extensão de campanhas tem migração, bucket privado e Edge Function próprios. Consulte
[docs/CARROSSEL-ENCARTES.md](docs/CARROSSEL-ENCARTES.md) para revisar permissões, testes e
aplicação após aprovação. Não repita a carga inicial do catálogo para instalar essa extensão.

## Publicação automática do Neur.AI

Consulte `docs/NEURAI-PUBLICACAO.md` para a migração adicional, implantação coordenada e recuperação de falhas. Não execute seed nem recrie o banco.
