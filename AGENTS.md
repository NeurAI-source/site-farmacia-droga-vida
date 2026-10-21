# Regras do projeto Droga Vida Popular

- O visual atual do site é a referência. Preserve cabeçalho, carrinho do topo,
  banner, carrossel, cores, tipografia, imagens, navegação e estrutura. Não faça
  redesign ou alterações globais de aparência sem solicitação explícita.
- O carrinho flutuante estilo conversa é adicional. Ele e o carrinho do topo
  compartilham os mesmos itens. Não obrigue o cliente a voltar ao início.
- Estoque público vem somente de dados recentes da integração Trier, por código,
  produto/apresentação e filial corretos. Nunca use o estoque antigo do JSON como
  quantidade confirmada. Falta de vínculo ou dado antigo significa consultar,
  não estoque zero. Não confunda pacotes com unidades dentro da embalagem.
- Preserve catálogo, preços, variantes, imagens, usuários e permissões existentes.
  Não use dados reais para testes de escrita. Não execute seed ou reset.
- O fluxo é de pré-pedido pelo WhatsApp: sem reserva, baixa automática de estoque,
  pagamento online ou envio automático de mensagem. Dados de atendimento ficam
  somente na memória da página; segredos permanecem no servidor.
- Trabalhe em branch, execute testes/build e mantenha histórico de revisão.
