# Checkpoint — Estado do Projeto

Onde o projeto está e o que vem a seguir. O **histórico** de como se chegou aqui
está no `git log`; as **razões** que precisam sobreviver estão em
[rationale.md](rationale.md); o que ainda não existe, em
[roadmap.md](roadmap.md).

## Onde estamos

**Versão 1.0.0 em produção** desde 13/10/2026: tag `v1.0.0` no GitHub e versão
153 do Apps Script, servida pelas duas implantações (PRODUÇÃO e TESTES). O
sistema está em **validação com alunos reais**, que sabem que podem encontrar
defeitos e mudanças. A tarefa agora é uso intenso, para achar defeitos antes
das primeiras defesas.

| Fase | Estado |
| --- | --- |
| 1 — Proposta (com Google Doc) | ✅ em uso |
| 2 — Desenvolvimento (com envio do PDF) | ✅ |
| 3 — Formação da Banca | ✅ |
| 4 — Defesa, Ata e assinaturas | ✅ ainda sem defesa real |
| 4b — Os dois PDFs e a verificação | ✅ ainda sem defesa real |
| 5 — Encerramento / RIU / nota final | ✅ |
| Fluxos alternativos (aproveitamento, desistência) | ✅ |
| Log de atividades e notificações | ✅ |
| Identidade própria e convites | ✅ em uso |
| Consolidado do período (CSV) | ✅ |

Em 13/10/2026 houve uma revisão de segurança: as funções internas deixaram de
ser chamáveis pelo navegador e o texto digitado deixou de poder virar fórmula
([rationale 2.2](rationale.md#22-função-global-é-endpoint-público) e
[5.7](rationale.md#57-texto-digitado-nunca-vira-fórmula)). A
`SIGNATURE_SECRET_KEY` foi trocada nessa data; como ainda não havia defesas,
nenhuma assinatura real foi invalidada.

## Próximo: reprovação como estado terminal

O parecer **Reprovado** não muda o fluxo: a defesa é homologada, o aluno é
chamado a depositar no RIU e termina em `TCC Finalizado`. Falta um status
terminal de reprovação, e o parecer sugerido pela média (≥ 5,0 → Aprovado;
< 5,0 → Reprovado), com "Aprovado com Restrições" escolhível. O consolidado já
contorna isso lendo o parecer. Também falta o motivo no "Não Finalizado"
(hoje tudo sai como Desistência).

É preciso resolver isso **antes da primeira defesa com reprovação**.

## Roteiro de regressão

Para depois de mudanças grandes, na implantação de TESTES. Os passos 1 a 4
preparam o terreno; os demais são o fluxo.

1. `node --test tests/`, depois `clasp push -f` e `clasp deploy -i <ID_TESTES>`.
   O `/exec` serve a versão implantada, não o HEAD.
2. Se surgir escopo novo no manifesto, rodar `diagnoseAllPermissions()` no editor
   com a conta do dono, para consentir todos os escopos de uma vez.
3. `NOTIFICATIONS_ENABLED=false` enquanto depura, para a rodada não virar uma
   leva de e-mails reais. Lembre que a propriedade vale também para a produção.
4. Abrir a URL em janela anônima **sem conta Google**: deve dar "Conta Google
   necessária", nunca um painel.
5. Fluxo completo: criar período → conferir que o Responsável virou professor →
   copiar o link de matrícula → auto-cadastro de um aluno → convidar um professor
   por e-mail e completar o cadastro pelo link → rascunho → submissão →
   aprovação → homologação, conferindo a notificação a cada passo.
6. Ciclo do aluno até o envio do PDF.
7. **Fase 4**: gerar a Ata → lançar notas e parecer → assinar como Orientador →
   assinar com uma segunda conta pelo link do e-mail → de acordo do aluno →
   homologar. Conferir que o de acordo é recusado enquanto faltar assinatura.
8. **PDFs**: emitir Ata e Folha de Aprovação, conferindo os marcadores e a
   expansão da tabela de membros; depois verificar a chave pelo botão
   "Verificar documento" do cabeçalho.
9. **Adulteração**: mudar uma nota à mão na aba `Defenses` e verificar de novo:
   todas as assinaturas devem passar a não conferir.
10. **Fase 5**: entregar só o PDF (não deve avançar), depois o comprovante do
    RIU (deve avançar), e finalizar.
11. **Encerrar sem banca**: um aluno por desistência e outro por aproveitamento.
12. Com sessão aberta, no console do navegador (frame `userHtmlFrame`):
    `google.script.run.cmdSaveDraft({ProposalId:'<id>',Status:'TCC Finalizado'})`
    — a proposta tem de continuar em rascunho.
13. `google.script.run._signMinutes_('a','b','c')` e
    `google.script.run.getTeacherEmails_()` devem falhar com "function not
    found".
14. Título de proposta começando por `=` deve aparecer como texto, não como
    resultado de fórmula.
15. Digitar o e-mail do orientador **com maiúsculas** e conferir que a proposta
    aparece no painel dele mesmo assim.
16. Deixar uma aba parada por mais de 5 min e tentar uma ação: deve responder
    "sessão expirou", não executar.

## Como depurar na nuvem

Nada disto aparece localmente:

- `clasp logs` para o lado servidor (`console.error` de `renderView`, dos
  serviços e dos includes).
- No navegador, o código do usuário está no frame `userHtmlFrame`, **não** no
  `userCodeAppPanel`. É preciso trocar o contexto no console do DevTools. Ali,
  compilar cada `<script>` com `new Function` diz qual bloco quebrou, e comparar
  o texto servido com o arquivo em disco mostra o que foi comido no caminho
  ([rationale 7.10](rationale.md#710--dentro-de-string-só-entre-aspas-duplas) e
  [7.11](rationale.md#711-valor-do-servidor-viaja-em-atributo-não-dentro-de-string-js)).
- Os diagnósticos de `src/diagnostics.js` rodam pelo menu Executar do editor e
  escrevem só no log.

## Notas operacionais

**Planilhas criadas por versões anteriores** podem estar sem abas ou colunas que
o código espera. O sistema conserta sozinho apenas dois casos, e por motivos
opostos (ver [rationale 5.3](rationale.md#53-só-a-aba-de-sessões-se-auto-recria)):

- `Active_Sessions`: a aba é recriada, porque sessão é estado descartável.
- Colunas novas (`Teachers`, `Semesters`, `Defenses`): são acrescentadas ao
  cabeçalho (`ensureColumns_`; em `Teachers`, `_ensureTeacherColumns_`), porque
  acrescentar cabeçalho não destrói nada.

Fora disso não há auto-reparo: recriar uma tabela de dados vazia esconderia
perda.

**Script Properties** usadas:

| Propriedade | Quem define | Para quê |
| --- | --- | --- |
| `REGISTRY_SHEET_ID` | Setup inicial | Planilha de registro |
| `DATA_DIR_ID` | Setup inicial | Pasta raiz no Drive |
| `PROPOSAL_TEMPLATE_DOC_ID` | Setup | Modelo da proposta |
| `ATA_TEMPLATE_DOC_ID` | Setup | Modelo da Ata |
| `APPROVAL_SHEET_TEMPLATE_DOC_ID` | Setup | Modelo da Folha de Aprovação |
| `SIGNATURE_SECRET_KEY` | O código, na primeira assinatura | Chave das assinaturas. **Não trocar**: invalida todas as assinaturas já emitidas |
| `AUTH_CACHE_REVISION` | O código | Invalidação global do cache de autorização |
| `PUBLIC_URL` | À mão | URL de divulgação nos e-mails (`feec.ufam.edu.br/tccweb`) |
| `NOTIFICATIONS_ENABLED` | À mão | `false` desliga os e-mails |
| `TEST_LOGIN_ENABLED` | À mão | **Deixar desligada.** Vale também para a produção |

As duas implantações compartilham todas elas. Detalhe de uso em
[setup-dev.md](setup-dev.md).
