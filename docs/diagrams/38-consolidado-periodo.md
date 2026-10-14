# Consolidado do Período (CSV) — Cadeia de Chamadas

O Responsável baixa uma planilha com a situação e a nota de **todos** os alunos
matriculados no período que está vendo. É o documento de fechamento do período
para a secretaria.

Fontes: `src/ui_app_dashboard_incharge.html` (`exportReport`),
`src/ServiceReport.js` (`getSemesterReport`, `buildReportRow_`,
`reportTotals_`, `buildReportCsv_`, `_csvText_`), `src/ServiceDashboard.js`
(`_defenseIndex_`), `src/ServiceEventLog.js` (`getAllGrouped`).

```mermaid
sequenceDiagram
    actor Responsável
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Report as getSemesterReport
    participant Auth as AuthService
    participant Sheet as Planilha do período

    Responsável->>Nav: menu de ações → "Exportar consolidado"
    Nav->>Report: google.script.run.getSemesterReport()
    Report->>Auth: getContext() + touchCurrentSession()
    alt papel não é Responsável
        Report-->>Nav: {success:false, msg:"Acesso restrito ao Responsável…"}
    else Responsável
        Report->>Sheet: Proposals, Committees + Defenses (_defenseIndex_), Defenses sem banca (aproveitamento), Events
        Report->>Sheet: Students (getSemesterStudents_) — uma linha por aluno, com ou sem proposta
        loop cada aluno
            Report->>Report: buildReportRow_ — situação, fase alcançada, banca, média, parecer
        end
        Report->>Report: reportTotals_ + buildReportCsv_ (cabeçalho com datas do período; _csvText_ neutraliza fórmulas)
        Report-->>Nav: {success:true, fileName:"consolidado-<período>-<data>.csv", csv}
    end
    Nav->>Nav: Blob com BOM UTF-8 → link de download, clicado automaticamente
    Nav-->>Responsável: download (e o link fica à vista, caso o iframe barre o clique)
```

## Notas

- As regras (`buildReportRow_`, `reportTotals_`, `buildReportCsv_`) são funções
  puras, cobertas por `tests/semester-report.test.cjs`.
- O arquivo é montado no navegador a partir do texto devolvido; nada é gravado
  no Drive.
- O BOM no início do arquivo é o que faz o Excel ler os acentos corretamente.
- Detalhe das colunas em [features/dashboard-incharge.md](../features/dashboard-incharge.md).
