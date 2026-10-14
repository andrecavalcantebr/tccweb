# Diagramas de Cadeia de Chamadas

Um diagrama Mermaid por funcionalidade do sistema — a sequência real de
chamadas entre a View, o roteador (`main.js`), os serviços e a planilha, tal
como o código está hoje. Complementa [arch.md](../arch.md) (como as camadas se
organizam) e [specs.md](../specs.md) (o que cada fase do fluxo faz); aqui é
**por onde** uma ação passa, com nomes de arquivo e de função.

## Identidade e sessão

| Funcionalidade | Diagrama |
| --- | --- |
| Login (institucional e externo) | [01-login.md](01-login.md) |
| Timeout de sessão e reentrada | [02-timeout-sessao-reentrada.md](02-timeout-sessao-reentrada.md) |
| Troca de papel | [03-troca-de-papel.md](03-troca-de-papel.md) |
| Troca de período | [04-troca-de-periodo.md](04-troca-de-periodo.md) |
| Matrícula do aluno | [05-matricula-aluno.md](05-matricula-aluno.md) |

## Gestão de professores (painel do Responsável)

| Funcionalidade | Diagrama |
| --- | --- |
| Convite de professor por e-mail | [06-convite-professor-email.md](06-convite-professor-email.md) |
| Professor completa o próprio cadastro | [07-professor-completa-cadastro.md](07-professor-completa-cadastro.md) |
| Cadastro direto de professor | [08-cadastro-direto-professor.md](08-cadastro-direto-professor.md) |
| Reenvio de convite e nova senha | [09-reenvio-convite-nova-senha.md](09-reenvio-convite-nova-senha.md) |
| Ativar / desativar professor | [10-ativar-desativar-professor.md](10-ativar-desativar-professor.md) |

## Verificação e configuração

| Funcionalidade | Diagrama |
| --- | --- |
| Verificação de documento (`?page=verify`) | [11-verificacao-documento.md](11-verificacao-documento.md) |
| Configuração inicial do sistema (bootstrap) | [12-configuracao-inicial-sistema.md](12-configuracao-inicial-sistema.md) |
| Configuração do sistema revisitável (`?page=setup`) | [13-configuracao-sistema-revisitavel.md](13-configuracao-sistema-revisitavel.md) |
| Configuração do primeiro período letivo (bootstrap) | [14-configuracao-periodo-letivo-bootstrap.md](14-configuracao-periodo-letivo-bootstrap.md) |
| Criar novo período letivo (de dentro do app) | [15-criar-periodo-letivo.md](15-criar-periodo-letivo.md) |
| Encerrar período letivo | [16-encerrar-periodo-letivo.md](16-encerrar-periodo-letivo.md) |
| Regenerar código de matrícula | [17-regenerar-codigo-matricula.md](17-regenerar-codigo-matricula.md) |
| Datas de aula do período | [39-datas-de-aula.md](39-datas-de-aula.md) |
| Consolidado do período (CSV) | [38-consolidado-periodo.md](38-consolidado-periodo.md) |

## Fluxo do PFC — Fases 1 e 2 (Proposta e Desenvolvimento)

| Funcionalidade | Diagrama |
| --- | --- |
| Elaborar e salvar rascunho da proposta | [18-elaborar-salvar-rascunho-proposta.md](18-elaborar-salvar-rascunho-proposta.md) |
| Submeter proposta | [19-submeter-proposta.md](19-submeter-proposta.md) |
| Orientador aprova ou devolve a proposta | [20-aprovar-devolver-proposta.md](20-aprovar-devolver-proposta.md) |
| Homologar proposta | [21-homologar-proposta.md](21-homologar-proposta.md) |
| Concluir desenvolvimento | [22-concluir-desenvolvimento.md](22-concluir-desenvolvimento.md) |

## Fase 3 — Formação da Banca

| Funcionalidade | Diagrama |
| --- | --- |
| Orientador submete a formação da banca | [23-submeter-formacao-banca.md](23-submeter-formacao-banca.md) |
| Homologar banca (convida quem falta) | [24-homologar-banca.md](24-homologar-banca.md) |

## Fase 4 — Defesa, Ata e Assinaturas

| Funcionalidade | Diagrama |
| --- | --- |
| Gerar a Ata | [25-gerar-ata.md](25-gerar-ata.md) |
| Orientador lança notas e assina | [26-lancar-notas-assinar-orientador.md](26-lancar-notas-assinar-orientador.md) |
| Assinar como membro da banca | [27-assinar-membro-banca.md](27-assinar-membro-banca.md) |
| De acordo do aluno | [28-de-acordo-aluno.md](28-de-acordo-aluno.md) |
| Homologar defesa | [29-homologar-defesa.md](29-homologar-defesa.md) |
| Emitir PDF (Ata / Folha de Aprovação) | [30-emitir-pdf-ata-folha-aprovacao.md](30-emitir-pdf-ata-folha-aprovacao.md) |

## Fase 5 — Encerramento

| Funcionalidade | Diagrama |
| --- | --- |
| Entrega final (RIU + PDF) | [31-entrega-final-riu-pdf.md](31-entrega-final-riu-pdf.md) |
| Finalizar TCC | [32-finalizar-tcc.md](32-finalizar-tcc.md) |
| Encerrar sem banca (aproveitamento / desistência) | [33-encerrar-sem-banca.md](33-encerrar-sem-banca.md) |

## Transversais

| Funcionalidade | Diagrama |
| --- | --- |
| Comentário / registro de atividades | [34-comentario-registro-atividades.md](34-comentario-registro-atividades.md) |
| Notificação por e-mail | [35-notificacao-email.md](35-notificacao-email.md) |
| Carregamento de painel (Aluno/Orientador/Responsável) | [36-carregamento-painel.md](36-carregamento-painel.md) |
| Professor edita os próprios dados ("Meus Dados") | [37-professor-edita-proprios-dados.md](37-professor-edita-proprios-dados.md) |

---

Cada diagrama cita os arquivos e funções-fonte no topo, então uma mudança no
código é uma pista direta de qual diagrama revisar. Verificados contra o
código em `src/` nesta rodada: `main.js`, `DaoSheets.js`, `ServiceAuth.js`,
`ServiceProposal.js`, `ServiceCommittee.js`, `ServiceDefense.js`,
`ServiceEventLog.js`, `ServiceNotification.js`, `ServicePeople.js`,
`ServiceSetup.js`, `ServiceTccState.js`, `ServiceDashboard.js`,
`ServiceReport.js` (revisão de out/2026, após a renomeação das funções
internas para terminarem em `_`).
