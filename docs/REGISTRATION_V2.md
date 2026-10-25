# Cadastro Inteligente 2.0

Evolução do painel existente. O catálogo continua em `catalog_draft`, com revisão,
controle de versão e `publications`. Não há tabela SQL de produtos nova nem
escrita no ERP. Filial 2, cron e lease de sincronização existentes preservados.

## Fluxo

**Importar da Trier** consulta por código reduzido ou EAN; leitor externo pode
digitar o EAN. A câmera depende de `BarcodeDetector`, HTTPS e consentimento do
usuário; quando indisponível o painel informa e permite digitação.

O OpenAPI LTS 1.5.22 documenta `codigo`, `codigoBarras`, `ativo`,
`primeiroRegistro` e `quantidadeRegistros` em `/integracao/produto/obter-v1`.
Não documenta pesquisa por nome nesse endpoint. O backend percorre até 200
registros por página de busca textual, filtra e devolve o próximo cursor.
Resultados vazios podem ter próxima página. Não há promessa de busca textual
instantânea sobre toda a base. Selecionar todos examina até 2.000 registros por
operação, respeita marca/categoria sugerida e informa o limite.

O backend guarda páginas consultadas por 15 minutos em cache privado. Cache
antigo preservado em falha é identificado; não autoriza importação sem nova
prévia. A prévia consulta até 30 códigos, verifica promoções com o mesmo contrato
oficial da integração e pertence ao usuário por 15 minutos. O token Trier fica
somente no ambiente da função.

Na revisão, o usuário confere cada linha: ignorar existentes, criar rascunho,
atualizar um vínculo exato ou vincular uma nova variante com tamanho e quantidade
informados. Identidade oficial nunca é deduzida por nome. EAN e códigos iguais
exigem resolução no cadastro existente; nomes semelhantes exigem confirmação de
produto separado. Atualizações preservam nome, foto, categoria e marca;
substituição de preço/quantidade exige a caixa de confirmação específica.
Fraldas novas exigem tamanho e quantidade por pacote conferidos. Cada código
entra em uma variante própria, compatível com o seletor existente, sem agrupar
automaticamente outros tamanhos ou famílias. O vínculo a outro produto é explícito.

Novos produtos são inativos e pendentes de foto. `product-pending.svg` é uma
indicação textual de pendência, não uma foto de produto inventada. Não podem ser
ativados/publicados antes da foto real. Não se presume estoque de filial 1.
Produtos sem preço válido não são importados: ignorar a linha e revisar na origem.

Confirmações em grupos de até 30 usam chave idempotente e versão esperada do
catálogo, com relatório por código. Uma resposta perdida pode ser recuperada
pelo mesmo lote; não há reaplicação. Grupos já concluídos são preservados caso
um grupo posterior falhe. Novas tentativas com catálogo concorrente exigem
recarregar e revisar novamente. A importação nunca dispara publicação.

## Neur.AI e imagens

Sugestões explicáveis por regras e atributos oficiais: marca conhecida no nome,
apresentação explícita, categoria equivalente existente, nome formatado e
descrição e-commerce retornada. Laboratório não é convertido automaticamente em
marca. Campos não reconhecidos pedem revisão. Não há LLM pago nem leitura de
embalagem por foto configurados nesta entrega.

O editor mantém cadastro manual, upload existente e câmera para fotografia.
A preparação opcional usa a foto inteira, sem recorte, em PNG 1200 × 1200 sobre
tela branca. Mostra original e resultado, envia somente após aprovação e só
troca o produto ao salvar. Não remove fundo original, etiquetas, reescreve rótulo
ou simula tratamento generativo. Fontes externas autorizadas não foram fornecidas.

**Revisão Inteligente** reúne foto/categoria/apresentação/marca, códigos,
variações, duplicados e sincronização antiga. Classificações protegidas continuam
protegidas. Aprovação em lote só preenche conteúdo seguro e classificações
revisáveis, preservando preço, estoque e identificação. Ignorar grava a impressão
dos campos analisados; mudanças posteriores fazem a pendência reaparecer.
Histórico registra antes/depois, usuário, versão e horário. Não restaura preços
ou disponibilidade silenciosamente. Recuperações de preços e classificações
continuam nos fluxos anteriores.

Ordenação por marca, nome, categoria, preço, cadastro e atualização fica
disponível no painel e no catálogo público. A vitrine inicial manual é preservada
até o usuário selecionar outra ordenação. Cards e variantes não são fundidos.

## Banco e implantação

Migration `20261025141849_intelligent_registration.sql` cria:

- `trier_registration_cache`: privado, somente servidor, páginas/prévias com TTL;
- `registration_batches`: privado, somente servidor, chave idempotente;
- `registration_history`: RLS, leitura por equipe ativa, escrita por trigger.

`registration_save` é SECURITY INVOKER, executável somente por service_role.
A função revalida equipe ativa, esquema, versão e chave do lote na transação.
Triggers privados registram mudanças, bloqueiam novas colisões numéricas de
código (001 = 1) e bloqueiam publicação ativa com foto pendente. Nenhuma linha
existente é convertida ou apagada pela migration. O backup inclui histórico e
lotes, mantendo compatibilidade com backups anteriores. Cache temporário pode
ser reconstruído e não faz parte do backup.

Implantar as funções existentes `trier-api` e `admin-api` após a migration.
Manter `verify_jwt=false` existente: ambas validam Auth.getUser, sessão, membro
ativo e quota no corpo. Sincronização de servidor mantém a autenticação atual;
as ações novas exigem usuário autenticado. Sem secret novo. O frontend recebe
somente DTOs limitados; custos, token e respostas brutas não são expostos.

Validação: testes puros, API oficial interceptada, SQL/RLS isolado em PGlite e
interface desktop, Android e iPhone WebKit. Testes de escrita nunca usam a base
real. Registrar no relatório final o estado real da implantação e as limitações
de testes autenticados em produção, sem confundir mocks com consulta real.
