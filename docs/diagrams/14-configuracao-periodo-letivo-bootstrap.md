# Configuração do Primeiro Período Letivo (Bootstrap) — Cadeia de Chamadas

Alcançada quando o sistema já está configurado (Camada 1 concluída) mas **não
existe nenhum período `Ativo`** ainda. Sem esta guarda, qualquer pessoa que
chegasse antes do Responsável criaria um período — e, como criar não desativa
os outros, isso por si só não derrubaria nada, mas criaria lixo sem
`InchargeEmail` correto.

Fontes: `src/main.js` (`_route_`, trecho `getActiveSemesters().length === 0`),
`src/ui_app_semester_setup.html`, `src/ServiceSetup.js`
(`processSemesterSetup`, `SetupService.startSemester`).

```mermaid
sequenceDiagram
    actor Dono as Conta que publicou o app
    participant Nav as Navegador (ui_app_semester_setup)
    participant Main as main.js (_route_)
    participant Setup as SetupService
    participant People as PeopleService
    participant Drive as DriveApp / SpreadsheetApp
    participant Sheet as Planilha (Semesters)

    Dono->>Nav: Abre a URL do app (sistema já configurado, 0 períodos ativos)
    Nav->>Main: GET
    Main->>Main: auth.getActiveSemesters().length === 0
    Main->>Main: _isAppOwner_()? sim
    Main-->>Nav: renderView('semester_setup', {userEmail})

    Dono->>Nav: Preenche período (ex. "2026.1"), e-mail e nome do Responsável → Criar
    Nav->>Setup: google.script.run.processSemesterSetup(data)
    Setup->>Setup: startSemester(data)
    Setup->>Setup: _assertCanManageSemesters_() — dono, pois ainda não há Incharge algum
    Setup->>Drive: rootFolder.createFolder(semesterName) (ou reusa se já existir)
    Setup->>Setup: regDao.getAll().find(mesmo nome) — recusa duplicata
    Setup->>Drive: SpreadsheetApp.create(semesterName) — planilha do período
    Setup->>Drive: cria abas Students, Proposals, Committees, Defenses, Events
    Drive-->>Setup: planilha movida para a pasta do período
    Setup->>Sheet: regDao.insert({Semester, FolderId, EnrollmentCode, SheetId, InchargeEmail, Status:Ativo, StartDate})
    Sheet-->>Setup: período registrado
    Setup->>People: ensureTeacher(inchargeEmail, inchargeName)
    People-->>Setup: professor garantido (ativo, sem token)
    Setup-->>Nav: {success:true, msg:"Semestre letivo ativado com sucesso."}
    Nav-->>Dono: painel do Responsável, já com o período recém-criado
```

## Notas

- `ensureTeacher` é o que faz "o Responsável é também Orientador" valer desde
  o primeiro período — sem ele, o bootstrap ficaria travado (ninguém pode
  cadastrar professor antes de existir período). Ver
  [rationale 2.5](../rationale.md#25-o-responsável-do-período-é-cadastrado-como-professor-ao-criar-o-período).
- O mesmo `startSemester` é reaproveitado de dentro do app — ver
  [15-criar-periodo-letivo.md](15-criar-periodo-letivo.md), que muda só a
  guarda de quem pode chamar.
