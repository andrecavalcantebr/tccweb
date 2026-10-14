# Datas de Aula do Período — Cadeia de Chamadas

Início e fim das aulas, do calendário acadêmico. Não confundir com
`StartDate`/`EndDate`, que registram quando o período foi criado e encerrado
**no sistema**. As datas de aula saem no cabeçalho do consolidado.

Fontes: `src/ui_app_dashboard_incharge.html` (`saveSemesterDates`,
`renderSemesterDates`), `src/ServiceSetup.js` (`cmdUpdateSemesterDates`,
`_validateClassDates_`, `_assertCanManageSemesters_`), `src/DaoSheets.js`
(`ensureColumns_`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdUpdateSemesterDates
    participant Auth as AuthService
    participant Sheet as Registro (Semesters)

    Responsável->>Nav: "Período Letivo" → datas de início/fim das aulas → "Salvar datas"
    Nav->>Setup: google.script.run.cmdUpdateSemesterDates(currentSemesterName, {classesStart, classesEnd})
    Setup->>Setup: _assertFreshSession_() + _assertCanManageSemesters_()
    Setup->>Auth: getSemesterByName(semesterName)
    alt período não encontrado, ou não é o dono nem o Responsável deste período
        Setup-->>Nav: {success:false, msg}
    else autorizado
        Setup->>Setup: _validateClassDates_ — "yyyy-MM-dd", fim ≥ início, vazio aceito
        Setup->>Sheet: ensureColumns_ (cria ClassesStart/ClassesEnd se faltarem)
        Setup->>Sheet: update(semesterName, {ClassesStart:"'yyyy-MM-dd", ClassesEnd:"'yyyy-MM-dd"})
        Setup-->>Nav: {success:true, msg:"Datas do período … salvas."}
    end
    Nav-->>Responsável: confirmação; as datas ficam no formulário
```

## Notas

- As datas são gravadas como **texto** (com o `'` à frente), não como data do
  Sheets: o contexto do período passa pelo `CacheService` em JSON, e uma data
  viraria um instante UTC que volta um dia antes em Manaus.
- As mesmas datas podem ser informadas já na criação do período
  ([15-criar-periodo-letivo.md](15-criar-periodo-letivo.md)); este fluxo
  completa ou corrige depois.
