# Configuração Inicial do Sistema (Bootstrap) — Cadeia de Chamadas

O primeiro app dos "três apps em um" (ver [arch.md](../arch.md), "Três apps em
um"). Só a conta que publicou o Web App (`_isAppOwner_`) chega até aqui —
qualquer outra pessoa vê "Sistema em configuração" e nada mais, nem o que
falta. Cria o registro (planilha-mãe) e grava o template da proposta.

Fontes: `src/main.js` (`_route_`, trecho `!isSystemSetup()`, `_renderSetupView_`,
`renderSetupPending`), `src/ServiceSetup.js` (`_isAppOwner_`,
`processSystemSetup`, `SetupService.initializeSystem`).

```mermaid
sequenceDiagram
    actor Dono as Conta que publicou o app
    actor Outro as Qualquer outra pessoa
    participant Nav as Navegador
    participant Main as main.js (_route_)
    participant Setup as SetupService
    participant Drive as DriveApp / SpreadsheetApp
    participant Props as Script Properties

    Outro->>Nav: Abre a URL do app
    Nav->>Main: GET (qualquer página)
    Main->>Main: isSystemSetup()? (REGISTRY_SHEET_ID e PROPOSAL_TEMPLATE_DOC_ID)
    Main->>Main: _isAppOwner_()? não
    Main-->>Nav: renderSetupPending() — "em configuração", sem detalhes
    Nav-->>Outro: tela genérica, nada a fazer

    Dono->>Nav: Abre a mesma URL
    Nav->>Main: GET
    Main->>Main: isSystemSetup() → false
    Main->>Main: _isAppOwner_()? sim
    Main->>Main: _renderSetupView_(userEmail, isBootstrap=true)
    Main-->>Nav: ui_app_initial_setup.html (pasta do Drive + template da proposta)

    Dono->>Nav: Cola o ID/URL da pasta do Drive e do Doc modelo → Salvar
    Nav->>Setup: google.script.run.processSystemSetup({folderId, templateDocId, ...})
    Setup->>Setup: initializeSystem(data)
    Setup->>Setup: _assertIsAppOwner_() — confere de novo, no servidor
    Setup->>Setup: _normalizeDocId_(folderId) — aceita URL colada inteira
    Setup->>Drive: DriveApp.getFolderById(folderId)
    Drive-->>Setup: pasta confirmada
    Setup->>Drive: SpreadsheetApp.create('TCC_WebApp_Registry')
    Setup->>Drive: cria abas Semesters, Active_Sessions, Teachers (cabeçalhos)
    Drive-->>Setup: planilha de registro criada e movida para a pasta
    Setup->>Props: REGISTRY_SHEET_ID, DATA_DIR_ID
    Setup->>Drive: DriveApp.getFileById(templateDocId) — confere acesso
    Setup->>Props: PROPOSAL_TEMPLATE_DOC_ID (e ATA/APPROVAL, se enviados)
    Setup-->>Nav: {success:true, msg:"Configuração salva: ..."}
    Nav-->>Dono: confirmação — sistema pronto para o primeiro período
```

## Notas

- `initializeSystem` é idempotente na parte da planilha: se o registro já
  existe, não recria — só grava os templates que vieram preenchidos. Campo em
  branco mantém o valor atual (relevante em
  [13-configuracao-sistema-revisitavel.md](13-configuracao-sistema-revisitavel.md)).
- Depois de `isSystemSetup()` virar verdadeiro, falta ainda um período letivo
  — ver [14-configuracao-periodo-letivo-bootstrap.md](14-configuracao-periodo-letivo-bootstrap.md).
