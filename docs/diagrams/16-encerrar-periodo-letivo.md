# Encerrar Período Letivo — Cadeia de Chamadas

Marca o período `Inativo` e grava `EndDate`. O período some do seletor e
ninguém mais entra nele; os dados ficam onde estão — nada é apagado nem movido.

Fontes: `src/ui_app_dashboard_incharge.html` (`endSemester`),
`src/ServiceSetup.js` (`cmdEndSemester`, `_assertCanManageSemesters_`,
`_assertFreshSession_`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Setup as cmdEndSemester
    participant Auth as AuthService
    participant Sheet as Planilha (Semesters)

    Responsável->>Nav: "Encerrar Período" → confirma no modal
    Nav->>Setup: google.script.run.cmdEndSemester(semesterName)
    Setup->>Setup: _assertFreshSession_() (timeout)
    Setup->>Setup: _assertCanManageSemesters_() — dono OU Responsável deste período
    Setup->>Auth: getSemesterByName(semesterName)
    alt período não encontrado entre os ativos
        Setup-->>Nav: {success:false, msg}
    else encontrado
        Setup->>Setup: confere: dono pode encerrar qualquer um; Responsável só o seu
        alt não é o Responsável deste período (e não é o dono)
            Setup-->>Nav: {success:false, msg:"Você não é o Responsável..."}
        else autorizado
            Setup->>Sheet: regDao.update(semesterName, {Status:Inativo, EndDate:agora})
            Sheet-->>Setup: gravado
            Setup-->>Nav: {success:true, msg:"Período letivo X encerrado."}
        end
    end
    Nav-->>Responsável: mensagem — "Recarregue a página para continuar."
```

## Notas

- Não devolve o `dashboard` recalculado como as ações de fluxo fazem: o
  próprio painel atual pode deixar de existir para quem encerrou (se ele não
  participar de mais nenhum período), então a tela pede reload em vez de
  tentar se redesenhar sozinha.
- Períodos coexistem por padrão — encerrar um não é pré-requisito para criar o
  seguinte (ver [15-criar-periodo-letivo.md](15-criar-periodo-letivo.md)).
