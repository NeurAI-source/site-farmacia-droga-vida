# Neur.AI — Agente de Cadastro e Central de Fotos

Implementação no PR #83. Publicação e ativação da fonte autorizadas pelo responsável em 22/11/2026.

## Usar o agente

1. Entre como administrador ou proprietário e abra **Neur.AI · Cadastro Automático**.
2. Peça `Preparar 50 produtos de perfumaria` ou use **Buscar produtos na Trier**. Quantidades: 10, 30, 50 ou 100. O filtro conservador usa as regras de categorias existentes, consulta apenas a filial 2, ignora identificadores oficiais já cadastrados e examina até 2.000 registros / 40 páginas por solicitação.
3. Revise a janela de importação, categorias, possíveis duplicidades, promoções e vínculos de variantes. Confirme os itens desejados: o fluxo existente salva rascunhos inativos em lotes de até 30. Não une variantes por semelhança de nome nem publica. Consultas e sugestões não salvam sem confirmação.
4. Abra **Central de fotos** e selecione pendências. **Encontrar fotos automaticamente** consulta por EAN exato, até 30 imagens por etapa; para mais produtos, conclua a etapa e continue. Também é possível enviar até 30 arquivos JPG/PNG/WebP de até 5 MB cada. Nome de arquivo com código ou EAN sugere somente um destino inequívoco, inclusive a variação exata.
5. Use **Preparar imagens**. Confira original e PNG final lado a lado, volume, tamanho, quantidade e tonalidade. Cada foto precisa de aprovação visual e de autorização de uso. Rejeite candidatas inadequadas. Trocar uma foto existente exige uma autorização adicional.
6. **Salvar aprovados** faz upload autenticado e salva somente os vínculos aprovados no rascunho. Preços, estoque, IDs, disponibilidade e ativação são preservados. Depois revise os cadastros e utilize o fluxo normal de publicação, somente com aprovação.

## Fonte externa verificada e configuração

A API pública **Open Beauty Facts** foi consultada com sucesso em 22/11/2026. É uma base colaborativa de cosméticos, não um contrato com fabricantes ou distribuidores. A cobertura brasileira pode ser pequena; nenhum resultado é garantia de embalagem correta. Não há API de imagens documentada no DTO de produto da Trier consultado. Não foi criada integração fictícia com fornecedores.

- Documentação oficial: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/scanning-cosmetics-pet-food-and-other-products/
- Licenças: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/
- Imagens: CC BY-SA 3.0, com atribuição, indicação das alterações e mesma licença para a foto preparada. Créditos são exibidos junto às novas imagens no catálogo, detalhes e carrinho; a origem e o autor ficam no histórico. Não equivale a uma autorização de uso de marcas de terceiros.
- Não há scraping, busca geral de imagens, conta nova, contratação ou serviço pago.

Após a autorização do responsável em 22/11/2026, a fonte fica **habilitada na configuração versionada do backend**. Não exige uma nova chave privada nem um novo secret. A variável de ambiente do servidor tem prioridade e pode desativar a fonte com `PHOTO_OPENBEAUTY_ENABLED=false`. Para habilitar explicitamente pelo ambiente, use:

```text
PHOTO_OPENBEAUTY_ENABLED=true
```

Não exige novo token, migration, tabela, política RLS ou bucket. Reutiliza o cache privado `trier_registration_cache` (candidatas e resultados negativos: 24 horas), upload `product-images`, `save_catalog` com versão esperada, e o histórico `registration_history`. Não alterar os secrets já existentes. Não colocar credenciais da Trier, service role ou tokens GitHub no frontend. A ativação foi autorizada pelo responsável; a aprovação visual e de uso de cada foto continua obrigatória.

Limites: metadados por EAN com User-Agent da aplicação, timeout de 10 segundos, no máximo uma leitura a cada janela global de seis segundos, compartilhada entre administradores; resultado de erro não vira foto aprovada. Só permite imagens HTTPS do host e caminho do EAN autorizados; não aceita URL arbitrária do navegador nem redirecionamentos. A imagem é baixada pelo backend, limitada a 3 MB e inspecionada. Upload local/final limitado a 5 MB. Se o cache da candidata expirar, é preciso consultar novamente.

## Preparação de imagens e limites reais

Gera PNG 1200 × 1200, enquadramento central, margens brancas e proporção preservada, com recorte opcional de bordas externas. Detecta baixa resolução e não afirma recuperar detalhes ausentes. Não recria rótulos, altera cores, apaga textos ou inventa fotos.

**Ainda depende de revisão/processamento externo:** remoção de fundos complexos, etiquetas sobre a embalagem e nitidez avançada. Um fundo originalmente colorido não é apagado pelo enquadramento branco. Nesses casos, rejeite a imagem ou forneça uma foto já adequada. Não há contratação automática de ferramenta de IA. Fotos confiáveis não encontradas continuam pendentes.

A central pode verificar carregamento e resolução de até 100 destinos por operação, filtrar erros/baixa resolução e sinalizar EAN divergente do vínculo anterior. Não existe reconhecimento visual que comprove a embalagem; a conferência humana continua obrigatória. Produtos e variantes têm destinos próprios; foto de variante nunca preenche silenciosamente a foto geral do produto.

## Concorrência, recuperação e histórico

- Durante as consultas/preparação mantenha a aba aberta; o processamento não é um serviço autônomo em segundo plano. Parar preserva a fila atual. Limpar/recarregar a página descarta os arquivos e a revisão que ainda estão somente no navegador.
- Na confirmação recarrega o catálogo, compara foto/EAN/código com a revisão e verifica a versão novamente depois do upload. `save_catalog` bloqueia concorrência remota.
- Falha preserva a fila aberta e URLs de uploads já confirmados. Tente novamente sem repetir o cadastro/importação. Se a resposta do salvamento se perder, o identificador da operação na foto permite reconhecer o salvamento no catálogo e não aplicá-lo duas vezes. Lotes Trier usam o mecanismo existente de recuperação/idempotência.
- A auditoria existente registra ator, horário, versão e produto antes/depois, incluindo origem, licença, aprovação, processamento e imagem anterior. O ator e os valores anteriores permanecem no histórico privado; não são acrescentados aos metadados de foto do catálogo público. Consulte **Revisão Inteligente → Histórico de cadastros**.
- Arquivos enviados antes de uma falha definitiva podem ficar sem vínculo no Storage. Não há limpeza destrutiva automática.
- A interface e as ações de fotos/importação exigem admin/owner. O cadastro manual e sua consulta individual continuam com as permissões existentes. Nenhum acesso adicional foi concedido.

## Validação

`npm test`, `npm run build`, `npm run test:ui`. A suíte de interface do PR foi corrigida para refletir o retorno das telas de importação/revisão, mantendo o teste real do cadastro manual. Foram acrescentados testes de importação pelo agente, fotos PNG reais, variações, aprovação/rejeição, substituição, conflito, recuperação de resposta perdida e permissões. Integrações externas são isoladas por fixtures nos testes de escrita; nenhum produto fictício é salvo no Supabase da farmácia.

Estado consultado do banco em 22/11/2026: versão 724, 325 produtos principais e 118 variações. Consulta somente leitura, sem migrations ou alterações comerciais. Validar novamente antes de implantar; essa contagem é um registro da consulta, não uma constante do sistema.

Para homologação real autenticada: usar ambiente isolado ou cadastros aprovados pelo responsável. A validação automatizada com fixtures não significa que a nova Edge Function já esteja implantada, que uma foto da farmácia foi licenciada/aprovada ou que houve publicação em produção.
