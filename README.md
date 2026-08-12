# PipeLovers · Painel de Onboarding CS/CX

Painel estático (HTML/CSS/JS puro, sem servidor) para acompanhar a ativação
mensal das carteiras de **CS** (empresas) e **CX** (membros) durante o
onboarding, com base no consumo de aulas.

## Estrutura de arquivos

```
index.html            → o painel
assets/style.css       → estilo (dark/azul PipeLovers)
assets/data.js          → carrega os CSVs e aplica as regras de negócio
assets/app.js            → filtros, KPIs, tabelas e drill-down
data/empresas.csv         → carteira de empresas por CS (cumulativo)
data/membros.csv           → membros cadastrados por CX (cumulativo)
data/consumo.csv             → exportação de consumo de aulas (substituída a cada carga)
```

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
"Atualizar" no topo do painel).

- **`data/consumo.csv`** — substitua pelo arquivo mais recente a cada nova
  exportação (diária). O arquivo inteiro é sobrescrito.
- **`data/empresas.csv`** e **`data/membros.csv`** — são **cumulativos**:
  a cada novo mês, acrescente as novas linhas ao final do mesmo arquivo (não
  crie um arquivo novo por mês). O painel calcula automaticamente o "mês da
  meta" de cada empresa/membro a partir da data de fechamento/cadastro
  (mês + 2 — ex.: fechamento em junho → meta de agosto), então o filtro de
  mês se atualiza sozinho conforme os dados crescem.
- Linhas de `consumo.csv` cujo e-mail não corresponde a nenhum membro
  cadastrado são ignoradas automaticamente, como pedido.

## Regras de negócio aplicadas

**Membro (CX)**
- *Ativado*: 3 aulas com progresso 100% até o fim do mês da meta.
- *Alerta*: nenhum registro em `consumo.csv` para o e-mail do membro.
- *Desengajado*: tem consumo, mas a última aula foi há mais de 30 dias.
- *Em andamento*: tem consumo recente, mas ainda não completou 3 aulas.
- Meta de CX: 80% dos membros cadastrados até 60 dias atrás ativados.

**Empresa (CS)**
- Limite de ativação da empresa: 65% dos membros ativados se a empresa tem
  mais de 20 usuários contratados, 60% se tiver 20 ou menos.
- *Ativada*: atingiu o limite acima **e** tem data de handoff preenchida até
  o fim do mês da meta.
- *Aguardando handoff*: atingiu o limite de ativação, mas falta a data de
  handoff.
- *Em risco*: ainda não atingiu o limite de ativação.
- *Churn*: empresa com motivo de churn preenchido — entra no total da
  carteira (denominador da meta), mas não é considerada ativável.
- Meta macro do CS (indicador visto no topo da aba): 60% da carteira ativada
  para Gonzalo e Nicoly, 65% para Priscila e Maria.
- Membro sem empresa correspondente na base de CS = **Ongoing** (cliente já
  em fase de ongoing, fora da carteira de ativação do CS).

## Filtros disponíveis

- **Aba CS**: CS responsável, mês da meta, data de fechamento (intervalo),
  data de handoff (intervalo), nome da empresa.
- **Aba CX**: CX responsável, mês da meta, status (ativado / em andamento /
  desengajado / alerta), CS da empresa, nome da empresa, e-mail do membro.

Clique em qualquer empresa para ver os membros vinculados (CX responsável,
aulas concluídas, último acesso); clique em um membro para ver a lista de
aulas assistidas com as datas.
