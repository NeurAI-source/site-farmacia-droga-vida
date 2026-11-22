# Neur.AI — Cadastro e Central de Fotos (MVP)

## Uso no painel
Para administrador/proprietário, após login:
1. **Importar da Trier**: consultar por código reduzido/EAN ou listar, selecionar itens, revisar categorias, preços e duplicidades; salvar em lotes de até 30 no `catalog_draft`.
2. **Central de fotos**: escolher até 30 imagens JPG/PNG/WebP de até 5 MB cada. O nome do arquivo pode conter o código reduzido ou o EAN (exemplo `7891234567890_frente.jpg`) para uma associação sugerida; correspondências ambíguas exigem seleção manual.
3. **Preparar fotos 1200 × 1200**: imagens originais são mantidas somente no navegador durante a revisão, e o sistema gera PNG quadrado com preenchimento branco, sem refazer embalagem ou rótulos.
4. Selecionar manualmente o produto para cada imagem, **marcar a conferência visual** e clicar em **Vincular fotos aprovadas**.
5. Conferir os cadastros e usar o mecanismo de publicação existente. Importação e foto não publicam produtos automaticamente.

## Segurança
- Código da Trier e estoque sempre vêm do backend existente.
- Vínculos de foto só são salvos em produtos sem imagem/pendentes; não sobrescrevem fotos existentes.
- Na etapa de salvar, o catálogo é recarregado; `save_catalog` mantém verificação de versão.
- Upload usa `admin-api` e `product-images` já existentes; não cria credenciais, storage policies ou tabelas.
- Se houver falha depois do upload e antes do salvamento, os arquivos podem permanecer não vinculados no armazenamento e precisam de limpeza administrativa posterior.
- A remoção automática de fundos complexos, etiquetas de preço e a procura de imagens oficiais na internet **não estão implementadas nesta primeira fase**. Essas operações precisam de tratamento visual especializado e verificação de fonte, licença e identidade.

## Testes
- `npm test` inclui `tests/photo-queue.test.mjs` com casos de fila pendente, EAN/código exatos e ambiguidades.
- `npm run build` deve empacotar `admin/photo-queue.js` no bundle e copiar `admin/photo-queue.css`.
- Antes de entrar em produção: validar manualmente login admin, consulta Trier, 1 importação em rascunho, 1 upload/associação de foto, prévia, edição e publicação.

## Próxima fase
Busca de fotos oficiais autorizadas por EAN/marca/apresentação, com proveniência, licença, score de correspondência e aprovação obrigatória; além de tratamento de fundo avançado sem recriar rótulos.
