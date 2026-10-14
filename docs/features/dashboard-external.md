# TCC Web App - Funcionalidades - Visão do Usuário Externo

Membro de banca convidado de outra instituição — e, no v3, o supervisor de
estágio na empresa. É a pessoa que o Google não identifica e que nenhum roster
jamais representou.

## Login: implementado

O externo é cadastrado pelo **Responsável**, na tela "Professores" do painel
dele, marcado como externo. Nesse momento o sistema gera uma senha aleatória,
mostra-a uma única vez ao Responsável e a envia por e-mail ao convidado. Perdeu?
"Nova senha" gera outra — o que fica guardado é o hash, então não há como
reexibir a antiga.

Ele entra pela tela de login normal, com e-mail e senha. **Não há mais uma
segunda tela de login**: o antigo desenho previa um link "Acesso Externo" para
uma rota que nunca existiu, e manter duas telas para a mesma pergunta ("quem é
você?") só duplicaria o trabalho. Quem o Google identifica não vê campo de
senha; quem não, vê. Ver `features/login.md`.

> **Interno** é ter conta institucional que o Google resolve; **externo** é quem
> precisa de credencial própria. Um professor da UFAM é sempre interno, esteja
> ou não em qualquer lista — ver
> [rationale 3.2](../rationale.md#32-isexternal-é-deduzido-do-domínio-não-perguntado).

## Visão: chega com a assinatura da Ata (fatia C)

A tela própria do externo — a Ata que ele deve assinar, com uma única ação
possível — depende do subsistema de assinatura, que é a fatia C do plano. O
desenho previsto:

- Ele recebe por e-mail o **link com token de uso único**
  (`Defenses.SignatureTokens`), que o leva direto à ata certa sem precisar
  procurar nada.
- O token identifica **qual** ata; a credencial identifica **quem** ele é. Essa
  separação é o que dispensou abrir o deployment para acesso anônimo — ver
  `roadmap.md`, "Opção 3".
- Depois de assinar, a visão dele fica somente leitura: ele pode entrar de novo
  e ver que já assinou.
