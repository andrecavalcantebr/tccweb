# Documentos — modelos, marcadores e geração

Este guia explica como configurar os modelos Google Docs e gerar o projeto
(chamado **Proposta** no aplicativo), a ficha de apoio à defesa, a ata oficial
e a folha de aprovação. Descreve o comportamento implementado no código.

## Visão geral

| Documento | Modelo utilizado | Resultado | Quando gerar |
| --- | --- | --- | --- |
| Projeto / Proposta | Modelo da proposta | Google Doc editável | Primeiro salvamento do rascunho pelo aluno |
| Ficha de apoio à defesa | Modelo da ata | PDF para anotações em papel | Após gerar o registro da ata, antes da assinatura do orientador |
| Ata da Defesa | Modelo da ata | PDF com resultados e assinaturas | Depois das assinaturas da banca e do de acordo do aluno |
| Folha de Aprovação | Modelo da folha | PDF para inserir no TCC final | Depois das assinaturas da banca e do de acordo do aluno |

## Configurar os modelos

1. Crie três documentos no Google Docs: proposta, ata e folha de aprovação.
2. Defina o conteúdo fixo, os logos, as margens, as fontes e os espaços de cada
   modelo. O aplicativo usa a formatação do documento como base.
3. Insira os marcadores descritos neste guia, com duas chaves de cada lado,
   letras maiúsculas e sem espaços adicionais: por exemplo, `{{TITULO}}`.
4. Na conta que publicou o aplicativo, abra **Configuração do Sistema**
   (`?page=setup`) e informe o link ou ID de cada modelo.
5. Garanta que a conta que executa o aplicativo tenha acesso aos modelos e à
   pasta do período letivo.

| Campo de configuração | Propriedade interna |
| --- | --- |
| Modelo da proposta | `PROPOSAL_TEMPLATE_DOC_ID` |
| Modelo da ata | `ATA_TEMPLATE_DOC_ID` |
| Modelo da folha de aprovação | `APPROVAL_SHEET_TEMPLATE_DOC_ID` |

O modelo da proposta é exigido na configuração inicial. Os modelos da ata e
da folha podem ser informados depois, mas precisam estar configurados quando
seus documentos forem emitidos. A ficha de apoio reutiliza o modelo da ata;
não possui um modelo separado.

## Projeto / Proposta

### Preparar o modelo

| Marcador | Conteúdo |
| --- | --- |
| `{{NOME_ALUNO}}` | Nome do aluno obtido do cadastro do período |
| `{{MATRICULA}}` ou `{{MATRÍCULA}}` | Matrícula do aluno |
| `{{TITULO}}` ou `{{TÍTULO}}` | Título informado na criação da proposta |

Use títulos fixos para **Resumo**, **Objetivos**, **Metodologia** e
**Referências**. Essas seções são preenchidas pelo aluno no próprio Google
Docs; não são marcadores substituídos pelo aplicativo.

Exemplo de estrutura:

```plaintext
PROPOSTA DE TRABALHO DE CONCLUSÃO DE CURSO

Título: {{TITULO}}
Aluno: {{NOME_ALUNO}}
Matrícula: {{MATRICULA}}

Resumo

Objetivos

Metodologia

Referências
```

### Gerar e preencher

1. O aluno preenche os dados iniciais da proposta no aplicativo.
2. Ao salvar o primeiro rascunho, o sistema copia o modelo para a pasta do
   período, preenche os marcadores e guarda o ID do documento.
3. O aluno abre o documento pelo link do painel e escreve o projeto.
4. O sistema concede edição ao aluno e acesso de comentário ao orientador.
5. Ao submeter, o aluno passa a comentarista. Se houver devolução para ajustes,
   volta a ter acesso de edição.

A cópia permanece como documento de trabalho do aluno. Para obter PDF, use o
recurso de download do próprio Google Docs. Alterar o modelo não modifica as
cópias já criadas.

## Ata e folha de aprovação: marcadores gerais

Os dois modelos aceitam os marcadores abaixo no corpo, cabeçalho e rodapé.
Na proposta, o nome do aluno usa `{{NOME_ALUNO}}`; nestes modelos, usa
`{{ALUNO}}`.

| Marcador | Conteúdo |
| --- | --- |
| `{{ALUNO}}` | Nome do aluno |
| `{{MATRICULA}}` ou `{{MATRÍCULA}}` | Matrícula |
| `{{TITULO}}` ou `{{TÍTULO}}` | Título final salvo na composição da banca |
| `{{DATA_DEFESA}}` | Data da defesa, em `dd/MM/yyyy` |
| `{{HORA_DEFESA}}` | Horário da defesa, em `HH:mm` |
| `{{MODO}}` | Modalidade da defesa |
| `{{PARECER}}` | Resultado registrado para a defesa |
| `{{MEDIA}}` ou `{{MÉDIA}}` | Média final |
| `{{OBSERVACOES}}` ou `{{OBSERVAÇÕES}}` | Observações da banca |
| `{{DE_ACORDO_ALUNO}}` | Texto “de acordo em …”, com data e hora |
| `{{CHAVE_VALIDACAO}}` ou `{{CHAVE_VALIDAÇÃO}}` | Chave para conferir o documento |

Datas e horários são formatados no fuso configurado no script.

## Como montar a tabela da banca

Crie uma **tabela no corpo do Google Docs** com uma única linha-modelo que
contenha `{{MEMBRO_NOME}}`. Essa linha será copiada para cada um dos 3 a 5
membros. As demais marcas de membro devem estar nessa mesma linha.

| Marcador da linha | Conteúdo |
| --- | --- |
| `{{MEMBRO_NOME}}` | Nome salvo na composição da banca |
| `{{MEMBRO_TITULACAO}}` | Titulação |
| `{{MEMBRO_INSTITUICAO}}` | Instituição |
| `{{MEMBRO_NOTA}}` | Nota do membro na ata; vazio na folha de aprovação |
| `{{MEMBRO_ASSINATURA}}` | Texto “assinado digitalmente — ” seguido dos primeiros 16 caracteres da assinatura registrada |
| `{{MEMBRO_DATA}}` | Data e hora da assinatura, em `dd/MM/yyyy HH:mm` |

### Exemplo para a ata

Monte no Google Docs uma tabela como esta:

| Membro | Titulação | Instituição | Nota | Assinatura | Data |
| --- | --- | --- | --- | --- | --- |
| `{{MEMBRO_NOME}}` | `{{MEMBRO_TITULACAO}}` | `{{MEMBRO_INSTITUICAO}}` | `{{MEMBRO_NOTA}}` | `{{MEMBRO_ASSINATURA}}` | `{{MEMBRO_DATA}}` |

Coloque a média **fora da tabela, logo abaixo**:

```plaintext
Média: {{MEDIA}}
Parecer: {{PARECER}}
Observações: {{OBSERVACOES}}

{{DE_ACORDO_ALUNO}}
Chave de validação: {{CHAVE_VALIDACAO}}
```

### Exemplo para a folha de aprovação

A linha-modelo pode ter apenas uma célula com vários parágrafos. Dentro dela,
use esta estrutura para formar um bloco por membro:

```plaintext
{{MEMBRO_TITULACAO}} {{MEMBRO_NOME}}
{{MEMBRO_INSTITUICAO}}
{{MEMBRO_ASSINATURA}}
{{MEMBRO_DATA}}
```

A borda da tabela pode ser ajustada no Google Docs conforme o layout desejado.
O conteúdo precisa continuar dentro da linha-modelo para ser repetido.

### Limitações da repetição

- Não existem marcas `{{MEMBRO1}}`, `{{MEMBRO2}}` ou equivalentes.
- A repetição depende de `{{MEMBRO_NOME}}`. Uma linha com apenas
  `{{MEMBRO_NOTA}}` não é expandida.
- Marcadores de membro em parágrafos fora da tabela não são preenchidos.
- Apenas a primeira linha encontrada com `{{MEMBRO_NOME}}` é expandida.
- As cópias são acrescentadas ao final da tabela. Por isso, não coloque uma
  linha de média ou outro conteúdo fixo depois da linha-modelo na mesma tabela.
- Não há condicionais nem repetição automática de blocos livres.

### Qual nome aparece no documento

O nome vem do campo `nome` salvo na composição da banca, conforme preenchido
pelo orientador. O sistema exige texto não vazio, mas não verifica se o nome
está completo.

Na formação de uma nova banca, os dados do orientador vêm inicialmente de seu
cadastro e podem ser corrigidos no formulário. Para os outros membros, digitar
o e-mail de um professor cadastrado não busca automaticamente seu nome.
Alterar o cadastro depois não atualiza os dados já salvos na banca.

A titulação é separada do nome. Use `{{MEMBRO_TITULACAO}}` se quiser exibi-la;
`{{MEMBRO_NOME}}` não acrescenta “Prof.” ou “Dr.” automaticamente.

## Ficha de apoio à defesa

1. Após a homologação da banca, o orientador usa **Gerar Ata da Defesa** para
   criar o registro da ata. Isso pode ser feito antes da defesa.
2. Antes de assinar a ata, usa **Ficha de apoio à defesa (PDF)**.
3. Abre o PDF, imprime e anota os resultados durante a defesa.
4. Depois, transcreve notas, parecer e observações no formulário do aplicativo.

A ficha usa o modelo da ata, mas aplica estas diferenças:

| Conteúdo | Tratamento na ficha |
| --- | --- |
| Aluno, matrícula, título, data, horário e modalidade | Preenchidos |
| Nome, titulação e instituição dos membros | Preenchidos |
| Notas, média, parecer e observações | Substituídos por espaços sublinhados |
| Assinaturas e datas das assinaturas | Vazios |
| De acordo do aluno e chave de validação | Vazios |

O sistema insere no início o aviso **“FICHA DE APOIO À DEFESA — SEM
ASSINATURAS — NÃO SUBSTITUI A ATA OFICIAL”**. Mesmo que já existam notas salvas,
a ficha deixa os campos de resultado para preenchimento em papel.

Textos fixos do modelo são preservados. Reserve espaço suficiente para escrever
as observações e evite textos fixos que afirmem que o documento já está assinado.
Cada solicitação gera um novo PDF de apoio; ele não substitui o PDF oficial.

## Ata oficial: assinatura e emissão

1. O orientador registra as notas, o parecer e as observações.
2. Usa **Assinar e liberar assinaturas**. Os resultados ficam fechados para
   edição e os outros membros recebem a notificação para assinar.
3. Os membros assinam. No painel dos professores, a pendência aparece em
   **Atas aguardando a sua assinatura**, separada da lista de orientandos.
4. O aluno, por último, dá o de acordo.
5. A ata em PDF pode ser emitida pelos membros da banca e pelo Responsável.

O PDF contém os dados preenchidos no modelo, incluindo notas e os carimbos de
assinatura. A assinatura mostrada é textual, não uma imagem manuscrita.
A chave permite conferir o documento na página `?page=verify` do aplicativo.
O botão **Verificar documento** fica no cabeçalho dos painéis, e há um link
junto da chave de validação nos detalhes da ata. Não aparece na tela de login,
porque a consulta só funciona depois de entrar. A consulta exige uma conta
Google e uma sessão ativa no TCC-WebApp; usa o período selecionado na sessão.

A lista de assinaturas inclui o **de acordo do aluno**, com data quando confirmado.
Quando todos os professores já assinaram, os detalhes mostram **Aguardando de
acordo do aluno**. O status permanece **Ata Em Assinaturas** até essa confirmação.

O Responsável ainda precisa homologar a defesa para liberar a fase de
encerramento. A emissão do PDF exige o de acordo do aluno; o código não exige
que essa homologação posterior já tenha ocorrido.

## Folha de aprovação: preparar e emitir

1. Configure um modelo próprio com a identificação do aluno e do trabalho,
   os dados da defesa e a linha-modelo de membros com suas assinaturas.
2. Não inclua notas nem média nesse modelo.
3. Depois das assinaturas e do de acordo, o aluno pode baixar a **Folha de
   Aprovação (PDF)**. O Responsável também tem autorização para emiti-la.
4. O aluno insere o documento na versão final do TCC, após a folha de rosto.

`{{MEMBRO_NOTA}}` fica vazio na folha. Entretanto, **`{{MEDIA}}` e `{{MÉDIA}}`
ainda são preenchidos se estiverem no modelo**. Para a folha sair sem notas,
omita essas marcas e os respectivos rótulos.

A apresentação “Membro 1”, “Membro 2” etc. aplica-se à lista de notas no painel
do aluno. A folha de aprovação mantém os nomes reais e as assinaturas da banca,
sem associá-los a notas individuais.

## Arquivos gerados e alterações nos modelos

Na emissão dos PDFs, o sistema copia o Google Doc para a pasta do período,
substitui as marcas, exporta o PDF e descarta a cópia intermediária. O modelo
original permanece disponível para as próximas gerações.

A ata oficial e a folha de aprovação são geradas uma vez e seus IDs ficam
registrados. Solicitações seguintes reutilizam esses arquivos. Portanto,
alterar o modelo **não atualiza PDFs já emitidos**, e clicar novamente no botão
não força uma nova geração. A ficha de apoio não usa esse reaproveitamento.

## Conferir os modelos

Antes de usar os modelos em uma defesa real, confira uma geração de teste:

- Nome completo, matrícula e título estão corretos.
- As bancas de 3, 4 e 5 membros cabem no layout.
- A linha-modelo é repetida sem deixar marcas visíveis.
- A média fica abaixo da tabela, sem deslocamento para antes dos membros.
- A ficha de apoio tem espaço para anotações e o aviso de sua finalidade.
- A folha de aprovação não contém notas nem média.
- Assinaturas, datas e chave aparecem nos documentos oficiais conforme o modelo.

Um marcador desconhecido ou escrito incorretamente permanece no documento.
O aplicativo registra um aviso no log, mas não bloqueia a geração por isso.
Use apenas as grafias listadas neste guia.

## Referências

- [Configuração do sistema](setup.md)
- [Formação da banca](committee.md)
- [Defesa e assinaturas](defense.md)
- [Visão do orientador](dashboard-advisor.md)
- [Visão do aluno](dashboard-student.md)
- [Estrutura de dados e templates](../data-structure.md)
