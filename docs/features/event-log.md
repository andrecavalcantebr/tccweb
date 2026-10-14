# TCC Web App - Funcionalidades - Log de Atividades

Registro do andamento de cada TCC, visível nos três painéis. Reúne numa única
linha do tempo o que o **sistema** anotou a cada transição de status e o que as
**pessoas** escreveram.

Estrutura da aba e regras de gravação em `data-structure.md`
("Aba: `Events`"); por que é aba própria e não uma coluna, em
[rationale 8.1](../rationale.md#81-o-log-é-aba-própria-append-only).

## Por que existe

O motivo imediato é de uso: acompanhar o vai e vem entre Aluno e Orientador sem
abrir o Google Doc. O motivo decisivo é **auditoria** — antes disso o sistema
não guardava histórico de transição nenhum. `UpdatedAt` é sobrescrito a cada
mudança, então depois que a proposta era aprovada não havia como responder
"quando foi aprovada?" ou "quem homologou?". O `specs.md` prevê regra de prazo
(defesa até 15 dias antes do fim do período), e prazo sem registro de data não
se comprova.

## O que aparece na tela

Cada painel mostra o mesmo componente (`ui_comp_event_log.html`):

- **Entradas de sistema** — uma por transição ("Proposta submetida para
  aprovação do Orientador.", "Banca homologada pelo Responsável."). Aparecem
  esmaecidas e em itálico.
- **Comentários** — o que uma pessoa escreveu, com o papel, o e-mail e, quando
  há, o destinatário ("Orientador para Aluno").
- **Filtro "Só comentários"** — num ciclo completo são ~10 a 15 transições por
  aluno contra 2 ou 3 comentários; sem o filtro, o que importa afunda no ruído
  automático.
- **Caixa "Escrever no registro"** — disponível nos três papéis.

Ordem: mais recente primeiro.

## Quem pode escrever

Comentar exige a mesma autorização das ações (`cmdAddComment` em
`ServiceEventLog.js`): o Aluno só na própria proposta, o Orientador só nos seus
orientandos, o Responsável em todas. Sem essa checagem, a caixa de escrita
seria um canal aberto a qualquer usuário autenticado.

**Não há mensagem privada**: os três papéis leem o log inteiro. É o que faz
dele um registro de andamento, e não uma caixa de correio.

## Mensagem presa à ação

A caixa do log é o lugar de escrever, mas duas mensagens continuam presas à sua
ação, porque são regra de negócio e não conveniência de tela:

- **Justificativa da devolução** (Orientador): obrigatória. Devolver a proposta
  sem dizer o que ajustar não pode ser possível, e uma caixa livre é opcional
  por natureza.
- O campo "Mensagem para o Orientador (opcional)" do formulário do Aluno
  **deixou de existir**: ele escreve no log e submete, e o comentário fica
  registrado imediatamente antes do evento da submissão.

## O log é o gatilho das notificações

Toda entrada com destinatário dispara um e-mail para quem precisa agir — o log é
o ponto único de enxerto, porque é ele que já sabe a fase e o destinatário de
cada transição. Uma ação gera **um** e-mail, mesmo deixando duas linhas aqui (a
transição e o comentário que veio junto). Ver `features/notifications.md`.

## Não é um chat

Não há conversa livre, e o motivo é que o log é registro de auditoria,
append-only: ida e volta pediria edição, remoção e leitura em separado. Vale
reavaliar depois de o sistema rodar um período inteiro com notificação ligada.
