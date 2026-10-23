# Usuários e acessos

A aba **Usuários e acessos** e o atalho **Usuários** permitem ao administrador:

- Consultar e pesquisar todos os membros, cargo, situação e último login.
- Criar acessos, incluindo novos administradores.
- Revisar e confirmar mudanças de cargo e ativação/desativação.
- Excluir pelo fluxo existente, com confirmação do e-mail, preservando imagens.
- Consultar as 50 alterações de acesso mais recentes.
- Autorizar cada cargo a criar determinados cargos de nível igual ou inferior.

As autorizações de criação começam desativadas. Nenhum membro existente é
promovido ou recebe nova permissão pela instalação. A regra se aplica a todos
os membros do cargo, inclusive futuros cadastros. Não autoriza gerenciar outros
usuários, mudar a própria permissão, delegar ou publicar o catálogo.

Hierarquia para criação: administrador, proprietário(a), gerente, editor.
Somente administradores podem criar administradores ou alterar essa configuração.
O administrador não pode alterar ou desativar a própria conta. A validação usa
os cargos atuais do banco, nunca metadados editáveis do usuário ou apenas a UI.

Desativar bloqueia as operações protegidas pelas verificações existentes de
membro ativo, mesmo com uma sessão já aberta. Não altera senhas nem o estoque.
Não é um encerramento de todas as sessões do Supabase Auth: é revogação do
acesso ao painel. O último administrador permanece protegido.

A Edge Function `admin-api` continua validando a sessão e a cota de requisições.
A criação é autorizada antes de chamar Auth e revalidada na transação de cadastro:
se a permissão for revogada enquanto Auth cria a conta, o membro não é inserido
e a conta provisória é removida. Contas sem vínculo ativo não acessam o painel.

RPCs de acesso são `SECURITY INVOKER`, exclusivos de `service_role`. As tabelas
`panel_role_creation` e `panel_access_history` têm RLS e não são acessíveis pelos
clientes públicos. A auditoria de membros usa trigger privada; registra UUIDs,
cargos, situação e horário, sem senhas, tokens ou credenciais. Os backups incluem
as tabelas novas e continuam aceitando cópias anteriores à atualização.

Migration: `20261023182240_panel_access_management.sql`.
Produtos, preços, imagens e permissões de publicação não são modificados.
Os testes usam Auth simulado e Postgres isolado, sem criar usuários reais.
