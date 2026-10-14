# TCC Web App — Visão do Aluno

## Como o aluno entra

No primeiro acesso ele não existe para o sistema. A porta é o **auto-cadastro**,
por uma de duas formas:

- o **link de matrícula** que o Responsável divulga (leva ao formulário com o
  código já preenchido);
- o **código do período**, digitado à mão — é o que vai impresso no Plano de
  Ensino.

O formulário pede nome, matrícula, e-mail e telefone (opcional). A matrícula é a
chave: recadastrar a mesma pessoa atualiza a linha, e uma matrícula que já
pertence a outro e-mail é recusada. Ver [login.md](login.md).

## Estrutura da tela

Depois do cabeçalho padrão:

- **Barra de fases** no topo (`ui_comp_flow_steps.html`): Proposta,
  Desenvolvimento, Banca, Defesa, Encerramento. As fases já cumpridas aparecem
  concluídas, a atual em destaque e as futuras travadas. É um **indicador**, não
  um menu: não se navega por ela.
- **Barra de mensagens**, logo abaixo.
- **Corpo**: o cartão da fase atual.
- **Barra de ações**, no rodapé do cartão.
- **Linha do tempo** do TCC ao final, recolhida por padrão, com a caixa para
  escrever nela — ver [event-log.md](event-log.md).

O aluno vê **um único TCC**, o dele.

### Período letivo

O aluno **não escolhe** período: vê sempre o mais recente em que está
matriculado. Quem desistiu de um período e se matriculou no seguinte não tem
mais nada a fazer no anterior, e oferecer os dois só convidaria ao erro. Quem
encerra o período antigo — marcando o aluno como não finalizado — é o
Responsável.

## Fase 1 — Proposta

O aluno começa na proposta vazia e preenche os **dados estruturados** no
formulário: título, matrícula, contatos e a data prevista da defesa.

Ao salvar pela primeira vez, o sistema duplica o template e cria o **Google Doc
da proposta**, onde ele escreve Resumo, Objetivos, Metodologia e Referências com
formatação rica — inclusive tabelas. Um link "Abrir Documento da Proposta" leva
direto para lá.

Ações: **Limpar**, **Salvar rascunho** e **Submeter**.

**Submeter salva o que está na tela**: os dados do formulário vão junto do
comando e o servidor grava antes de mudar o status, então nunca é preciso salvar
antes de submeter. O que **não** dá para fazer é submeter sem nunca ter salvado:
é o rascunho que cria o Doc, e submeter sem ele mandaria ao Orientador um
documento em branco — ver
[rationale 4.2](../rationale.md#42-submeter-exige-rascunho-salvo).

O e-mail do Orientador é conferido enquanto o aluno digita: o nome aparece
quando o professor está cadastrado, e a submissão é recusada quando não está —
com a pendência indo para o painel do Responsável, que cadastra na hora.

### Em aprovação

O aluno aguarda. O Orientador pode aprovar ou **devolver para ajustes**, sempre
com justificativa obrigatória, que fica na linha do tempo. O sistema conta as
correções. Antes de reenviar, o aluno pode escrever no mesmo log explicando o que
mudou.

O acesso ao Doc segue o estado do formulário: **editor** enquanto está em
rascunho ou devolvida, **comentarista** depois de submetida — para o Orientador
revisar um documento parado. O Orientador é sempre comentarista.

Aprovada e homologada, a fase vira somente leitura; o Doc segue acessível para
consulta.

> Baixar a proposta em PDF é resolvido nativamente pelo Google Docs
> (Arquivo → Fazer download), sem funcionalidade própria no sistema.

## Fase 2 — Desenvolvimento

O trabalho corre fora do sistema, sob orientação. A tela tem **uma ação**:
concluir o desenvolvimento — e ela **exige o trabalho em PDF anexado**. O
arquivo é gravado na pasta do período e pertence ao app, que por isso consegue
compartilhá-lo com a banca sozinho. O limite de upload é de 20 MB, conferido nos
dois lados.

Sem o anexo não há conclusão: a fase terminaria numa alegação, e o Orientador
montaria banca para um trabalho que o sistema nunca viu —
[rationale 4.3](../rationale.md#43-concluir-o-desenvolvimento-exige-o-pdf).

## Fase 3 — Formação da Banca

Quem monta a banca é o Orientador (ver [committee.md](committee.md)). O aluno não
tem ação aqui: a tela mostra, em leitura, o título final, data e hora, modo da
defesa e a lista de membros, com a mensagem correspondente ao estado
("aguardando homologação" → "banca homologada").

## Fase 4 — Defesa

A defesa acontece fora do sistema. Depois dela, o Orientador lança notas e
parecer na Ata e assina; cada membro da banca assina em seguida.

Na visão do aluno, as notas individuais aparecem como **Membro 1**, **Membro 2**
etc., em ordem crescente de nota, com campos vazios ao final. Essa numeração
não corresponde à ordem nominal da banca. A lista de notas enviada ao aluno
não inclui nome real, e-mail, titulação, instituição, presidência ou data de
assinatura do avaliador. A média permanece visível; as demais visões mantêm
a identificação dos membros.

O aluno é o **último a assinar**, e a assinatura dele é um **de acordo** — vale
ao mesmo tempo para a Ata e para a Folha de Aprovação, porque é o mesmo
consentimento. A fase não se fecha aí: o Responsável homologa, e é isso que abre
a revisão.

Assinada a Ata, o aluno passa a poder baixar a **Folha de Aprovação em PDF**,
com chave de validação, para anexar ao trabalho logo após a folha de rosto.

## Fase 5 — Encerramento

O aluno faz as alterações sugeridas pela banca e o Orientador dá a revisão
final, assinando o documento que declara ser aquela a versão definitiva. Com
ele, o aluno submete ao **RIU** (Repositório Institucional da UFAM) — atividade
fora do sistema — e recebe o Comprovante de Depósito.

De volta ao sistema, duas entregas: o **PDF final** e o **link do comprovante
do RIU**. Podem chegar em momentos diferentes e ser reenviadas — o status só
avança quando as duas existem. Ver [defense.md](defense.md).

O acesso só termina quando o Responsável encerra o período letivo: ele sai da
lista de ativos e a entrada falha. A matrícula continua gravada — o registro do
que aconteceu não se apaga junto com o acesso.
