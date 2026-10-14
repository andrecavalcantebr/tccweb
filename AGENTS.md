# TCC Web App — Orientações para Agentes de IA

Leia isto antes de mexer no projeto. Vale para qualquer modelo (Claude, Codex,
Cursor, Copilot etc.). O que o sistema faz e por que é assim está em `docs/`;
aqui ficam as regras de trabalho e as armadilhas que custaram caro.

## O projeto em uma tela

- Web App em **Google Apps Script** (runtime V8), sem build nem dependências.
  Persistência em Google Sheets, documentos em Google Docs/Drive, e-mail por
  `MailApp`. Implantado como `USER_DEPLOYING` (roda como o dono, com acesso
  total ao Drive dele) e acesso "qualquer pessoa com conta Google".
- Tudo o que sobe para o Apps Script está em `src/` (`"rootDir": "src"` no
  `.clasp.json`). `docs/`, `tests/`, `tools/` e `assets/` ficam só no git.
- **Não há módulos.** Todos os `.js` de `src/` são avaliados num único escopo
  global, em ordem alfabética de arquivo. Uma `var` de nível superior que
  dependa de outro arquivo pode ler `undefined` na carga (ver o comentário de
  `_proposalEditableColumns_` em `utils.js`). Prefira funções a constantes
  calculadas no topo.
- Em produção, com alunos reais, desde a versão 1.0.0 (outubro de 2026).

## Regras de segurança — inegociáveis

1. **Toda função global sem `_` no FIM do nome pode ser chamada pelo navegador**
   (`google.script.run`), por qualquer conta Google, com ou sem sessão. O `_` no
   início não protege nada. Função interna termina em `_`
   (`_signMinutes_`, `getTeacherEmails_`). Ver
   [rationale 2.2](docs/rationale.md#22-função-global-é-endpoint-público).
2. Função pública nova precisa entrar na lista `PUBLIC` de
   `tests/public-surface.test.cjs`, e só depois de conferir que **ela mesma**
   resolve quem chama (`new AuthService().getContext()`,
   `assertActiveSession()`, ou `_assertIsAppOwner_()`).
3. Nunca confie em e-mail, papel, ID de planilha/pasta ou status vindo do
   cliente. O e-mail e o papel vêm da sessão (`ctx.email`, `ctx.role`); a
   permissão vem de `TccStateFactory`; o dono do registro é conferido contra a
   planilha. Campos editáveis passam pela allowlist de `_sanitizeProposalInput_`.
4. Toda escrita em planilha passa pelo `SheetDao` (`getSheetManager_`), que
   grava texto iniciado por `= + - @` como texto (`_cellSafe_`). Não escreva
   com `setValues` direto, exceto cabeçalhos fixos.
5. No HTML, todo dado do servidor passa por `escHtml`. Ele **não** escapa aspa
   simples: nunca interpole dado num `onclick='...'` ou numa string JS de
   atributo; passe um índice e busque o dado no array
   ([rationale 7.9](docs/rationale.md#79-eschtml-não-escapa-aspa-simples)).
6. Não ligue `TEST_LOGIN_ENABLED` e não troque `SIGNATURE_SECRET_KEY`. As duas
   implantações compartilham as Script Properties, então ligar a primeira abre
   a produção, e trocar a segunda invalida todas as atas assinadas.

## Armadilhas do Apps Script ao servir HTML

O texto que chega ao navegador não é o arquivo em disco. Três defeitos já
derrubaram páginas inteiras sem nenhum erro visível no fonte:

- `//` dentro de string JS só entre **aspas duplas**. Em aspa simples a limpeza
  de comentários trunca a linha ([rationale 7.10](docs/rationale.md#710--dentro-de-string-só-entre-aspas-duplas)).
- Valor do servidor vai em **atributo HTML** (`data-*`), não interpolado em
  string JS ([rationale 7.11](docs/rationale.md#711-valor-do-servidor-viaja-em-atributo-não-dentro-de-string-js)).
- Scriptlet de impressão vazio (`<?= ?>`) dentro de comentário faz o
  `evaluate()` lançar, e o `include` some com o componente.
- Redirecionar a janela de topo só funciona dentro do gesto do usuário. Troca de
  papel/período são **rotas** navegadas no clique, não callbacks
  ([rationale 7.3](docs/rationale.md#73-redirecionamento-vai-na-navegação-não-no-callback)).

## Fluxo de trabalho

- **Planeje e pergunte antes de aplicar** mudanças de comportamento. Limpezas e
  refatorações fora do escopo do pedido: liste-as ao final e espere o sinal.
- Testes locais (Node 18+, sem instalar nada):

  ```bash
  node --test tests/
  ```

  Rode antes de qualquer `clasp push`. Eles simulam as APIs do Apps Script; não
  substituem testar na implantação de TESTES.
- Publicação (detalhes em [setup-dev.md](docs/setup-dev.md#as-duas-implantações)):

  ```bash
  clasp push -f                                         # só atualiza o HEAD
  clasp deploy -i <ID_TESTES> -d "teste: ..."           # cria a versão N
  clasp deploy -i <ID_PRODUCAO> -V <N> -d "PRODUÇÃO: vN"  # promove a MESMA N
  ```

  `clasp push` sozinho não publica nada. Nunca rode `clasp deploy` sem `-i` (cria
  uma URL nova). **Produção só com autorização explícita do Andre**, e sempre
  promovendo uma versão já testada (`-V <N>`), nunca um snapshot novo.
- Depurar na nuvem: `clasp logs` para o servidor; no DevTools, o código da página
  está no frame `userHtmlFrame`, não no `userCodeAppPanel`.

## Código

- Identificadores em **inglês**; interface e documentação em **português**.
- Comentários em português ou inglês. Comente o **porquê**, não o quê.
- Cabeçalho padrão em todo arquivo:

  ```js
  /**
   * FILE: main.js — Entry point do Web App.
   * DESC: routing of URL to the right view (html)
   * AUTH: Andre Cavalcante
   * DATE: July, 2026
   * LICENCE: GPL-v3
   */
  ```

  Nos `.html`, o mesmo em comentários `<!-- ... -->`, uma linha por campo.
- Nomes de arquivo em `src/`:

  | Prefixo | Conteúdo |
  | --- | --- |
  | `main.js` | `doGet`/`doPost` e o roteador `_route_` |
  | `Service*.js` | Regras de negócio, uma área por arquivo |
  | `Dao*.js` | Acesso genérico a dados (`SheetDao`) |
  | `utils.js` | Enums, colunas (`DB_COLS_*`), helpers |
  | `ui_app_*.html` | Uma view, com o controlador no próprio `<script>` |
  | `ui_comp_*.html` | Componente reutilizável |
  | `ui_asset_*.html` | Imagem em base64, um recurso por arquivo |

  Controladores ficam na própria view; a convenção `ui_ctrl_*` foi abandonada
  (incluir arquivo não compartilha escopo com a view). Reavaliar se uma view
  passar de ~400 linhas.
- Comandos do cliente seguem o caminho `cmd*` → `getContext()` →
  `assertActiveSession()` → serviço → `TccStateFactory` → checagem de dono →
  escrita → log → notificação → payload do painel recalculado.
- Não recrie abas de dados por código: só `Active_Sessions` se auto-recria
  ([rationale 5.3](docs/rationale.md#53-só-a-aba-de-sessões-se-auto-recria)).
  Coluna nova em planilha existente entra por `ensureColumns_`.

## Documentação

Mantenha-a refletindo o código **de hoje**. Histórico fica no `git log`; o
**porquê** de uma decisão não óbvia vai para o `rationale.md`, referenciado de
onde a decisão aparece.

| Documento | Para quê |
| --- | --- |
| [specs.md](docs/specs.md) | O que o sistema faz, regras de negócio |
| [arch.md](docs/arch.md) | Como está construído: camadas, rotas, views, serviços |
| [rationale.md](docs/rationale.md) | Por que cada escolha, e o que dava errado do outro jeito |
| [data-structure.md](docs/data-structure.md) | Planilhas, abas, colunas, status, templates |
| [features/](docs/features/) | Cada funcionalidade em detalhe |
| [diagrams/](docs/diagrams/) | Uma cadeia de chamadas (Mermaid) por funcionalidade |
| [checkpoint.md](docs/checkpoint.md) | Estado atual e próximo passo |
| [roadmap.md](docs/roadmap.md) | O que ainda não existe e já está decidido |
| [setup-dev.md](docs/setup-dev.md) | Ambiente, implantações, testes |
| [deploy-joomla.md](docs/deploy-joomla.md) | Publicação em `feec.ufam.edu.br/tccweb` |

Ao mudar código, atualize no mesmo commit:

- coluna nova → `utils.js` e `data-structure.md`;
- rota, view ou serviço novo → `arch.md`;
- fluxo novo ou alterado → a página em `features/` e o diagrama em `diagrams/`
  (cada diagrama lista no topo as funções-fonte; use isso para achar qual rever);
- decisão com motivo não óbvio → `rationale.md`.

Markdown sem avisos do lint do VSCode: linha em branco ao redor de listas,
tabelas com `| --- |`, listas numeradas sequenciais e todo bloco de código com
linguagem (`plaintext` para texto genérico).
