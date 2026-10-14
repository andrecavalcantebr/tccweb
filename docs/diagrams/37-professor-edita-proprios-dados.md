# Professor Edita os Próprios Dados ("Meus Dados") — Cadeia de Chamadas

Os mesmos campos de [07-professor-completa-cadastro.md](07-professor-completa-cadastro.md),
agora editáveis **depois** do convite e de dentro do painel. Antes disso eles
só podiam ser escritos uma vez, pelo link do convite — e quem entrou por outra
porta (`ensureTeacher`, ao ser indicado Responsável de um período) ficava com o
nome derivado do e-mail, sem lugar nenhum para corrigi-lo.

Fontes: `src/ui_app_dashboard_advisor.html` (`openProfilePanel`,
`saveProfile`), `src/ServiceSetup.js` (`cmdUpdateMyProfile`),
`src/ServicePeople.js` (`PeopleService.updateOwnProfile`),
`src/ServiceAuth.js` (`updateCurrentSessionName`),
`src/ServiceDashboard.js` (`_advisorProfile_`).

```mermaid
sequenceDiagram
    actor Professor
    participant Nav as Navegador (ui_app_dashboard_advisor)
    participant Setup as cmdUpdateMyProfile
    participant Auth as AuthService
    participant People as PeopleService
    participant Sheet as Planilha (Teachers / Active_Sessions)

    note over Nav: O painel já veio com advisor = _advisorProfile_(...)<br/>— nome, titulação, instituição, telefone e isRegistered
    Professor->>Nav: "Meus Dados" → corrige os campos → Salvar
    Nav->>Nav: valida nome não vazio (o servidor revalida)
    Nav->>Setup: google.script.run.cmdUpdateMyProfile({name, titulacao, instituicao, phone})

    Setup->>Setup: _assertFreshSession_() — timeout de ociosidade
    Setup->>Auth: getContext() — de onde sai o e-mail que será gravado
    note right of Setup: O e-mail vem da SESSÃO, nunca do payload:<br/>é o que impede editar o cadastro de outra pessoa

    Setup->>People: updateOwnProfile(ctx.email, data)
    People->>Sheet: getTeacher(email)
    alt sem linha em Teachers, ou linha inativa
        People-->>Setup: throw "Você não está cadastrado(a) como professor(a)"
        Setup-->>Nav: {success:false, msg}
        note right of People: Recusar aqui é o que impede o auto-cadastro<br/>de professor — rationale 2.3
    else professor ativo
        People->>People: exige nome não vazio
        People->>Sheet: dao.update(email, {Name, Titulacao, Instituicao, Phone})
        note right of People: Patch de 4 colunas. IsActive, IsExternal,<br/>PasswordHash e InviteToken ficam de fora
        Sheet-->>People: gravado
        People->>People: _clearPeopleCache_()
        People-->>Setup: record atualizado

        Setup->>Auth: updateCurrentSessionName(nome)
        Auth->>Sheet: sessionDao.update(identityKey, {Name})
        note right of Auth: O cabeçalho lê o nome da SESSÃO, não de Teachers:<br/>sem isto a correção só apareceria na entrada seguinte

        Setup-->>Nav: {success:true, profile, msg}
        Nav->>Nav: advisor = {...advisor, ...profile}; atualiza .user-name
    end
    Nav-->>Professor: "Dados atualizados." — painel fecha
```

## Notas

- Único comando de `Teachers` que **não** passa por `_assertCanManagePeople_`, e
  nem poderia: a autorização aqui não é o papel de Responsável, é ser o dono da
  linha. O par que substitui aquela checagem é (e-mail da sessão) + (a linha
  precisa existir e estar ativa).
- O **e-mail** não está no patch de propósito: é a chave da linha, a identidade
  conferida no login, o que `_validateMembers` compara para aceitar o
  presidente da banca e o que decide quem pode assinar a Ata. Trocá-lo aqui
  seria assumir outro cadastro — para isso existe um convite novo, do
  Responsável.
- `advisor` é a **fonte única**: o mesmo objeto preenche este formulário e a
  linha do presidente em "Formar Banca" (ver
  [23-submeter-formacao-banca.md](23-submeter-formacao-banca.md)). Atualizá-lo
  no retorno evita que a banca seguinte ainda nasça com o nome antigo.
- O botão só é renderizado quando `advisor.isRegistered` — quem é membro de
  banca sem cadastro em `Teachers` não teria o que editar, e o servidor
  recusaria o salvamento de qualquer forma.
