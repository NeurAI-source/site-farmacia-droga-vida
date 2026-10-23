# Redução de tráfego de mídia

O build gera prévias de até 480 × 480, sem cortes, preservando proporção e transparência. Apenas URLs públicas do bucket `product-images` do projeto configurado são aceitas; URLs assinadas, autenticadas, de outros projetos ou outros buckets não entram no artefato público.

As prévias são publicadas em `assets/product-previews/` no Cloudflare Pages. Cards, produtos relacionados e carrinho as usam; imagens das páginas de detalhe continuam com sua origem original. O catálogo e os objetos Supabase permanecem intactos. A associação por URL exata evita mostrar uma imagem antiga quando o produto ganha uma nova URL.

O cache `.media-cache` contém apenas originais que já eram públicos. A primeira publicação busca os arquivos uma vez; as seguintes reutilizam o cache. Todo build processa o catálogo publicado atual e inclui suas novas URLs. Uma falha de geração impede publicar um artefato incompleto. O log informa bytes de originais e prévias. A retirada das alterações de código restaura o comportamento anterior, sem migração de dados.

As campanhas privadas continuam privadas. Seu controlador cancela os temporizadores de consulta e de fronteira quando a aba fica oculta, não inicia novos pedidos nesse estado e revalida a licença de exibição ao retornar. Uma chamada já em andamento pode terminar, mas não deve reabrir o carrossel oculto. Agendamento, expiração, cache de imagens em memória e intervalo de tentativas em falhas são preservados.

O backup usa transferência incremental de imagens e artefatos diários completos; veja `BACKUP.md`. Não requer R2, novas credenciais ou alterações de permissões. A ativação do R2 e eventual migração ficam fora desta entrega.

Validação: testes de imagens (proporção, transparência, limites de origem e cache), recuperação criptográfica dos dois formatos, corrupção/rotação/revisão do cache, carrossel em desktop/mobile e verificações de catálogo, estoque e carrinho. Medir economia real de Egress em janelas equivalentes após implantação; consumo acumulado do ciclo não é apagado.
