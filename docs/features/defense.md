# TCC Web App — Defesa, Ata e Assinaturas

Fase 4 do fluxo. Começa quando a banca é homologada (`Banca Homologada`) e
termina com a homologação da defesa pelo Responsável (`Defesa Homologada`), que
abre a revisão e a entrega final.

A defesa em si acontece **fora do sistema**. O que o sistema faz é registrar o
resultado, colher as assinaturas e emitir os dois documentos.

## O caminho, em ordem

1. **Gerar a Ata** — o Orientador, depois da defesa. Cria a linha em `Defenses`
   com uma entrada por membro e sorteia a **chave de validação**, que vai
   impressa nos dois PDFs. A composição da banca fica congelada aqui. Status:
   `Ata Gerada`.
2. **Lançar notas e parecer** — nota de 0 a 10 por membro, parecer da banca
   (Aprovado / Aprovado com Restrições / Reprovado) e observações. **Salvar**
   pode ser feito quantas vezes precisar.
3. **Assinar (Orientador)** — exige todas as notas e o parecer. A partir daqui
   as notas não mudam mais: elas estão dentro do que cada assinatura carimba.
   O sistema gera um token por membro e manda o link de assinatura. Status:
   `Ata Em Assinaturas`.
4. **Assinar (demais membros)** — cada um pelo link do e-mail ou pela seção
   "Atas aguardando a sua assinatura" no painel.
5. **De acordo do aluno** — a **última** assinatura, liberada só quando toda a
   banca já assinou. Vale ao mesmo tempo para a Ata e para a Folha de Aprovação:
   é o mesmo consentimento. Status: `Ata Assinada`.
6. **Homologar** — o Responsável fecha a fase. Status: `Defesa Homologada`.

## Autorização: por pertencimento, não por papel

Assinar é o único ato do fluxo que não se decide pelo papel do usuário. Um
membro pode ser um professor que não orienta aquele aluno, ou um convidado de
outra instituição que não orienta ninguém — os dois entram com papel de
Orientador. O papel diz apenas que a pessoa não é o Aluno; o direito vem de
estar em `Committees.MembersData`.

Daí a seção **"Atas aguardando a sua assinatura"** no painel do Orientador:
sem ela, quem não tem orientandos veria uma lista vazia e não teria onde
assinar.

## Como a assinatura funciona

Não há certificado nem par de chaves — o Apps Script não os oferece. O que há é
um **carimbo de servidor**: HMAC-SHA256 com um segredo que só o servidor lê.

```text
assinatura = HMAC( email | hash | timestamp , SIGNATURE_SECRET_KEY )
```

- **`email`** — sem ele, a assinatura serviria para outro signatário.
- **`hash`** — SHA-256 do **conteúdo canônico** da ata. Sem ele, serviria para
  outra ata.
- **`timestamp`** — sem ele, serviria de novo depois de uma alteração e um recuo.

O **conteúdo canônico** é montado num lugar só (`_canonicalMinutes_`) e reusado
na verificação. Ele cobre o que um adulterador teria interesse em mudar: quem
era o aluno, qual era o trabalho, quem era a banca, que nota cada um deu e qual
foi o parecer. Os membros vão ordenados por e-mail — a ordem da tela não pode
mudar o texto assinado — e nada de derivado entra: a média e as próprias
assinaturas saem do conteúdo, não fazem parte dele.

Consequência prática: **editar a planilha à mão depois das assinaturas invalida
todas elas de uma vez**. É esse o ponto — a assinatura não protege o arquivo,
protege o conteúdo.

O segredo (`SIGNATURE_SECRET_KEY`) nasce sozinho na primeira assinatura e nunca
é regravado: trocá-lo invalidaria tudo o que já foi emitido.

## Via de apoio em papel

Após a homologação da banca e a geração do registro da Ata, o Orientador pode
baixar **Ficha de apoio à defesa (PDF)**, antes de assinar no sistema.
O mesmo template da Ata fornece os dados do aluno, trabalho e banca. Notas,
média, parecer e observações ficam com espaços para preenchimento; assinaturas,
datas de assinatura, de acordo e chave de validação ficam vazios. Um aviso no
início identifica a via de apoio sem assinaturas.

A impressão permite recolher as notas durante a defesa e transcrevê-las depois.
Cada solicitação gera uma via de apoio; seu ID não substitui o PDF final.
Textos fixos do modelo permanecem, por isso o template deve usar marcadores
para os conteúdos variáveis e prever espaço para as anotações.

## Os dois PDFs

Emitidos depois do de acordo do aluno, a partir de templates Google Docs
mantidos pelo Responsável — ver "Templates da Ata e da Folha de Aprovação" em
`data-structure.md` para os marcadores.

| Documento | De quem | Conteúdo |
| --- | --- | --- |
| **Ata da Defesa** | Cada membro da banca, e o Responsável | Notas, parecer, observações, média e as assinaturas |
| **Folha de Aprovação** | O aluno, e o Responsável | O mesmo **sem as notas** — ela atesta aprovação, não desempenho |

Cada um é gerado uma vez e reusado: o conteúdo não muda mais depois do de
acordo, e reemitir a cada clique encheria a pasta do período de cópias
idênticas.

Não há linha em branco para assinatura manuscrita. No lugar dela vai o carimbo
de auditoria — nome, titulação, instituição, data e hora, e o prefixo do HMAC —
mais a chave de validação no rodapé. Manter a linha em branco preservaria
exatamente o ciclo de papel que o sistema existe para eliminar; se a Biblioteca
Central recusar o carimbo, a mudança é de template, não de código.

## Verificação

`?page=verify&key=…` recalcula o conteúdo canônico e confere cada assinatura,
uma a uma, mais o de acordo do aluno. O veredito vem primeiro e grande: íntegro
ou não.

Fica **atrás do login Google** — qualquer conta, não só institucional. Abrir a
rota para anônimo exigiria abrir a implantação inteira, e quem verifica uma ata
(outra instituição, banca de progressão funcional) quase sempre tem conta
Google. Se um verificador real esbarrar nisso, a saída é um segundo deployment
só para essa rota, sem tocar no app principal.

## Fase 5 — Encerramento

Depois da homologação da defesa:

1. O aluno faz as alterações da banca, baixa a **Folha de Aprovação** e a insere
   na versão final logo após a folha de rosto.
2. Submete ao RIU — atividade fora do sistema — e recebe o comprovante.
3. Envia no sistema o **PDF final** e o **link do comprovante**. Os dois campos
   ficam abertos e podem ser reenviados: o comprovante costuma chegar dias
   depois do PDF, e trocar um arquivo errado não deveria exigir ajuda de
   ninguém. O status só avança para `TCC Final Submetido` quando **os dois**
   existem.
4. O Responsável confere, lança a nota no e-campus e **finaliza**:
   `TCC Finalizado`.

O PDF final vai para uma coluna própria (`Defenses.FinalWorkFileId`), e não
sobre `Proposals.WorkFileId`: aquele é o arquivo que a banca julgou, e
sobrescrevê-lo apagaria a versão avaliada.

## Encerrar sem banca

Fluxos alternativos do `specs.md`, num mecanismo só, no "Detalhes" da tabela
mestra do Responsável — disponível em **qualquer status não terminal**, porque é
isso que o caso pede: um aluno desiste quando desiste, e um aproveitamento pode
chegar antes da primeira proposta.

| Desfecho | Status final | Campos |
| --- | --- | --- |
| Aproveitamento de estudos | `TCC Finalizado por Aproveitamento` | Parecer + nota |
| Desistência | `Não Finalizado` | Parecer |

O parecer é obrigatório e vai para o registro de atividades com o e-mail de quem
encerrou. É lá que a auditoria vai procurar quando o NDE fechar o procedimento e
a regra real chegar.
