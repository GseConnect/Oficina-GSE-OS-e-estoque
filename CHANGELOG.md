# Histórico de versões

## 0.3.0 · 02/11/2026

- Suporte ao **Supabase** (PostgreSQL) como banco do app, com tempo real entre aparelhos.
- Novo arquivo `supabase/schema.sql`: tabelas `oficina_*`, leitura liberada e gravação só por funções do banco (abrir OS, retirar e desfazer peça, aguardar peça, fechar OS, cadastros e reiniciar), com as mesmas regras do protótipo.
- Peças de cada OS agora ficam numa tabela própria (`oficina_ordem_pecas`).
- Ordem de escolha do banco: Supabase, depois Firebase, depois modo demonstração.
- Deploy automático passa a levar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no build.

## 0.2.0 · 02/11/2026

Ajustes para cobrir a Fase 1 da proposta do GSE Connect.

- Abertura de OS com horímetro, localização (oficina ou operação), descrição do problema e fotos.
- Fechamento de OS com serviço executado (com atalhos), horímetro final, conferência das peças e fotos do serviço.
- Minhas OS para o técnico: em aberto, aguardando peça e finalizadas, com detalhes e fotos.
- Entrada só para BP cadastrado.
- Aba Cadastros no painel: equipamentos (prefixo, categoria, localização e horímetro) e técnicos (BP e nome).
- Painel com localização de cada equipamento, tempo em atendimento, detalhes da OS com fotos, resumo do estoque e peças mais usadas nos últimos 30 dias.
- Novas categorias de equipamento: GPU, escada de embarque e outros.

## 0.1.0 · 26/10/2026

Primeira versão do protótipo, para apresentar à coordenação.

- Entrada do técnico só com o BP (número do crachá).
- Abertura de OS, retirada de peças e fechamento de OS por leitura de QR code com a câmera do celular.
- Aviso de estoque abaixo do mínimo e OS “aguardando peça” quando a peça está em falta.
- Painel do planejamento em tempo real: disponibilidade da frota, OS, estoque, movimentações e alerta sonoro de OS nova.
- Modo apresentação (celular e painel na mesma tela) e etiquetas QR para imprimir.
- Dados no Firebase (Cloud Firestore) com transações, ou modo demonstração sem configuração.
- CI no GitHub Actions (lint, formatação, tipos e build) e deploy opcional no Firebase Hosting.
