# Configuração do Sistema Revisitável — Cadeia de Chamadas

A mesma tela do bootstrap ([12](12-configuracao-inicial-sistema.md)), alcançada
de propósito depois de o sistema já estar rodando — `?page=setup`. Sem esta
rota, configurar os templates da Ata e da Folha de Aprovação (que chegam
**depois** do template da proposta) significaria editar Script Properties à
mão no editor do Apps Script.

Fontes: `src/main.js` (`_route_`, trecho `page === 'setup'`,
`_renderSetupView_`), `src/ui_app_dashboard_incharge.html`
(`openSystemSetup`), `src/ServiceSetup.js` (`processSystemSetup`,
`initializeSystem`).

```mermaid
sequenceDiagram
    actor Dono as Conta que publicou o app
    participant Nav as Navegador (ui_app_dashboard_incharge)
    participant Main as main.js (_route_)
    participant Setup as SetupService
    participant Drive as DriveApp
    participant Props as Script Properties

    Dono->>Nav: Painel do Responsável → "⚙ Configuração do Sistema"
    note right of Nav: Botão só é renderizado quando isAppOwner<br/>veio true no payload da página (main.js:_renderDashboard_)
    Nav->>Main: window.top.location.href = appUrl() + '?page=setup'
    Main->>Main: isSystemSetup()? já é true — não é bootstrap
    Main->>Main: page === 'setup' → _isAppOwner_()?
    alt não é o dono
        Main-->>Nav: renderSetupPending()
    else é o dono
        Main->>Main: _renderSetupView_(userEmail, isBootstrap=false)
        Main-->>Nav: ui_app_initial_setup.html — mostra o que já está configurado
    end

    Dono->>Nav: Troca só o template da Ata (deixa os outros campos em branco) → Salvar
    Nav->>Setup: google.script.run.processSystemSetup({ataTemplateDocId: novoId})
    Setup->>Setup: initializeSystem(data)
    Setup->>Setup: _assertIsAppOwner_()
    Setup->>Setup: hasRegistry? sim — não recria a planilha-mãe
    loop cada um dos três templates
        alt campo veio vazio
            Setup->>Setup: mantém o valor atual (não sobrescreve)
        else campo preenchido
            Setup->>Drive: DriveApp.getFileById(id) — confere acesso
            Setup->>Props: grava a Script Property correspondente
        end
    end
    Setup-->>Nav: {success:true, msg:"Configuração salva: modelo da Ata da Defesa."}
    Nav-->>Dono: confirmação
```

## Notas

- `isSystemSetup()` só olha `REGISTRY_SHEET_ID` e `PROPOSAL_TEMPLATE_DOC_ID` —
  os templates da Fase 4 (Ata, Folha de Aprovação) são cobrados só na hora de
  gerar o documento (`_requireTemplate_`, ver
  [30-emitir-pdf-ata-folha-aprovacao.md](30-emitir-pdf-ata-folha-aprovacao.md)),
  não travam o resto do sistema — ver
  [rationale 6.3](../rationale.md#63-os-modelos-da-fase-4-não-entram-em-issystemsetup).
