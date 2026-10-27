<p align="center">
  <img src="src/assets/logo-oficina.webp" alt="Logo da oficina GSE" width="96" />
</p>

<h1 align="center">Oficina GSE · OS e estoque</h1>

<p align="center">
  Protótipo do app de ordens de serviço e estoque da oficina GSE de Congonhas (CGH).<br />
  O técnico entra com o BP e lê QR codes para abrir a OS, retirar peças e fechar a OS.<br />
  O painel do planejamento se atualiza em tempo real.
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" />
  <img alt="Firebase Firestore" src="https://img.shields.io/badge/Firebase-Firestore-FFCA28?logo=firebase&logoColor=black" />
  <img alt="Status: protótipo" src="https://img.shields.io/badge/status-prot%C3%B3tipo-E3285C" />
</p>

## Telas

<table>
  <tr>
    <td align="center"><img src="docs/telas/tecnico-inicio.png" alt="Início do técnico" width="260" /><br /><sub>Início do técnico</sub></td>
    <td align="center"><img src="docs/telas/tecnico-leitura-qr.png" alt="Leitura do QR code" width="260" /><br /><sub>Leitura do QR code</sub></td>
    <td align="center"><img src="docs/telas/tecnico-os-aberta.png" alt="OS aberta" width="260" /><br /><sub>OS aberta</sub></td>
  </tr>
</table>

<p align="center"><img src="docs/telas/painel-frota.png" alt="Painel do planejamento" /><br /><sub>Painel do planejamento: frota em tempo real</sub></p>

<details>
<summary>Mais telas</summary>

<p align="center"><img src="docs/telas/entrada.png" alt="Entrada com o BP" width="480" /><br /><sub>Entrada com o BP</sub></p>
<p align="center"><img src="docs/telas/painel-ordens.png" alt="Ordens de serviço" /><br /><sub>Ordens de serviço com busca e filtros</sub></p>
<p align="center"><img src="docs/telas/modo-apresentacao.png" alt="Modo apresentação" /><br /><sub>Modo apresentação: celular e painel na mesma tela</sub></p>
<p align="center"><img src="docs/telas/etiquetas-qr.png" alt="Etiquetas QR" /><br /><sub>Etiquetas QR para imprimir</sub></p>

</details>

## Funcionalidades

- **Entrada só com o BP**, o número do crachá.
- **Abrir OS** lendo o QR code do equipamento e tocando no problema, ou falando.
- **Pegar peça** lendo o QR code da prateleira. O estoque baixa na hora e o app avisa quando a peça fica abaixo do mínimo. Se a peça estiver em falta, a OS fica como “aguardando peça”.
- **Fechar OS** lendo o QR code do equipamento, que volta a ficar disponível.
- **Painel em tempo real** com disponibilidade da frota, baixados, aguardando peça, estoque crítico, OS, estoque e movimentações, mais alerta sonoro de OS nova.
- **Modo apresentação** e **etiquetas QR** prontas para imprimir.
- **Modo demonstração**: sem configurar o Firebase, tudo funciona com os dados guardados no navegador.

As telas do técnico foram pensadas para quem tem pouca intimidade com tecnologia: botões grandes, poucos passos e textos curtos. Toda leitura de QR também tem uma lista de “QR de teste”, para quando não houver etiqueta por perto.

## Tecnologias

| Parte         | Escolha                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| Interface     | React 19 + TypeScript (modo estrito), Vite 8                                        |
| Dados         | Firebase 12, Cloud Firestore com atualização em tempo real e transações             |
| Leitura de QR | [qr-scanner](https://github.com/nimiq/qr-scanner), com a câmera traseira do celular |
| Etiquetas     | [qrcode](https://github.com/soldair/node-qrcode)                                    |
| Ícones        | [Lucide](https://lucide.dev)                                                        |
| Qualidade     | ESLint, Prettier e GitHub Actions                                                   |

## Começando

Precisa do **Node.js 20.19 ou mais novo**. A versão indicada está no `.nvmrc` (22 LTS).

```bash
npm install
npm run dev
```

Abra o endereço que aparecer (normalmente http://localhost:5173). Sem a configuração do Firebase, o app abre em **modo demonstração**, e duas abas abertas no mesmo computador se atualizam juntas.

Para testar a entrada, use o BP **4617387** ou qualquer BP de 7 números.

| Endereço          | Para quê                                               |
| ----------------- | ------------------------------------------------------ |
| `/#/`             | App do técnico (celular)                               |
| `/#/painel`       | Painel do planejamento (computador)                    |
| `/#/apresentacao` | Celular do técnico e painel lado a lado, para reuniões |
| `/#/etiquetas`    | Etiquetas QR para imprimir                             |

A câmera só funciona em **https** ou no **localhost**. No celular pela rede local, use os QR de teste ou publique no Firebase Hosting, que já é https.

## Ligar no Firebase

1. No console do Firebase, crie um projeto. O recomendado é um projeto separado do GSE Connect, só para o protótipo.
2. Abra **Firestore Database** e crie o banco (região sugerida: `southamerica-east1`, São Paulo).
3. Na aba **Regras**, cole o conteúdo de `firestore.rules` e publique. Se for usar o mesmo projeto do GSE Connect, leia os cuidados mais abaixo antes.
4. Em **Configurações do projeto > Seus apps**, adicione um app **Web** e copie a configuração.
5. Copie `.env.example` para `.env.local` e preencha com esses valores.
6. Rode `npm run dev` de novo. O selo no topo troca de “Demonstração” para “Conectado”.

Na primeira vez, o app grava sozinho os dados de exemplo no Firestore.

## Publicar

### Pelo computador (Firebase CLI)

```bash
npm install -g firebase-tools
firebase login
firebase hosting:sites:create oficina-gse-os   # cria o site do protótipo dentro do projeto
npm run deploy
```

Antes, troque `COLOQUE-AQUI-O-ID-DO-PROJETO` no `.firebaserc` pelo ID do projeto. Se o nome `oficina-gse-os` já estiver em uso, escolha outro e troque também o campo `"site"` no `firebase.json`.

O app fica em `https://oficina-gse-os.web.app`.

### Automático (GitHub Actions)

O workflow `Deploy no Firebase Hosting` fica desligado até ser configurado. Depois de ligado:

- cada push na `main` publica na URL do protótipo;
- cada pull request ganha um link de prévia que dura 7 dias.

Para ligar, em **Settings > Secrets and variables > Actions** do repositório:

1. Crie as **variáveis** `FIREBASE_PROJECT_ID` e `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, com os mesmos valores do `.env.local`.
2. Crie o **segredo** `FIREBASE_SERVICE_ACCOUNT` com o JSON de uma conta de serviço do Google Cloud. Ela precisa dos papéis _Firebase Hosting Admin_ e _API Keys Viewer_.

O workflow `CI` roda sempre, em todo push e pull request. Ele confere o lint, a formatação e os tipos, e gera o build.

### Se for usar o mesmo projeto do GSE Connect

- O `firebase.json` aponta para o site `oficina-gse-os`, e não para o site principal. Assim, publicar o protótipo **não substitui** o gseconnect.web.app. Não apague o campo `"site"`.
- As coleções do protótipo começam com `oficina_`, para não misturar com as do GSE Connect. O prefixo pode ser trocado em `VITE_COLLECTION_PREFIX`.
- **Não publique o `firestore.rules` inteiro**, porque ele substituiria as regras do GSE Connect. Copie só o bloco `match /{colecao}/{documento} { ... }` para dentro das regras atuais.

## Dados no Firestore

Com o prefixo padrão `oficina_`:

| Coleção                 | Documento           | Campos                                                                                                                               |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `oficina_equipamentos`  | `TMX-01`, `NBL-01`… | `kind`, `status` (ok/down/wait), `osId`                                                                                              |
| `oficina_pecas`         | `P1`, `P2`…         | `name`, `fits`, `pn`, `loc`, `qty`, `min`                                                                                            |
| `oficina_ordens`        | número da OS        | `id`, `equipId`, `problem`, `tech`, `techBp`, `status` (open/wait/closed), `openedAt`, `closedAt`, `closedBy`, `parts`, `waitPartId` |
| `oficina_movimentacoes` | automático          | `at`, `kind`, `text`                                                                                                                 |
| `oficina_tecnicos`      | BP                  | `name`                                                                                                                               |
| `oficina_config`        | `contador`          | `nextOs`                                                                                                                             |

Abrir OS, retirar peça, desfazer, marcar como aguardando peça e fechar OS usam **transações**. Assim, dois técnicos nunca baixam a mesma peça ao mesmo tempo, e o número da OS nunca se repete. No painel, **Reiniciar demonstração** grava de novo os dados de exemplo, que ficam em `src/data/seed.ts`.

**QR codes:** o de equipamento é `GSE:EQ:TMX-04` (também aceita só `TMX-04`), e o de prateleira é `GSE:PECA:PN-10021` (também aceita só o P/N).

## Estrutura

```
src/
  main.tsx, App.tsx      entrada e rotas
  data/                  createStore (Firebase ou demonstração), firebaseStore, localStore, seed, regras de negócio
  tech/                  entrada com o BP e telas do técnico
  panel/                 painel do planejamento
  present/               modo apresentação
  labels/                etiquetas QR
  components/            cabeçalho, câmera e leitor de QR, cartão de OS, botões e selos
  lib/                   datas e textos, leitura do QR, alerta sonoro, rotas
  styles.css             visual no mesmo modelo do GSE Connect
```

## Scripts

| Comando           | O que faz                                           |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Servidor local para desenvolver                     |
| `npm run build`   | Confere os tipos e gera a pasta `dist`              |
| `npm run preview` | Serve a pasta `dist`                                |
| `npm run check`   | Lint, formatação e tipos (o mesmo que o CI confere) |
| `npm run format`  | Formata o código com o Prettier                     |
| `npm run deploy`  | Build e publicação no Firebase Hosting              |

## Próximos passos

Antes de usar com dados reais:

- [ ] Regras do Firestore com login (Firebase Authentication). As do protótipo ficam abertas só até 30/11/2026.
- [ ] Validar o BP no cadastro de técnicos, com senha se for o caso.
- [ ] Reconhecimento de voz de verdade no “Outro: falar o problema”.
- [ ] Trocar os dados de exemplo pelo cadastro real de peças (P/N, prateleira e estoque mínimo) e da frota.

## Contribuindo

O fluxo de branches, commits e pull requests está em [CONTRIBUTING.md](CONTRIBUTING.md), e o histórico de versões, em [CHANGELOG.md](CHANGELOG.md).

<sub>Uso interno da oficina GSE.</sub>
