# Categorias inteligentes

O painel reutiliza `catalog_draft`, `save_catalog` e a publicação existentes.
Não há chave de IA ou serviço pago novo. A classificação usa regras locais
explicáveis, com termos explícitos do nome; marcas isoladas e nomes ambíguos
não são suficientes. Os grupos/categorias existem na documentação Trier, mas
o adaptador atual ainda não os importa. Não são apresentados como fonte usada.

## Uso

- **Categorias → Completar categorias da farmácia** adiciona opções ausentes,
  incluindo absorventes, esmaltes, cabelos e cuidados adultos. Não recategoriza
  produtos existentes. As categorias anteriores e seus IDs são preservados.
- **Nova categoria / Editar / ↑ / ↓ / Remover** gerenciam a estrutura. Ao remover
  uma categoria, escolha o destino dos produtos. Subcategorias em uso não podem
  ser removidas sem transferir seus produtos antes. A ordem das linhas no editor
  controla a ordem das subcategorias.
- No cadastro, **Sugerir categoria pelo nome** preenche uma sugestão que precisa
  ser conferida antes de salvar. Novos produtos recebem a sugestão ao terminar
  de preencher o nome. A marca sozinha nunca determina a categoria.
  Colágeno (inclusive `COLAG`) sugere **Suplementos → Colágenos**;
  ômega, vitaminas, polivitamínicos, biotina, whey e creatina também têm regras.
  Colágeno com vitaminas continua em Colágenos; ingredientes de cosméticos não
  transformam shampoo, creme ou sérum em suplemento. Kits exigem revisão.
  A sugestão usa o nome digitado, não reconhecimento da embalagem por foto.
  Opções ausentes são preparadas no formulário e persistidas ao salvar; também
  podem ser adicionadas por **Completar categorias da farmácia**, sem trocar
  classificações existentes.
- **Neur.AI → Organizar catálogo**, também disponível em Categorias, mostra o
  valor anterior e a sugestão. Marque as linhas desejadas e confirme. Escolhas
  manuais protegidas só podem ser alteradas no editor do produto.
- **Completar subcategorias vazias automaticamente** é uma opção compartilhada
  do catálogo, desativada inicialmente. Quando ativada, funciona ao salvar e a
  cada minuto com o painel aberto e sem formulários em edição. Só preenche
  subcategorias vazias com correspondência inequívoca dentro da categoria atual.
  Não é um trabalho de servidor que roda com o painel fechado.
- **Consultar histórico de classificação → Revisar recuperação** permite
  conferir e recuperar classificações anteriores. Alterações posteriores no
  mesmo produto bloqueiam a recuperação do lote; preços e estoque atuais são
  preservados. A recuperação fica protegida contra a próxima passagem automática.

Todas as mudanças de catálogo permanecem em rascunho até a publicação normal.
A automação de preços do Neur.AI mantém seu funcionamento e suas permissões.
Nomes, apresentações, imagens e possíveis duplicados são revisados manualmente.
Preço e estoque continuam vindo da integração Trier, sem estimativas da IA.

## Banco e segurança

Migration `20261023173424_intelligent_categories.sql`: cria `category_history`,
RLS de leitura para membros ativos e trigger de auditoria no catálogo existente.
A identidade e os horários vêm do banco. Não há escrita direta no histórico por
usuários do painel, e não há acesso anônimo. A trigger registra estrutura,
configuração e classificações, sem alterar dados comerciais.

O salvamento usa a versão esperada: dois operadores concorrentes não sobrescrevem
silenciosamente o trabalho um do outro. Falhas de conexão não reaplicam lotes.
O backup inclui o histórico e aceita também arquivos de antes dessa atualização.

Validação usa produtos fictícios no navegador e Postgres isolado com PGlite;
não cria produtos, campanhas ou pedidos no banco real durante testes.
