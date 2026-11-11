# Tonalidades de cabelo

No cadastro da marca e linha, selecione **Tipo de variação → Tonalidades de cabelo** e adicione uma linha por cor. Informe o número (até 15 caracteres), nome (até 80), código reduzido único e preço da tonalidade. EAN e foto própria são opcionais. O preço geral continua obrigatório como referência do cadastro. Limpe o código geral quando utilizar códigos por tonalidade; nenhum código será descartado silenciosamente.

O upload utiliza a autorização administrativa e o armazenamento já existentes. Prepara PNG 1200×1200 com fundo branco, preservando a proporção e os pixels da embalagem, sem recriar rótulos. Confira a imagem antes de salvar. Se não houver foto da cor, a imagem da linha aparece com aviso de referência. Não há cor visual inventada ou foto de outra tonalidade apresentada como específica.

O campo legado `variants[].size` permanece como chave estável do número da tonalidade; `shadeName` e `imageUrl` acrescentam nome e foto. `variantType: shade` ativa o novo fluxo. IDs, códigos, sincronização por variante, lease, filial 2 e histórico continuam os existentes. Tamanhos/apresentações mantêm seu comportamento. O catálogo JSON aceita os metadados novos sem migração de tabelas. Publicar continua sujeito às permissões atuais.

Na vitrine, **Escolher tonalidade** abre o seletor no próprio catálogo. Nome e número ficam disponíveis nas opções e no estoque por cor. A seleção atualiza imagem, preço e código. O carrinho preserva a chave da cor; a mensagem do WhatsApp inclui nome/número, código e quantidade em unidades. O estoque público continua vindo exclusivamente do cache recente da Trier, sem consultas ao ERP por visita.

Os números, nomes e fotos são cadastrados e conferidos pelo administrador. A consulta Trier por código mostra o item oficial e saldo para revisão; não deduz automaticamente a cor, não substitui preço digitado e não reúne cadastros existentes. Cadastre marcas e linhas diferentes separadamente. Nenhum produto real é modificado pela implantação deste recurso.

Testes isolados cobrem cadastro, chave por tonalidade, preço/estoque independentes, fotos, busca por nome da cor, carrinho, mensagem de WhatsApp e compatibilidade com fraldas. A prévia de demonstração não alimenta o catálogo real.
