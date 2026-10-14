# TCC Web App — Visão do Orientador

Todo professor cadastrado e ativo tem esta visão. O Responsável **também** a tem
— criar o período o cadastra como professor, e o seletor do cabeçalho troca
entre as duas.

## Estrutura da tela

Depois do cabeçalho padrão, um painel mestre-detalhe:

- **Lista de orientandos** — as propostas em que o e-mail do professor consta
  como Orientador. Colunas: aluno, título e status.
- **Detalhe** — abre ao clicar. Espelha a barra de fases que o aluno vê e traz,
  ao final, a linha do tempo do TCC com a caixa para escrever nela (ver
  [event-log.md](event-log.md)).

A relação de orientação nasce quando o aluno indica o e-mail na proposta: não há
passo de "aceitar orientando".

### Meus Dados

Botão **Meus Dados**, ao lado de "Meus Orientandos". Nome, titulação,
instituição e telefone — os mesmos campos que o convite pede, agora editáveis
**depois** dele. São o que sai na Ata e na Folha de Aprovação, e quem sabe como
devem aparecer é o dono deles.

O **e-mail não é editável**: é a chave do cadastro e a identidade conferida no
login, na presidência da banca e na assinatura da Ata. Trocá-lo exige um
convite novo, do Responsável.

Antes disso, esses dados só podiam ser escritos **uma vez**, pelo link do
convite. Quem entrou por outra porta — ser indicado Responsável de um período
cadastra a pessoa direto (`ensureTeacher`) — ficava com o nome derivado do
e-mail e sem lugar nenhum para corrigi-lo.

O botão só aparece para quem tem linha em `Teachers`; o comando
(`cmdUpdateMyProfile`) recusa qualquer e-mail sem cadastro ativo, e é sempre o
**e-mail da sessão** que ele grava — nunca um vindo da tela. Por isso não é uma
porta de auto-cadastro de professor (ver
[rationale 2.3](../rationale.md#23-auto-cadastro-de-professor-é-escalada-de-privilégio)).

### Convite aos Alunos

Botão **Convite aos Alunos**, ao lado de "Meus Orientandos". Mostra o **código
de matrícula do período** e o **link de matrícula**, os mesmos que o
Responsável gerencia na guia [Período
Letivo](dashboard-incharge.md#código-de-matrícula-do-período-corrente) — aqui
em **leitura**: sem "Gerar novo", porque regenerar invalida o código para todo
mundo, e essa é uma decisão de período inteiro, não de um Orientador. Existe
para o Orientador repassar o convite aos próprios alunos sem depender do
Responsável a cada vez. O Responsável também orienta e chega aqui trocando de
visão no cabeçalho, então o convite não se repete na visão dele.

Confirmações (Aprovar, Submeter Banca) usam o diálogo próprio do app e nomeiam o
aluno. O retorno da ação aparece na barra de mensagens no topo do painel — que
fica fora das duas views, porque depois de agir o sistema volta para a lista.
"Retornar para Ajustes" não tem confirmação: o painel de justificativa já é a
confirmação.

## Fase 1 — Proposta

Sobre a proposta submetida:

- **Aprovar** — status vai para `Proposta Aprovada` e a homologação é liberada
  ao Responsável.
- **Retornar para Ajustes** — painel inline com a justificativa
  (**obrigatória**), registrada na linha do tempo como mensagem do Orientador
  para o Aluno. Status: `Proposta Retornada Para Ajustes`, com o contador de
  correções incrementado.

O Doc da proposta fica acessível pelo painel; o Orientador é sempre
**comentarista** nele, e os comentários nativos do Docs convivem com a linha do
tempo — um para o texto, o outro para o processo.

## Fase 2 — Desenvolvimento

Sem ação no sistema: a orientação corre fora dele. Quando o aluno conclui,
o **trabalho em PDF** que ele anexou aparece no painel, e é a partir dele que a
banca é montada.

## Fase 3 — Formação da Banca

Responsabilidade inteira do Orientador. Regras completas em
[committee.md](committee.md).

- **Formar Banca** (a partir de `TCC Concluído`) — painel inline com título
  final (pré-preenchido), data e hora, modo (Presencial / Remoto / Híbrido) e de
  3 a 5 membros, cada um com nome, titulação, instituição, e-mail e telefone. A
  primeira linha é o próprio Orientador, presidente da banca: não pode ser
  removida e o **e-mail** não é editável (é ele que o servidor confere contra
  `Proposals.AdvisorEmail`). Os demais campos dessa linha vêm preenchidos do
  cadastro — nome, titulação, instituição e telefone — e são editáveis ali
  mesmo: é o que sai na Ata e na Folha de Aprovação. Para corrigi-los de vez,
  em vez de a cada banca, use [Meus Dados](#meus-dados).
- **Submeter Banca** — status `Banca Submetida`.
- **Editar Banca** — enquanto o Responsável não homologa, o painel reabre com os
  dados gravados e permite reenviar; o status não muda. Não existe devolução da
  banca pelo Responsável.

O nome impresso por `{{MEMBRO_NOME}}` é o campo `nome` salvo na composição da
banca (`Committees.MembersData`), conforme preenchido pelo Orientador. Nos
outros membros, o formulário usa os dados digitados; não busca automaticamente
o nome no cadastro de professores ao informar o e-mail. A validação exige nome
não vazio, mas não verifica se é completo. Alterar o cadastro depois não
atualiza o nome já salvo na banca. Titulação é um campo separado, impresso com
`{{MEMBRO_TITULACAO}}`.

Ao homologar, o sistema **convida sozinho** os membros que ainda não conhece —
essa é, na prática, a porta de entrada mais movimentada de professores. Os dados
que o Orientador digitou vão no convite, e o convidado só confirma e completa.

## Fase 4 — Defesa (Ata)

- **Gerar Ata da Defesa** — após a homologação da banca, inclusive antes da defesa.
  A composição da banca fica congelada aqui. Status `Ata Gerada`.
- **Ficha de apoio à defesa (PDF)** — disponível após gerar a Ata e
  antes de o Orientador assiná-la. Usa o modelo da Ata com dados do aluno e da
  banca, espaços para notas, média, parecer e observações, sem assinaturas ou
  chave de validação. A via recebe uma indicação de apoio à defesa. Depois, o
  Orientador transcreve as anotações no sistema.
- **Salvar Ata** — notas de 0 a 10 por membro, parecer (Aprovado / Aprovado com
  Restrições / Reprovado) e observações. Pode ser feito quantas vezes precisar.
- **Assinar e liberar assinaturas** — exige todas as notas e o parecer. A partir
  daqui as notas não mudam mais, e os demais membros são notificados. Status
  `Ata Em Assinaturas`.

Depois de a Ata estar completa, o Orientador baixa a **Ata em PDF**, que serve
de comprovante de participação na banca.

### Atas aguardando a sua assinatura

Bloco separado, na lista, com as bancas de **outros** orientadores em que esta
pessoa é membro. Sem ele, um professor convidado para uma banca que não é dele —
e o convidado externo, que não orienta ninguém — não teria onde assinar, porque
a tabela acima só mostra orientandos.

O bloco aparece depois que o Orientador assina e libera a Ata, enquanto o
professor ainda não assinou. Cada item mostra nome do aluno, título do trabalho,
data e hora da defesa, resumo da Ata (membros identificados, notas, média,
parecer e assinaturas) e o botão **Assinar**. O aluno não é incluído na lista de
orientandos desse professor. Após a assinatura, o item sai da lista de
pendências; se não houver outras atas pendentes, o bloco fica oculto.

Na liberação da Ata, o sistema também envia aos demais membros, inclusive aos
professores já cadastrados, um e-mail com assunto **Ata aguardando a sua
assinatura**, nome do aluno, título e link individual para assinar. O vínculo
com a pendência no painel usa o e-mail do membro registrado na banca.

A autorização desta fase é por **pertencimento à banca**
(`Committees.MembersData`), não por papel. Ver [defense.md](defense.md).

## Fase 5 — Encerramento

O Orientador assina o documento que declara ser aquela a versão final, usado pelo
aluno na submissão ao RIU. Fora isso, só consulta: confere que o aluno enviou o
comprovante e o PDF final, o que libera o Responsável a fechar o fluxo.
