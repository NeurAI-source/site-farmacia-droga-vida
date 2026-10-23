# Backup criptografado da aplicação

O workflow diário, às 06:17 UTC, exporta somente as tabelas de aplicação listadas em `scripts/backup.mjs` e todos os arquivos dos buckets `product-images` e `campaign-images`, incluindo imagens privadas. Guarda um artefato criptografado por 30 dias. Também pode ser executado manualmente na branch principal.

Com `BACKUP_MEDIA_CACHE_DIR`, a transferência de imagens é incremental: a listagem atual continua obrigatória e arquivos com a mesma identidade, revisão e tamanho reutilizam uma cópia já criptografada. Cada artefato diário contém todas as imagens e as tabelas atuais; a restauração não depende do cache nem de artefatos anteriores. Objetos removidos deixam de integrar os próximos backups. Objetos novos, alterados ou sem revisão confiável são baixados novamente.

O cache `.backup-cache` contém apenas imagens criptografadas, tamanhos, hashes e autenticação HMAC com o segredo de servidor existente, sem nomes/caminhos de objetos, tabelas ou credenciais. Cache ausente, adulterado, expirado ou incompatível com projeto/chave pública/segredo provoca uma nova cópia. Nenhuma chave privada é necessária no CI. O primeiro backup após essa mudança ainda baixa as imagens; a economia aparece nas execuções seguintes. O resumo registra quantos arquivos foram baixados/reutilizados e os bytes baixados.

Não é um dump físico completo do banco. Não inclui o schema Auth, usuários/senhas/tokens de autenticação, segredos, funções SQL, políticas, grants, sequências, outros buckets nem a tabela temporária de quotas de segurança. Inclui identificadores de colaboradores nas tabelas de aplicação, para preservar histórico e referências. Código e migrations devem ser recuperados pelo repositório; contas Auth precisam de um plano próprio de recuperação.

A coleta REST ocorre em requisições separadas, não em uma transação consistente. Faça uma cópia adicional durante uma janela sem alterações antes de uma migração importante. Novas tabelas e buckets exigem atualizar a lista explícita e os testes. Qualquer falha de leitura, limite ou imagem interrompe a execução; uma execução falha não representa backup completo. Limites: 100 mil linhas por tabela, 100 mil objetos, 128 MiB transferidos e 128 MiB de JSON final, incluindo imagens em base64. O limite considera as imagens atuais e sua expansão em base64; reveja capacidade se o volume crescer. A lista inclui as dez tabelas antigas preservadas, além das treze usadas pelo site.

## Chaves e configuração

Use uma chave pública RSA de pelo menos 2048 bits em `security/backup-public.pem` ou na variável de repositório `SECURITY_BACKUP_PUBLIC_KEY`. O workflow usa `SUPABASE_URL` e o segredo existente `SUPABASE_SERVICE_ROLE_KEY`. A chave privada de recuperação deve ficar fora do repositório e do GitHub, com uma cópia offline protegida. Não a adicione a `.env`, ao artefato, ao workflow ou aos logs. Perder essa chave impede recuperar os backups. Trocar a chave exige preservar as chaves antigas enquanto houver backups associados.

Cada backup usa uma chave AES-256 aleatória com GCM, nonce aleatório e autenticação de integridade. Essa chave é encapsulada com RSA-OAEP/SHA-256. Durante a coleta e criptografia, os dados ficam em memória; somente o envelope criptografado é escrito em disco. Não há arquivos temporários de dados em texto aberto. A máquina executora ainda recebe os dados e deve ser confiável.

O formato interno v2 inclui envelopes criptografados individuais de imagens, vinculados ao bucket e caminho por dados autenticados. A recuperação valida também tamanho e SHA-256 e entrega o mesmo JSON v1 usado anteriormente. A leitura dos backups antigos v1 continua suportada. A chave pública deve continuar sendo a da chave privada de recuperação preservada pelo responsável.

## Provar a recuperação

Após configurar a chave e depois de mudanças importantes, baixe um artefato e prove a recuperação em uma máquina segura. Em PowerShell, configure `SECURITY_BACKUP_PRIVATE_KEY_FILE` com o caminho absoluto da chave privada e execute:

```powershell
$env:SECURITY_BACKUP_PRIVATE_KEY_FILE = 'C:\caminho-seguro\recovery-private.pem'
node scripts/backup.mjs restore application-backup.enc C:\caminho-seguro\recovery-verified.json
```

O comando valida a autenticação criptográfica, versão, tabelas, caminhos, tamanhos e hashes de cada imagem. Escreve somente no caminho explicitamente informado e recusa sobrescrever um arquivo existente. O JSON recuperado contém dados privados: mantenha-o protegido e remova-o quando terminar a verificação. A opção de restore não conecta nem sobrescreve o banco. A reposição real exige revisar os dados, restaurar migrations, preparar contas/referências e importar imagens/tabelas em ordem controlada em um ambiente de recuperação. Confirme catálogo, campanhas, imagens e permissões antes de mudar a produção.

Os testes locais provam round-trip, chave errada, adulteração e limites de estrutura usando chaves temporárias em memória. Não substituem a prova de recuperação com a chave privada real e um artefato real. O agendamento e armazenamento no GitHub só ficam ativos após publicar este workflow e configurar a chave pública.
