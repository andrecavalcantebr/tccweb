# Criar Novo Período Letivo (de dentro do app) — Cadeia de Chamadas

O mesmo ato de [14-configuracao-periodo-letivo-bootstrap.md](14-configuracao-periodo-letivo-bootstrap.md),
agora disparado do painel do Responsável, com um período já em andamento.
Períodos **coexistem** — criar um não encerra os outros; o seguinte é
preparado antes de o atual acabar. Ver
[rationale 2.7](../rationale.md#27-setup-do-sistema-e-setup-do-período-são-separados).

Fontes: `src/ui_app_dashboard_incharge.html` (`createSemester`,
`openSemesterPanel`), `src/ServiceSetup.js` (`cmdCreateSemester`,
`SetupService.startSemester`, `_assertCanManageSemesters_`, `_validateClassDates_`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdCreateSemester
    participant People as PeopleService
    participant Drive as DriveApp / SpreadsheetApp
    participant Sheet as Planilha (Semesters)

    Responsável->>Nav: "Período Letivo" → seção "Novo Período Letivo" → preenche nome, e-mail e nome do Responsável e, se já souber, as datas de aula
    note right of Nav: E-mail em branco = o próprio Responsável continua;<br/>outro e-mail = passa a bola
    Nav->>Setup: google.script.run.cmdCreateSemester(data)
    Setup->>Setup: _assertFreshSession_() (timeout)
    Setup->>Setup: startSemester(data)
    Setup->>Setup: _assertCanManageSemesters_() — dono OU Responsável de período em andamento
    Setup->>Setup: _validateClassDates_ — datas opcionais, completáveis depois (39)
    Setup->>Drive: cria pasta + planilha do novo período (mesmos passos de 14)
    Setup->>Sheet: regDao.insert(novo período, Status:Ativo, ClassesStart/ClassesEnd)
    Setup->>People: ensureTeacher(inchargeEmail, inchargeName)
    Setup-->>Nav: {success:true, msg}
    Nav->>Nav: offerSemesterJump(semesterName) — botão "Ir para o período X"

    opt Responsável clica em "Ir para o período X"
        Nav->>Nav: goToSemester(semesterName)
        Nav->>Setup: window.top.location.href = appUrl() + '?page=switch_semester&semester=X'
        note right of Nav: Ver 04-troca-de-periodo.md — é uma NAVEGAÇÃO,<br/>não uma continuação deste google.script.run
    end
```

## Notas

- Quem pode chamar: a conta que publicou o app, **ou** o Responsável de um
  período em andamento — é essa segunda porta que faz a passagem de bola
  funcionar sem depender do dono.
- Diferente do bootstrap: aqui já existe pelo menos um período ativo, então
  `_assertCanManageSemesters_` normalmente aprova pelo caminho do Responsável,
  não do dono.
