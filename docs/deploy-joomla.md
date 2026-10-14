# Publicação na página da FEEC — passo a passo do Joomla

Objetivo: servir o app em **`https://feec.ufam.edu.br/tccweb`**, a URL de
divulgação, sem envolver o CTIC — nada de DNS, nada de Apache. O Joomla roteia
as próprias URLs, então o alias de um item de menu já é a URL.

A página **não hospeda** o app: ela é a porta de entrada que leva à implantação
de produção no `script.google.com`. O porquê de não embutir num iframe está em
`setup-dev.md`, seção "Publicação na página da FEEC".

Escrito para o Joomla 4/5. No Joomla 3 os nomes dos menus mudam um pouco
("Conteúdo → Gestor de Artigos", "Menus → Gerenciar").

---

## Passo 0 — Conferir se as URLs do site são limpas

Abra qualquer artigo já publicado no site e olhe o endereço:

| O que aparece | Situação |
| --- | --- |
| `feec.ufam.edu.br/algum-artigo` | SEF com reescrita ligada — siga o roteiro |
| `feec.ufam.edu.br/index.php/algum-artigo` | Reescrita desligada: a URL vai ser `/index.php/tccweb` |

No segundo caso, ligar a reescrita exige renomear `htaccess.txt` para `.htaccess`
na raiz do site — isso sim é pedido ao CTIC. Não é bloqueante: `/index.php/tccweb`
funciona, só é mais feia.

---

## Passo 1 — Criar o artigo de entrada

**Conteúdo → Artigos → Novo.**

- **Título**: `Sistema de TCC`
- No editor, abra o **código-fonte** (botão `<>` no TinyMCE) e cole:

```html
<div style="max-width:620px;margin:2rem auto;padding:2rem;border:1px solid #ddd;border-radius:8px">
  <h2>Sistema de TCC — FEEC/UFAM</h2>

  <p>Submissão de propostas, formação de banca, agendamento de defesa,
     assinatura de atas e emissão da Folha de Aprovação dos Trabalhos de
     Conclusão de Curso.</p>

  <p><strong>Entre com sua conta Google.</strong> Alunos e professores da UFAM
     usam a conta <code>@ufam.edu.br</code> — o sistema reconhece o seu papel
     automaticamente. Membros externos de banca entram com a conta Google que
     tiverem e informam, na tela seguinte, o e-mail e a senha recebidos por
     e-mail.</p>

  <p style="margin:1.5rem 0">
    <a href="https://script.google.com/macros/s/AKfycbw31M669fBv8AP_n-RXhBHT_JUidg_JCt-oMzY4wMZMqnypVHHmYRoD0R8OZA9ymgSFLw/exec"
       target="_blank" rel="noopener"
       style="display:inline-block;padding:.75rem 1.5rem;background:#0d6efd;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
      Acessar o sistema →
    </a>
  </p>

  <p style="font-size:.9em;color:#666">
    Problemas de acesso: procure a coordenação de TCC da FEEC.
  </p>
</div>
```

Três detalhes que não são estéticos:

- **A URL é a forma genérica `script.google.com/macros/s/<ID>/exec`**, não a
  `/a/macros/ufam.edu.br/...` que o editor do Apps Script exibe. A segunda
  escopa o login no domínio e atrapalha o membro externo de banca, que entra
  com conta não-UFAM (ver `NO_GOOGLE_IDENTITY_MSG` em `utils.js`).
- **`target="_blank"`** abre o app em aba própria e em nível superior. É isso
  que faz o OAuth funcionar: dentro de um iframe ele não funcionaria.
- **`rel="noopener"`** impede que a aba aberta manipule a página da FEEC.

Se as tags forem removidas ao salvar, o filtro de texto está apertado:
**Sistema → Configuração Global → Filtros de Texto**, e o grupo Super Users
deve estar em **Sem Filtro**.

Salve e feche.

---

## Passo 2 — Criar o item de menu (é ele que cria a URL)

**Menus → (o menu escolhido) → Adicionar Novo Item de Menu.**

- **Título**: `Sistema de TCC`
- **Alias**: `tccweb` ← **é daqui que sai `/tccweb`**, não do alias do artigo
- **Tipo de Item de Menu** → Selecionar → **Artigos → Artigo Único**
  (não "Artigos em Destaque")
- **Selecionar Artigo**: o artigo do Passo 1
- **Item Pai**: `Raiz do Menu` ← obrigatório. Aninhado, a URL viraria
  `/pai/tccweb`
- **Status**: Publicado

Salve.

> **Não quer o item aparecendo na navegação?** Crie um menu novo
> (**Menus → Gerenciar → Adicionar**), chame de `Sistemas`, ponha o item lá e
> simplesmente **não publique o módulo** desse menu. A rota `/tccweb` funciona
> do mesmo jeito — item de menu é rota, o módulo é só a exibição.

---

## Passo 3 — Conferir a URL

Abra `https://feec.ufam.edu.br/tccweb`.

| Sintoma | Causa provável |
| --- | --- |
| 404 | Alias errado, item despublicado, ou item aninhado em vez de raiz |
| Redireciona para `/index.php/tccweb` | Reescrita de URL desligada (Passo 0) |
| Abre a home do site | O item virou o *default* do menu — tire a estrela dele |

---

## Passo 4 — Testar o acesso de verdade

1. Clique no botão: deve abrir aba nova no `script.google.com` e cair na tela de
   login do sistema.
2. **Repita com uma conta Gmail que não seja `@ufam.edu.br`.** É o teste que
   valida a escolha da URL genérica: a conta externa tem que chegar à tela de
   login, não a um aviso de que precisa de conta do domínio.

---

## Passo 5 — Definir a Script Property `PUBLIC_URL`

No editor do Apps Script: **engrenagem (Configurações do projeto) → Propriedades
do script → Adicionar propriedade do script**.

| Propriedade | Valor |
| --- | --- |
| `PUBLIC_URL` | `https://feec.ufam.edu.br/tccweb` |

Sem barra no final (o código tolera, mas não custa). Salve.

Isto faz o rodapé de **toda notificação por e-mail** passar a dizer
`Abra o sistema: https://feec.ufam.edu.br/tccweb` em vez do endereço do
`script.google.com` — que é o ponto todo: um e-mail sobrevive ao redeploy que o
gerou, e a URL de implantação não.

---

## Passo 6 — Publicar o código que lê a propriedade

A propriedade é lida em tempo de execução, então ela vale para as duas
implantações no instante em que é salva. O que **precisa** de redeploy é o
código que a lê — `getPublicAppUrl()` em `utils.js`. Se a versão no ar for
anterior a ele, a propriedade fica sendo ignorada.

```bash
clasp push -f
clasp deploy -i AKfycbzDzqMgHMZoWn_1N0mbGeUP0PV8T2Nt1OlkuL6RHMa4v8ejK3kSdB1hK8V3JXAaTDfXGg -d "teste: PUBLIC_URL"
#   → testar na URL de TESTES; anote o número da versão N criada
clasp deploy -i AKfycbw31M669fBv8AP_n-RXhBHT_JUidg_JCt-oMzY4wMZMqnypVHHmYRoD0R8OZA9ymgSFLw -V N -d "produção: vN"
```

O `-V N` promove **a versão testada**, em vez de tirar um snapshot novo do HEAD.

---

## Passo 7 — Verificar o resultado nos e-mails

Dispare uma ação que notifique (uma homologação de proposta, por exemplo) e
confira a mensagem recebida:

- O rodapé **"Abra o sistema para agir:"** deve mostrar `feec.ufam.edu.br/tccweb`.
- Um link com token — convite de professor, ou pedido de assinatura de Ata —
  deve continuar mostrando `script.google.com/.../exec?page=...`. **Isso é
  correto, não é bug**: nem o alias de menu nem o `com_redirect` repassam query
  string, e um link de token que chegasse sem o token não abriria nada. São
  links de uso único, clicados na hora, que ninguém copia para divulgar.

---

## Como desfazer

Apague a Script Property `PUBLIC_URL`. Os e-mails voltam na hora a usar a URL da
implantação, sem redeploy — `getPublicAppUrl()` cai no
`ScriptApp.getService().getUrl()` quando a propriedade está vazia. Despublicar o
item de menu não quebra nada no app; só derruba a URL de divulgação.

---

## Apêndice — redirect automático em vez de página de entrada

Se você preferir que `/tccweb` pule direto para o app, sem a tela intermediária:
ative o plugin **Sistema - Redirecionamento**, e em **Componentes →
Redirecionamentos → Novo** crie `https://feec.ufam.edu.br/tccweb` →
`https://script.google.com/macros/s/<ID_PRODUCAO>/exec`, status **301**.
Funciona porque `/tccweb` gera um 404 que o plugin intercepta — então não crie
o item de menu do Passo 2, ou não haverá 404 para interceptar.

O que se perde: o lugar para avisar que o acesso é com conta Google e que membro
externo usa a senha recebida por e-mail. Esse aviso evita a confusão mais comum
do primeiro acesso, e por isso a página de entrada é a recomendação.
