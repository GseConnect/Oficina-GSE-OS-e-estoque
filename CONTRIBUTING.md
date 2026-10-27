# Como contribuir

## Fluxo de trabalho

1. Crie uma branch a partir da `main`: `git switch -c feat/nome-curto`.
2. Faça commits pequenos no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/): `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`.
3. Antes de abrir o pull request, rode `npm run check` e `npm run build`.
4. Abra o pull request preenchendo o modelo. O CI precisa passar.
5. Peça a revisão do outro desenvolvedor antes de juntar na `main`.

## Padrões de código

- TypeScript em modo estrito, sem `any`.
- Formatação com Prettier (`npm run format`) e regras do ESLint (`npm run lint`).
- Textos da interface em português, curtos e diretos: boa parte dos técnicos tem mais de 50 anos.
- Toda gravação passa pela interface `DataStore` (`src/types.ts`). O Firebase e o modo demonstração precisam continuar com o mesmo comportamento.

## Configuração recomendada no GitHub

- Proteger a branch `main`: exigir pull request e o check **CI** verde antes de juntar.
- Deixar o repositório **privado**: o código e os dados de exemplo são da oficina.
