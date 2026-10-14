# Regenerar Código de Matrícula — Cadeia de Chamadas

Gerar outro código invalida o anterior na hora — o uso é justamente esse,
quando o código vaza para fora da turma.

Fontes: `src/ui_app_dashboard_incharge.html` (`regenerateCode`),
`src/ServiceSetup.js` (`cmdRegenerateEnrollmentCode`), `src/ServicePeople.js`
(`generateEnrollmentCode_`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdRegenerateEnrollmentCode
    participant Auth as AuthService
    participant Sheet as Planilha (Semesters)

    Responsável->>Nav: "Período Letivo" → "Gerar novo" (código de matrícula) → confirma
    Nav->>Setup: google.script.run.cmdRegenerateEnrollmentCode(currentSemesterName)
    Setup->>Setup: _assertFreshSession_() + _assertCanManagePeople_()
    Setup->>Auth: getSemesterByName(semesterName)
    alt período não encontrado
        Setup-->>Nav: {success:false, msg}
    else não é o dono do app nem o Responsável DESTE período
        Setup-->>Nav: {success:false, msg:"Você não é o Responsável por este período letivo."}
    else encontrado e autorizado
        Setup->>Setup: generateEnrollmentCode_() — _randomToken_ criptográfico
        Setup->>Sheet: regDao.update(semesterName, {EnrollmentCode: novoCódigo})
        Sheet-->>Setup: gravado
        Setup-->>Nav: {success:true, code, msg:"Novo código gerado: X"}
    end
    Nav->>Nav: atualiza enrollmentCode e o link de matrícula na tela
    Nav-->>Responsável: código e link novos, prontos para divulgar
```

## Notas

- O link de matrícula (`?page=enrollment&code=...`) muda junto, porque é
  montado a partir do mesmo `enrollmentCode` — não há dois lugares para
  atualizar.
- Não devolve `dashboard` recalculado porque a mudança não afeta a tabela
  mestra de alunos, só o código exibido no painel de Período Letivo.
- `cmdRegenerateEnrollmentCode` continua atrás de `_assertCanManagePeople_()`
  (Responsável, ou dono do app): o Orientador só **lê** o código, na guia
  "Convite aos Alunos" (`getAdvisorDashboardData`) — ver
  [features/dashboard-advisor.md](../features/dashboard-advisor.md#convite-aos-alunos).
  Deixar qualquer Orientador regenerar invalidaria o código para o período
  inteiro por uma decisão de uma só pessoa.
