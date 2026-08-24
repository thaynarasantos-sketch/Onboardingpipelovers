[README.md](https://github.com/user-attachments/files/31381173/README.md)
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
- **Nova aba "Onboarding"**: mostra a cobertura de onboarding (% de membros com
  a reunião de onboarding realizada), a conversão em ativação para quem teve
  onboarding vs quem não teve, a distribuição de onboardings realizados por
  mês, e um bloco "entre os ativados" separando quem ativou com e sem
  onboarding. Filtros: Analista de Onboarding (CX), data de cadastro do
  membro (intervalo), com/sem onboarding, nome da empresa.
- **Coluna "Onboarding" adicionada** nas listas de membros da aba CX (data da
  reunião de onboarding, ou "Não realizado").
- **Novo cruzamento de churn CS↔CX**: um usuário de `usuarios.csv` cujo
  e-mail é o mesmo de um membro marcado como churn em `membros.csv` (CX)
  também vira churn na aba CS — fica visível na lista da empresa, mas não
  conta no numerador nem no denominador do % de ativação da empresa.
- Consumo agora também aceita a coluna **"Matrícula"** (quando presente) como
  identificador de aula mais estável que o nome em texto, para deduplicar
  aulas concluídas com mais precisão. Continua funcionando normalmente sem
  essa coluna, usando o nome da aula como antes.
- Correção crítica anterior mantida: cálculo de aulas concluídas não depende
  mais de coluna "Progresso" (removida do `consumo.csv` atual).
- Usuários com "Proprietário do Onboarding" não identificado continuam
  descartados da base de ativação de CS, agora com deduplicação por e-mail
  mais robusta (prioriza a linha com responsável preenchido).

## Como publicar no GitHub Pages

> ⚠️ **Importante:** este pacote inclui `index.html`, `assets/style.css`,
> `assets/data.js`, `assets/app.js` **e** os 4 CSVs. Suba **todos juntos** e
> dê um Ctrl+Shift+R depois — subir só os CSVs sem atualizar os `.js` (ou
> vice-versa) já causou bugs de dados incorretos em rodadas anteriores.


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
- Usuário cujo e-mail é o mesmo de um membro em churn (CX) também vira
  **Churn** aqui — visível na lista da empresa, mas fora do numerador e do
  denominador do % de ativação.

**Cobertura de onboarding (aba Onboarding) — base: `membros.csv`**
- *Cobertura* = % dos membros filtrados que têm "Data de Onboarding"
  preenchida (a reunião de onboarding foi realizada pelo CX).
- *Conversão com/sem onboarding* = % de ativação (3 aulas) dentro de cada um
  dos dois grupos (com e sem onboarding realizado) — mede o impacto da
  reunião na ativação.
- Distribuição mensal: quantos onboardings foram realizados em cada mês
  (agrupado pela "Data de Onboarding"), e a ativação dentro de cada grupo.
- Bloco "Entre os ativados": dos membros que já bateram a meta (3 aulas),
  quantos tiveram onboarding e quantos ativaram sem passar por ele.

## Filtros disponíveis

- **Aba CS**: CS responsável, mês da meta, data de fechamento (intervalo),
  data de handoff (intervalo), CX/PF responsável pelos usuários, status da
  empresa, nome da empresa.
- **Aba CX**: CX responsável, mês da meta, status (ativado / em andamento /
  desengajado / alerta / churn), CS da empresa, nome da empresa, e-mail do
  membro.
- **Aba Onboarding**: Analista de Onboarding (CX), data de cadastro do
  membro (intervalo), com/sem onboarding realizado, nome da empresa.

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

## Ponto em aberto: formato de "Matrícula"

Na sua lista de próximas mudanças você mencionou "planilha pro formato de
matrícula para ser ajustado", mas sem detalhar o novo formato. Por
segurança, já deixei o painel pronto para usar uma coluna **"Matrícula"** em
`consumo.csv` (quando existir) como identificador único de cada aula — mais
confiável do que o nome em texto para evitar contar a mesma aula duas vezes
se o nome mudar entre exportações. Enquanto essa coluna não vier, tudo
continua funcionando exatamente como hoje (dedup pelo nome da aula). Me
manda um exemplo de linha do novo formato de matrícula quando tiver, para eu
confirmar se a lógica que já deixei pronta bate com o que você precisa.
