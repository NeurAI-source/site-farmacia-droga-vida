# Segurança do projeto

As dez tabelas antigas estão preservadas e isoladas de `anon`/`authenticated` pela migration `20261014170000_quarantine_legacy_tables.sql`. O backup criptografado inclui seus registros. As funções antigas `delivery-admin-create-driver`, `product-content-ai` e `set-erick-admin` recebem o código de `supabase/functions/legacy-disabled.ts` e não executam operações. Não reative esses caminhos sem revisão de autenticação, autorização e finalidade.

Nunca versionar `.env`, variações/modelos desse nome, arquivos terminados em `.env`, `.venv`, `venv`, chaves privadas, tokens ou senhas. Segredos ficam no provedor ou GitHub Secrets. Somente a chave pública de backup pode ser versionada. O verificador de commits e a publicação devem recusar material privado; nunca remover esse bloqueio para publicar.

Operações administrativas exigem usuário verificado, colaborador ativo, cargo permitido e segundo fator (`aal2`), inclusive nas APIs e no banco. Credenciais de servidor não são credenciais de navegador. CORS, campos escondidos e `noindex` não substituem autorização.

Dados editoriais, arquivos, URLs e futuras respostas Trier são dados não confiáveis. Validar tamanho/esquema/identidade antes de persistir; escapar texto no DOM, aceitar somente destinos documentados e não executar HTML ou instruções vindas de conteúdo. NeurAI atual é um parser determinístico, sem agente/LLM; qualquer futura integração de IA requer revisão própria, saída tipada e aprovação humana antes de efeitos externos.

A integração Trier permanece desativada e sem adaptador até documentação oficial, autenticação, paginação, unidade monetária, política de status e teste controlado. Nunca usar nomes para associar estoque. Preservar loja, identificadores, leases e histórico; falhas não devem publicar dados parciais como resultado verificado.

Dependências são fixadas no lockfile e revisadas pelo npm audit, CodeQL e Dependabot. Atualizações requerem testes. A restauração de backups deve ser provada; exportação criptografada da aplicação não é um backup físico completo de Auth/banco.

Relate suspeitas ao responsável pelo sistema usando um canal privado. Não publique credenciais, dados de clientes ou prova de exploração em issues públicas.
