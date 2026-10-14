# Emitir PDF (Ata / Folha de Aprovação) — Cadeia de Chamadas

Dois documentos distintos, gerados a partir dos mesmos dados da Ata já
assinada: a **Ata** (comprovante de participação, dos membros da banca e do
Responsável) e a **Folha de Aprovação** (do aluno, para anexar após a folha de
rosto). Gerado uma vez e reusado — reemitir a cada clique encheria a pasta do
período de cópias idênticas.

Fontes: `src/ui_scripts.html` (`defenseDocButtonHtml`, `generateDefenseDoc`),
`src/ServiceDefense.js` (`cmdGenerateDefenseDocument`, `_buildDefensePdf_`,
`_renderTemplateToPdf_`, `_expandMemberRows_`), `src/ServiceSetup.js`
(`getAtaTemplateId_`, `getApprovalSheetTemplateId_`, `_requireTemplate_`).

```mermaid
sequenceDiagram
    actor Pessoa as Membro da banca, Aluno ou Responsável
    participant Nav as Navegador
    participant Cmd as cmdGenerateDefenseDocument
    participant Def as DefenseService
    participant Setup as ServiceSetup.js
    participant Sheet as Planilha (Defenses)
    participant Drive as DriveApp / DocumentApp

    Pessoa->>Nav: Clica "Ata da Defesa (PDF)" ou "Folha de Aprovação (PDF)"
    Nav->>Cmd: google.script.run.cmdGenerateDefenseDocument(proposalId, kind)
    Cmd->>Def: _context(proposalId)
    Cmd->>Cmd: Ata tem de estar com StudentAgreement preenchido
    Cmd->>Cmd: quem pode: Responsável (qualquer); Ata → membro da banca; Folha → o Aluno
    alt sem permissão para este documento
        Cmd-->>Nav: {success:false, msg:"A Folha de Aprovação é do aluno." / "A Ata é dos membros da banca."}
    else permitido
        Cmd->>Sheet: já existe o arquivo desta Ata? (MinutesPdfId / ApprovalSheetPdfId)
        alt já existe
            Cmd-->>Nav: {success:true, fileId} — reusa, não gera de novo
        else não existe ainda
            Cmd->>Setup: getAtaTemplateId_() / getApprovalSheetTemplateId_()
            Setup->>Setup: _requireTemplate_ — Script Property configurada?
            alt template não configurado
                Setup-->>Cmd: throw Error("modelo ... ainda não foi configurado")
                Cmd-->>Nav: {success:false, msg}
            else configurado
                Cmd->>Def: _buildDefensePdf_(service, ctx, wantsSheet, templateId)
                Def->>Def: monta marcadores {{ALUNO}}, {{TITULO}}, {{CHAVE_VALIDACAO}}... por membro
                Def->>Drive: DriveApp.getFileById(templateId).makeCopy(...)
                Def->>Drive: DocumentApp — _expandMemberRows_ (copia a linha-modelo por membro)
                Def->>Drive: replaceText de cada marcador (corpo, cabeçalho, rodapé)
                Def->>Drive: doc.saveAndClose() → getAs('application/pdf') → folder.createFile
                Drive-->>Def: fileId do PDF
                Def->>Drive: descarta a cópia intermediária do Doc
                Cmd->>Sheet: defenseDao.update(defenseId, {MinutesPdfId ou ApprovalSheetPdfId: fileId})
                Cmd-->>Nav: {success:true, fileId}
            end
        end
    end
    Nav-->>Pessoa: link "Abrir documento gerado" (Drive)
```

## Notas

- A Folha de Aprovação não leva nota — atesta aprovação, não desempenho
  (`{{MEMBRO_NOTA}}` sai vazio nesse documento).
- Cada assinatura vira um "carimbo de auditoria" no PDF: "assinado
  digitalmente — " + prefixo do HMAC, não uma linha em branco para assinatura
  manuscrita.
- Ver [11-verificacao-documento.md](11-verificacao-documento.md) para como a
  chave impressa é conferida depois.
