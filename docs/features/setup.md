# TCC Web App - Funcionalidades - Setup inicial

## Setup inicial

Há 2 setups iniciais:

- Setup do sistema
- Setup do período letivo

### Quem pode rodar o setup

**As duas telas respondem apenas à conta que publicou o Web App.** Quem chegar
ao app antes de o sistema estar configurado vê "Sistema em configuração" e nada
mais — nem a tela, nem o que falta.

Isso não é preciosismo: no teste de 07/Ago um aluno que entrou antes do
Responsável criou um período letivo (sem e-mail de Responsável) e, como criar um
período desativava o anterior, derrubou o período real. Antes disso não havia
checagem nenhuma, sob o argumento de que no bootstrap não há o que verificar.

A verificação não depende de nada já configurado: o Web App roda com
`executeAs: USER_DEPLOYING`, então `Session.getEffectiveUser()` é sempre a conta
dona do script, e basta compará-la com `Session.getActiveUser()`
(`_isAppOwner_` em `ServiceSetup.js`). Contas fora do domínio do Workspace não
resolvem o e-mail e, por isso, nunca casam — negar por padrão.

### Setup do sistema

O setup do sistema exige **duas** propriedades independentes — se qualquer uma delas estiver ausente, a tela de Configuração Inicial aparece pedindo só o que falta:

- **Planilha de registro** (`REGISTRY_SHEET_ID`): se ausente, o sistema mostra uma interface para pegar o local correto no Google Drive, onde o usuário ativo deve ter direitos de leitura e escrita, onde os arquivos serão gravados. O campo aceita tanto o link da pasta colado do navegador quanto o ID puro. O ID desse local é armazenado na script property `DATA_DIR_ID`. O sistema cria uma nova planilha de registro (TCC WebApp - Planilha de Registro) na pasta correta e o seu ID é gravado na Script Property `REGISTRY_SHEET_ID`.
- **Documento modelo da proposta** (`PROPOSAL_TEMPLATE_DOC_ID`): se ausente, o sistema pede o link (ou ID) de um Google Doc criado manualmente pelo Responsável, contendo os marcadores `{{TITULO}}`, `{{NOME_ALUNO}}` e `{{MATRICULA}}`, as seções Resumo/Objetivos/Metodologia/Referências e os logos da UFAM/TCC-WebApp já posicionados — ver `docs/data-structure.md` ("Template da Proposta"). O campo aceita tanto o link completo colado do navegador quanto o ID puro.

E aceita, sem exigir, **mais duas** — os modelos que a Fase 4 duplica:

- **Modelo da Ata da Defesa** (`ATA_TEMPLATE_DOC_ID`)
- **Modelo da Folha de Aprovação** (`APPROVAL_SHEET_TEMPLATE_DOC_ID`)

Esses dois **não entram** em `isSystemSetup()`, e a razão importa: essa função
é o que decide se o app mostra a tela de configuração *no lugar de todo o
resto*. Exigi-los ali travaria uma instalação que só quer rodar as Fases 1 a 3
atrás de uma tela pedindo o modelo de uma Ata que ela não vai gerar tão cedo —
inclusive instalações já em funcionamento. A cobrança acontece no momento em
que ela é real: `_requireTemplate_` (`ServiceSetup.js`), chamado por
`getAtaTemplateId_()` e `getApprovalSheetTemplateId_()` na hora de gerar o
documento, com uma mensagem dizendo exatamente o que configurar e onde.

#### Voltar à tela depois (`?page=setup`)

A tela de configuração aparecia **só** enquanto `isSystemSetup()` fosse falso —
e isso vira verdadeiro assim que registro e modelo da proposta existem. Era uma
porta de mão única: nada configurado depois (os dois modelos acima) tinha onde
ser digitado, e trocar um modelo significava editar a Script Property à mão no
editor do Apps Script.

Agora existe a rota `?page=setup`, que abre a mesma tela a qualquer momento:

```text
https://script.google.com/macros/s/<ID_DA_IMPLANTACAO>/exec?page=setup
```

- **Só a conta que publicou o app** (`_isAppOwner_`), mesma regra do bootstrap:
  a tela aponta o sistema para pastas e documentos do Drive, que é exatamente o
  que o incidente de 07/Ago envolveu.
- **Campo em branco significa "manter o que está lá"**, nunca "apagar". É o que
  permite a tela mostrar três modelos configurados e trocar só um.
- A pasta do Drive continua aparecendo **apenas** enquanto não houver registro:
  criar a planilha de registro é operação de uma vez só.

#### O ID aceito em qualquer formato

Todos os campos aceitam tanto o ID puro quanto o endereço colado da barra do
navegador, em quatro formatos (`_normalizeDocId_`, em `utils.js`):

```text
https://drive.google.com/drive/folders/<id>     pasta
https://docs.google.com/document/d/<id>/edit    Google Doc
https://drive.google.com/file/d/<id>/view       arquivo do Drive
https://drive.google.com/open?id=<id>           link antigo
```

Dados da planilha de registro:

| Campo | Descrição |
| --- | --- |
| Semester | Id do período letivo. Ex.: 2026.2 |
| FolderId | Id da pasta própria do período letivo, criada como subpasta da pasta do sistema (ver "Organização no Drive" em `data-structure.md`) |
| EnrollmentCode | Código que o aluno digita no primeiro acesso para se matricular no período |
| SheetId | Id da planilha do período letivo |
| InchargeEmail | Email do responsável pelo período letivo |
| Status | `Ativo` ou `Inativo` |
| StartDate | Data de início do período letivo |
| EndDate | Data de término do período letivo |

## Setup do período letivo

Se a planilha de registro estiver em branco ou não tiver períodos letivos ativos, o sistema realiza o setup do período letivo: pede **apenas o nome do período** (`Semester`) e monta a pasta e a planilha do período a partir dele.

Duas coisas **não** são perguntadas ao usuário, porque não devem depender do que ele digita:

- **O Responsável** (`InchargeEmail`) é a conta que está rodando o setup — ou seja, a que publicou o app. O campo aparece na tela só como informação; antes ele vinha no payload do formulário, e chegava vazio para contas cujo e-mail a sessão não resolve.
- **O código de matrícula** (`EnrollmentCode`) é sorteado pelo sistema, num alfabeto sem caracteres ambíguos (`I`, `O`, `0`, `1`). Ele aparece no Painel do Responsável, que também pode gerar outro — o que invalida o anterior na hora.

> Não há validação externa do e-mail do Responsável: o papel é concedido por
> essa linha e auditado pelo log. Criar o período **cadastra** essa pessoa como
> professor — ver
> [rationale 2.5](../rationale.md#25-o-responsável-do-período-é-cadastrado-como-professor-ao-criar-o-período).

Uma vez com os dados, uma linha na tabela de registro é inserida com os dados daquele período letivo. Criar um período com nome já existente é recusado — `Semester` é a chave primária do registro, e duas linhas com o mesmo nome tornariam toda busca ambígua.

Esta tela só aparece no bootstrap, quando **não existe nenhum** período ativo. Com o sistema em uso, períodos novos são criados de dentro do Painel do Responsável (guia "Período Letivo", seção "Novo Período Letivo"), que permite ainda indicar outro professor como Responsável — ver `dashboard-incharge.md`. Períodos coexistem: criar um não encerra os outros.

> Para verificar: o quão difícil é fazer uma interface que navegue nas pastas do Drive para "pegar" estas pastas/arquivos, assim como há uma interface no Google Drive Web?
