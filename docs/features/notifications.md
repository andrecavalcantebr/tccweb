# TCC Web App - Funcionalidades - Notificações por e-mail

Fatia A do plano (ver "Próximos Passos" no `checkpoint.md`). Atende ao
`specs.md`, "Funcionalidades gerais": *em cada etapa, todos os envolvidos devem
ser notificados no app e via e-mail*.

## Quando dispara

Sempre que o **log de atividades** registra alguma coisa que tenha destinatário:

| Origem | Exemplo |
| --- | --- |
| Transição de status | Aluno submete a proposta → e-mail ao Orientador |
| Transição com mensagem junto | Orientador devolve para ajustes com a justificativa |
| Comentário avulso endereçado | Aluno escreve no registro enquanto a proposta está com o Orientador |

Uma **ação de uma pessoa gera um único e-mail**, mesmo quando deixa duas linhas
na linha do tempo (a transição e o comentário que veio com ela). É o que
`EventLogService.logAction` garante — antes, transição e comentário eram
gravados por dois caminhos independentes, e notificar nos dois mandaria a
mensagem duplicada.

Nada é enviado quando o evento **não tem destinatário**. Isso acontece quando
quem escreve já é o responsável da vez: a entrada é uma nota pública na linha do
tempo, e não há ninguém esperando por ela.

## Quem recebe

**Quem precisa agir** — o destinatário que a transição implica, resolvido em
`EventLogService._recipientFor` (da própria transição, ou derivado do status via
`TCC_STATUS_RESPONSIBLE`).

O `specs.md` diz "todos os envolvidos". Aqui isso está atendido em duas
metades, de propósito:

- **No app**, todos veem tudo: o registro de atividades é compartilhado pelos
  três painéis, com a linha do tempo inteira.
- **Por e-mail**, só quem tem o que fazer. A alternativa — copiar os três
  papéis em toda transição — poria o Responsável na cópia de cada rascunho
  criado, cada submissão e cada devolução de **todos** os alunos do período. O
  e-mail viraria ruído, e o efeito prático seria o Responsável filtrando a
  caixa, ou seja, deixando de ler.

Trocar essa regra é mudar um lugar só (`EventLogService._notify`), caso a
prática mostre que faltou aviso a alguém.

O endereço vem de onde ele é verdade no momento do envio: Aluno e Orientador da
própria proposta (`StudentEmail`/`AdvisorEmail`), Responsável da linha do
período (`Semesters.InchargeEmail`) — assim uma troca de Responsável no meio do
período notifica quem tem o papel agora, e não quem o tinha quando o TCC
começou.

## O que o e-mail leva

Assunto: `[TCC-WebApp] <status> — <título do TCC>`.

Corpo: a mensagem do sistema, o comentário da pessoa (quando houve), os dados de
identificação (TCC, aluno, situação, período letivo) e os **links**: o do
sistema, o do Documento da proposta e o do trabalho enviado.

**Sempre link, nunca anexo.** O `MailApp` tem teto de 25 MB por mensagem, e uma
banca tem de 3 a 5 membros: anexar o trabalho mandaria o arquivo inteiro uma vez
por membro a cada notificação.

**O link do sistema é o de divulgação, não o da implantação.** Um e-mail
sobrevive ao redeploy que o gerou, e a URL `script.google.com/.../exec` está
presa a uma implantação. O `getPublicAppUrl()` (`utils.js`) devolve a Script
Property `PUBLIC_URL` — `https://feec.ufam.edu.br/tccweb` — e cai na URL da
implantação corrente quando ela não está definida, que é o caso em
desenvolvimento. Vale só para links sem query string: os links com token
continuam apontando para a implantação, porque o Joomla não repassa parâmetros
(ver `setup-dev.md`, "Publicação na página da FEEC").

## Regras de operação

- **Falhar no e-mail nunca derruba a ação.** Mesmo contrato do log de eventos:
  o erro vai para o console e a transição segue. Perder uma homologação porque o
  servidor de e-mail engasgou seria pior que perder o aviso.
- **Chave de desligamento**: a Script Property `NOTIFICATIONS_ENABLED` com o
  valor `false` silencia o envio. Serve para depurar em nuvem sem disparar
  e-mails reais. Qualquer outro valor (ou a ausência dela) mantém o envio
  ligado — um sistema de notificação que não notifica em silêncio é pior que um
  que precisa ser desligado de propósito.
- **Cota diária**: o envio sai da conta que publicou o app (`USER_DEPLOYING`),
  com o teto do `MailApp` — 1.500 mensagens/dia numa conta Workspace. Quando a
  cota acaba, o envio é pulado com registro no console, em vez de lançar erro
  dentro de uma ação.
- **Remetente**: a conta que publicou o app, exibida como
  `TCC-WebApp (FEEC/UFAM)`. Responder ao e-mail não registra nada no sistema, e
  o rodapé diz isso.

## Implementação

| Arquivo | Papel |
| --- | --- |
| `ServiceNotification.js` | `NotificationService.notifyStep` — resolve destinatário, monta corpo e envia; `isEnabled`, cota e contrato de falha |
| `ServiceEventLog.js` | `logAction` (transição + comentário numa notificação só), `_notify` e o enxerto em `logTransition`/`logComment` |
| `ServiceProposal.js` | `_logAction` passou a delegar para `EventLogService.logAction` |
| `appsscript.json` | Escopo `script.send_mail` (exigido pelo `MailApp`) |

> **Atenção operacional**: o escopo `script.send_mail` obriga a **reautorizar o
> app** no próximo acesso depois do deploy, e a implantação precisa de **versão
> nova publicada** — o `/exec` serve a versão publicada, não o HEAD.
