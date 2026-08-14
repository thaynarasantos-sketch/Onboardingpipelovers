[README.md](https://github.com/user-attachments/files/31061283/README.md)
# PipeLovers · Painel de Onboarding CS/CX

Painel estático (HTML/CSS/JS puro, sem servidor) para acompanhar a ativação
mensal das carteiras de **CS** (empresas) e **CX** (membros) durante o
onboarding, com base no consumo de aulas.

## Estrutura de arquivos

```
index.html            → o painel
assets/style.css       → estilo (dark/azul PipeLovers)
assets/data.js          → carrega os 4 CSVs e aplica as regras de negócio
assets/app.js             → filtros, KPIs, tabelas e drill-down
data/empresas.csv          → carteira de empresas por CS (cumulativo)
data/membros.csv            → membros cadastrados por CX (cumulativo) — base da meta de CX
data/usuarios.csv             → usuários das empresas do CS (cumulativo, com duplicados) — base da meta de CS
data/consumo.csv                → exportação de consumo de aulas (substituída a cada carga)
```

**O que mudou nesta versão:**
- **Correção crítica**: o cálculo de aulas concluídas dependia de uma coluna
  "Progresso" que não existe mais no `consumo.csv` atual (agora cada linha do
  CSV já representa uma aula concluída, identificada por "Nome da aula" +
  "Data de conclusão"). Isso fazia todo mundo aparecer com 0/3 aulas mesmo
  tendo consumo real. Corrigido: agora cada linha do consumo conta como uma
  aula concluída.
- **Usuários com "Proprietário do Onboarding" não identificado são
  descartados** da base de ativação de CS (não aparecem mais como "Sem
  responsável" — simplesmente não entram na conta da empresa). Só contam
  usuários cujo e-mail responsável está na lista confirmada: João Fabrício,
  Mariana Vieira, Anne Siqueira, Natalia Espindola ou Thaynara Santos (PF).
- Novo arquivo `usuarios.csv`: agora a ativação da **aba CS** é calculada a
  partir dele (não mais do `membros.csv`, que segue sendo a base exclusiva
  da aba CX).
- Novo filtro **CX / PF** na aba CS: mostra quem é responsável por cada
  usuário dentro da empresa. "PF" = usuários cujo "Proprietário do
  Onboarding" é `thaynara.santos@pipelovers.net` (gestora comercial de
  responsabilidade direta do CS, sem CX dedicado).
- Novo filtro **Status** na aba CS (Ativada / Aguardando handoff / Em
  andamento / Em risco / Churn).
- Novo status **Churn** na aba CX: membro cujo "Proprietário do Negócio" é
  Thaynara Santos (e que tem um CX válido em "Analista Onboarding") entra
  como Churn — contabilizado na carteira total, mas não é considerado
  ativável.
- "Em risco" (empresa) agora significa especificamente **zero usuários
  ativados**; empresas com ativação parcial (abaixo da meta, mas maior que
  zero) aparecem como **Em andamento**.
- E-mail/membro/usuário compartilham a mesma contagem de aulas entre as
  abas CS e CX: o consumo é agrupado por e-mail em uma única base
  (`consumo.csv`), então o mesmo e-mail tem exatamente a mesma quantidade de
  aulas concluídas nas duas visões.

> ⚠️ **Importante:** este pacote inclui `index.html`, `assets/style.css`,
> `assets/data.js`, `assets/app.js` **e** os 4 CSVs. Suba **todos juntos**.
> Enviar só os CSVs novos sem atualizar os arquivos `.js` (como aconteceu na
> rodada anterior) reproduz exatamente o bug de "0/3 aulas" descrito acima,
> porque o `data.js` antigo não sabe ler o formato novo do `consumo.csv`.

## Como publicar no GitHub Pages

1. Suba **todos** estes arquivos, mantendo a mesma estrutura de pastas, no
   repositório `thaynarasantos-sketch/Onboardingpipelovers` (branch `main`).
2. No repositório, vá em **Settings → Pages** → em "Source" selecione a
   branch `main` e a pasta `/ (root)` → **Save**.
3. Em alguns minutos o GitHub mostra o link público, algo como:
   `https://thaynarasantos-sketch.github.io/Onboardingpipelovers/`
4. Abra o link — os dados são lidos automaticamente a partir dos CSVs na
   pasta `data/`. Não abra o `index.html` direto no computador (arquivo
   local): o carregamento de CSV só funciona servido via http(s), como o
   GitHub Pages faz.

## Como atualizar os dados

O painel **lê os CSVs a cada carregamento da página** — não é preciso gerar
nada novo, só substituir os arquivos no repositório (upload direto pela
interface do GitHub ou `git push`) e recarregar a página (ou clicar em
"Atualizar" no topo do painel). Um "cache-busting" automático garante que o
navegador sempre busque a versão mais recente do arquivo.

**Passo a passo para subir uma atualização diária (interface do GitHub):**
1. Abra a pasta `data/` no repositório.
2. Clique no arquivo que quer atualizar (ex. `consumo.csv`) → ícone de lápis
   (Edit) para editar direto, ou use **Add file → Upload files** na pasta
   `data/` para substituir pelo novo (arraste o CSV com o mesmo nome).
3. **Commit changes** direto na branch `main`.
4. Espere ~30 segundos e recarregue
   `https://thaynarasantos-sketch.github.io/Onboardingpipelovers/` com
   Ctrl+Shift+R (hard refresh) para garantir que não pegue uma versão em
   cache.

**Regras por arquivo:**
- **`data/consumo.csv`** — substitua pelo arquivo mais recente a cada nova
  exportação (diária). O arquivo inteiro é sobrescrito.
- **`data/empresas.csv`** — **cumulativo**: a cada novo mês, acrescente as
  novas empresas ao final do mesmo arquivo (não crie um arquivo novo por
  mês).
- **`data/membros.csv`** — **cumulativo**: a cada novo mês, acrescente os
  novos membros cadastrados (base da meta de CX).
- **`data/usuarios.csv`** — **cumulativo**, mas pode conter e-mails
  duplicados sem problema: o painel mantém apenas o primeiro registro de
  cada e-mail automaticamente. Atualize sempre que houver troca de usuários
  nas empresas do CS.
- O painel calcula automaticamente o "mês da meta" de cada empresa/membro a
  partir da data de fechamento/cadastro (mês + 2 — ex.: fechamento em junho
  → meta de agosto), então o filtro de mês se atualiza sozinho conforme os
  dados crescem.
- Linhas de `consumo.csv` cujo e-mail não corresponde a nenhum membro/usuário
  cadastrado são ignoradas automaticamente, como pedido.
- Se algum campo do CSV tiver vírgula no texto (ex. nome de empresa com
  vírgula), coloque o valor entre aspas duplas (`"Empresa, Filial"`) — é o
  padrão CSV e o painel já lê isso corretamente.

## Regras de negócio aplicadas

**Membro (CX) — base: `membros.csv`**
- *Ativado*: 3 aulas concluídas até o fim do mês da meta.
- *Alerta*: nenhum registro em `consumo.csv` para o e-mail do membro.
- *Desengajado*: tem consumo, mas a última aula foi há mais de 30 dias.
- *Em andamento*: tem consumo recente, mas ainda não completou 3 aulas.
- *Churn*: "Proprietário do Negócio" = Thaynara Santos **e** "Analista
  Onboarding" preenchido com um CX válido — entra na carteira total (para o
  cálculo do %), mas não é considerado ativável.
- Meta de CX: 80% dos membros cadastrados até 60 dias atrás ativados.

**Empresa (CS) — base: `empresas.csv` + `usuarios.csv`**
- Limite de ativação da empresa: 65% dos usuários ativados se a empresa tem
  mais de 20 usuários contratados, 60% se tiver 20 ou menos.
- *Ativada*: atingiu o limite acima **e** tem data de handoff preenchida até
  o fim do mês da meta.
- *Aguardando handoff*: atingiu o limite de ativação, mas falta a data de
  handoff.
- *Em andamento*: já tem algum usuário ativado, mas ainda abaixo do limite.
- *Em risco*: nenhum usuário da empresa foi ativado ainda.
- *Churn*: empresa com motivo de churn preenchido — entra no total da
  carteira (denominador da meta), mas não é considerada ativável.
- Meta macro do CS (indicador visto no topo da aba): 60% da carteira ativada
  para Gonzalo e Nicoly, 65% para Priscila e Maria.
- Membro/usuário sem empresa correspondente na base de CS = **Ongoing**
  (cliente já em fase de ongoing, fora da carteira de ativação do CS).
- Cada usuário tem um responsável: **CX** (resolvido a partir do e-mail em
  "Proprietário do Onboarding" de `usuarios.csv`) ou **PF** (quando o e-mail
  é `thaynara.santos@pipelovers.net` — gestora comercial de
  responsabilidade direta do CS, sem CX dedicado).

## Filtros disponíveis

- **Aba CS**: CS responsável, mês da meta, data de fechamento (intervalo),
  data de handoff (intervalo), CX/PF responsável pelos usuários, status da
  empresa, nome da empresa.
- **Aba CX**: CX responsável, mês da meta, status (ativado / em andamento /
  desengajado / alerta / churn), CS da empresa, nome da empresa, e-mail do
  membro.

Clique em qualquer empresa para ver os usuários/membros vinculados
(responsável, aulas concluídas, último acesso); clique em um usuário/membro
para ver a lista de aulas assistidas com as datas.

## Observação sobre nomes de CX/responsáveis

Confirmado: `anne.siqueira@pipelovers.net` = **Anne Siqueira**.

Usuários de `usuarios.csv` cujo "Proprietário do Onboarding" **não** está
nesta lista confirmada são descartados da base de ativação de CS (não
aparecem no painel, nem contam no total da empresa):
- `joao.fabricio@pipelovers.net` → João Fabrício
- `mariana.vieira@pipelovers.net` → Mariana Vieira
- `anne.siqueira@pipelovers.net` → Anne Siqueira
- `natalia.espindola@pipelovers.net` → Natalia Espindola
- `thaynara.santos@pipelovers.net` → PF

Se `thabata.harumi@`, `barbara.cabrini@`, `joao.gonzalo@` ou
`nicoly.lima@pipelovers.net` também devem contar (por exemplo, como CX ou
CS responsáveis diretos por alguns usuários), me avise com o nome exato de
cada um que eu adiciono na lista confirmada em `assets/data.js`
(constante `RESPONSAVEL_EMAIL_MAP`) — por ora eles ficam de fora do cálculo.
