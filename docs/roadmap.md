# TCC Web App — Roadmap

O que ainda não existe, e como já está decidido que será. O que **já existe**
está em [checkpoint.md](checkpoint.md); **por que** as coisas são como são, em
[rationale.md](rationale.md).

## Versões

| Versão | Funcionalidades |
| --- | --- |
| **v1** | Fluxo completo do PFC — **em produção** (v1.0.0, out/2026), em validação com alunos |
| **v2** | Proposta com formatação rica via Google Docs — **feito** |
| **v3** | Estender ao Estágio Supervisionado |
| **v4+** | Integração ao site da FEEC — o acesso por `feec.ufam.edu.br/tccweb` já existe ([deploy-joomla.md](deploy-joomla.md)); falta o resto |

## Já saiu daqui para o código

A assinatura digital da Ata, os dois PDFs e o encerramento sem banca foram
implementados. O mecanismo está em [features/defense.md](features/defense.md);
as razões, em [rationale.md](rationale.md).

## Estágio Supervisionado (v3)

O supervisor na empresa é externo por definição, e a fundação de identidade
própria já o comporta: ele é uma linha em `Teachers` com `IsExternal`
verdadeiro, credencial própria e nenhum papel do fluxo de TCC. O que falta é o
fluxo em si — nada da estrutura de pessoas precisa mudar.

## Backlog

### Prometido pela especificação, ainda não implementado

- [ ] **Reprovação como estado terminal** e motivo do "Não Finalizado" — ver
      [checkpoint.md](checkpoint.md#próximo-reprovação-como-estado-terminal).
- [ ] **Reemissão depois do período encerrado.** O `specs.md` diz que, encerrado
      o período, só o Responsável reemite Ata e Folha de Aprovação. Hoje um
      período `Inativo` some de `getActiveSemesters`, e ninguém entra mais nele,
      nem o Responsável.
- [ ] **Verificar documento de outro período.** `verifyDefenseKey` procura a
      chave só na planilha do período da sessão. Uma Ata de período encerrado
      não é encontrada, e uma de outro período ativo exige trocar de período
      antes.

### Melhorias

- [ ] Caixa "Aprovar Proposta" do Orientador mostrando o Título do projeto em
      vez do código.
- [ ] Responsividade mobile: as tabelas dos painéis de Orientador e Responsável
      não adaptam bem a telas pequenas.
- [ ] Sincronizar o Título entre o painel e o Google Doc quando o aluno o edita
      direto no Doc (hoje só é gravado lá na criação).

### Robustez

- [ ] `LockService` nas escritas concorrentes.
- [ ] Instância única de DAO por serviço.
- [ ] Purga de `Active_Sessions`, que cresce sem limite.
- [ ] Escape no fallback do `renderError` (`main.js`), que monta HTML com o
      título e a mensagem crus.
- [ ] Rever `ALLOWALL` no X-Frame-Options: permite embutir o app em qualquer
      site. Hoje o Joomla abre o app por link, não por iframe
      ([setup-dev.md](setup-dev.md#por-que-não-embutir-o-app-num-iframe-do-joomla)),
      então talvez já dê para restringir.
