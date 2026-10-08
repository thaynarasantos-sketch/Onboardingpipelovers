[README.md](https://github.com/user-attachments/files/33182333/README.md)
# PipeLovers · Painel de Onboarding CS/CX

Painel estático (HTML/CSS/JS puro, sem servidor) para acompanhar a ativação
mensal das carteiras de **CS** (empresas), **CX** (membros), a **cobertura
de onboarding** e o **reengajamento em ongoing**, com base no consumo de
aulas.

## Estrutura de arquivos

```
index.html            → o painel (4 abas: CS, CX, Onboarding, CX Ongoing)
assets/style.css       → estilo (dark/azul PipeLovers)
assets/data.js          → carrega os CSVs e aplica as regras de negócio
assets/app.js             → filtros, KPIs, tabelas e drill-down
data/empresas.csv          → carteira de empresas por CS (cumulativo)
data/membros.csv            → membros cadastrados por CX (cumulativo) — base da meta de CX e de onboarding
data/usuarios.csv             → usuários das empresas do CS (cumulativo, com duplicados) — base da meta de CS
data/consumo.csv                → histórico manual de consumo de aulas — nunca é sobrescrito automaticamente
data/consumo_supabase.csv        → gerado 1x/dia pelo GitHub Actions (Supabase) — não editar manualmente
data/cxongoing.csv                → membros em fase ongoing (cumulativo) — base da aba CX Ongoing
data/empresasongoing.csv           → relação Empresa → CSM (cumulativo) — alimenta o filtro de CSM da aba CX Ongoing
.github/workflows/atualizar-consumo-onboarding.yml → workflow que gera data/consumo_supabase.csv todo dia
gerar_consumo_onboarding.py                          → script Python usado pelo workflow acima
```

**O que mudou nesta versão:**
- **Nova origem "Waid" na aba CX Ongoing**: a coluna "Funil CX" de
  `cxongoing.csv` agora também pode vir com o valor "Waid" (além de
  "Reengajamento" e vazio = "Novo membro"). Os cards "Cobertura de
  engajamento por origem" e "Ativados por origem" agora mostram as 3
  origens lado a lado. O filtro "Origem" também ganhou a opção "Waid".
- **"Mês da meta" da aba CX Ongoing agora é o mês do CONSUMO, não mais o
  mês da "Data cadastro Ongoing"**: o mês usado no filtro "Mês da meta" e
  no indicador "Atingimento da meta" passou a ser o mês da aula que ativou
  o membro (vinda de `consumo.csv` + `consumo_supabase.csv`, cruzada pelo
  e-mail), já que é isso que a meta mensal realmente mede. Membro ainda
  não ativado não tem mês da meta e só aparece na visão "Todos" do filtro.
  Junto com isso, a meta deixou de ser um número fixo (100) e agora varia
  por mês — hoje: **100 em setembro/2026** e **120 em outubro/2026**
  (configurável em `assets/data.js`, constante
  `CX_ONGOING_META_TARGET_POR_MES`; meses não listados usam 100 como
  padrão). Ao selecionar um mês específico no filtro, o card mostra a meta
  daquele mês; sem filtro, soma a meta de todos os meses com membros
  ativados na base.
- **Novo filtro "CSM" na aba CX Ongoing**: cada CSM agora pode filtrar a
  tabela para ver só as empresas sob sua responsabilidade. A relação
  Empresa → CSM vem do novo arquivo `data/empresasongoing.csv` (colunas
  "Empresaongoing" e "CSM"), cruzado pelo nome da empresa (coluna "Conta
  Nome" em `cxongoing.csv`). Grafias diferentes do mesmo nome de CSM (ex.
  "Patrícia Zancan" / "Patricia Zancan") são unificadas automaticamente,
  preferindo a forma acentuada. Empresa sem correspondência no CSV aparece
  agrupada em "Sem CSM" no filtro.
- **Consumo agora também é alimentado automaticamente todo dia via
  Supabase**: além do `data/consumo.csv` manual (histórico congelado, que
  ninguém mais precisa editar), o workflow do GitHub Actions
  `atualizar-consumo-onboarding.yml` roda 1x por dia (06:00 em Brasília) e
  também pode ser disparado manualmente em **Actions**, gerando/atualizando
  `data/consumo_supabase.csv` a partir do Supabase. O painel soma os dois
  arquivos automaticamente antes de calcular ativação/status — nenhuma ação
  manual é necessária para isso, e nada quebra se `consumo_supabase.csv`
  ainda não existir na primeira execução.
- **CX Ongoing agora distingue Reunião de PDI Assíncrono**: `cxongoing.csv`
  ganhou a coluna "Data PDI assíncrono". Cada membro mostra as duas datas em
  colunas separadas (Reunião / PDI assíncrono); qualquer uma preenchida já
  conta para a cobertura de engajamento. Novo analítico: quantidade total de
  reuniões realizadas vs. PDIs assíncronos realizados, e — entre os
  ativados — % e quantidade com reunião vs. com PDI assíncrono.
- Corrigido o desalinhamento visual do card "Cobertura de engajamento" (o
  texto corrido com números embutidos foi trocado por um layout em grade,
  igual ao usado nos outros cards do painel).
- **Nova aba "CX Ongoing"** (4ª aba, novo arquivo `data/cxongoing.csv`):
  mesmo layout da aba CX, mas para membros já em fase ongoing (não é
  cruzada com `empresas.csv` — o agrupamento por empresa é sempre o nome
  como está em `cxongoing.csv`). Detalhes na seção de regras abaixo.
- **Cobertura de onboarding na aba CS**: coluna "Cobertura onboarding" na
  tabela de empresas e data de onboarding visível na lista de usuários de
  cada empresa — cruzado com `membros.csv` pelo e-mail. Para usuários **PF**
  (sem CX), a data de onboarding é a da própria empresa (`empresas.csv`).
- **Aba Onboarding** com: comparação "Empresas em onboarding vs. Ongoing"
  (quantidade de onboardings realizados e % de cobertura em cada grupo),
  cobertura de onboarding por empresa (expansível), segmentação por mês de
  cadastro (com distribuição de em qual mês o onboarding aconteceu e split
  de ativados com/sem onboarding), e filtro por CS.
- Coluna "Onboarding" nas listas de membros da aba CX.
- Cruzamento de churn CS↔CX: usuário com mesmo e-mail de um membro em churn
  no CX também vira churn na aba CS, fora do cálculo de ativação da empresa.
- Suporte a coluna "Matrícula" em `consumo.csv` como identificador de aula
  mais estável (opcional — funciona igual sem ela).

## Como publicar no GitHub Pages

> ⚠️ **Importante:** este pacote inclui `index.html`, `assets/style.css`,
> `assets/data.js`, `assets/app.js` **e** o novo `data/empresasongoing.csv`.
> Suba **todos juntos** e dê um Ctrl+Shift+R depois — subir só os CSVs sem
> atualizar os `.js`/`index.html` (ou vice-versa) já causou bugs de dados
> incorretos em rodadas anteriores. **Não** é preciso mexer em
> `data/consumo_supabase.csv` nem no workflow do GitHub Actions — esses já
> estão publicados e continuam rodando sozinhos.

1. Suba **todos** estes arquivos, mantendo a mesma estrutura de pastas, no
   repositório `thaynarasantos-sketch/Onboardingpipelovers` (branch `main`).
   O arquivo `data/empresasongoing.csv` é novo — crie-o na pasta `data/` se
   ainda não existir lá.
2. No repositório, vá em **Settings → Pages** → em "Source" selecione a
   branch `main` e a pasta `/ (root)` → **Save** (pule este passo se o Pages
   já estiver configurado de uma rodada anterior).
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
  novos membros cadastrados (base da meta de CX e da cobertura de
  onboarding).
- **`data/usuarios.csv`** — **cumulativo**, mas pode conter e-mails
  duplicados sem problema: o painel mantém apenas um registro por e-mail
  automaticamente (priorizando a linha com "Proprietário do Onboarding"
  preenchido). Atualize sempre que houver troca de usuários nas empresas.
- **`data/cxongoing.csv`** — **cumulativo**: acrescente novos membros que
  entraram em fase ongoing ao final do mesmo arquivo.
- **`data/empresasongoing.csv`** — mantenha a relação Empresa → CSM
  atualizada (colunas "Empresaongoing" e "CSM"): adicione uma linha para
  cada nova empresa ongoing, ou edite a linha existente se o CSM
  responsável mudar. Empresa que aparece em `cxongoing.csv` mas não está
  aqui cai automaticamente em "Sem CSM" no filtro.
- **`data/consumo_supabase.csv`** — **não edite manualmente**: é
  sobrescrito automaticamente todo dia às 06:00 (horário de Brasília) pelo
  workflow do GitHub Actions (`atualizar-consumo-onboarding.yml`), que lê
  direto do Supabase. Se precisar forçar uma atualização fora do horário,
  vá em **Actions → Atualizar consumo via Supabase → Run workflow** no
  repositório.
- O painel calcula automaticamente o "mês da meta" de cada empresa/membro a
  partir da data de fechamento/cadastro (mês + 2 — ex.: fechamento em junho
  → meta de agosto), então o filtro de mês se atualiza sozinho conforme os
  dados crescem. **Exceção**: na aba CX Ongoing, o mês da meta é o mês do
  **consumo** (a aula que ativou o membro), não o mês de cadastro/fechamento
  — veja a seção de regras de negócio abaixo.
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
- *Cobertura de onboarding*: % de usuários da empresa (excluindo churn) que
  têm data de onboarding. Para usuários com CX, essa data vem de
  `membros.csv` (membro de mesmo e-mail), cruzada pelo e-mail. Para usuários
  **PF** (sem CX, gestão direta do CS), a data de onboarding é a da própria
  empresa (`empresas.csv`, coluna "Data de Onboarding"), já que o PF não
  tem uma reunião individual registrada em `membros.csv`.

**Cobertura de onboarding (aba Onboarding) — base: `membros.csv`**
- *Cobertura* = % dos membros filtrados que têm "Data de Onboarding"
  preenchida (a reunião de onboarding foi realizada pelo CX).
- *Conversão com/sem onboarding* = % de ativação (3 aulas) dentro de cada um
  dos dois grupos (com e sem onboarding realizado) — mede o impacto da
  reunião na ativação.
- *Empresas em onboarding vs. Ongoing*: compara a quantidade de onboardings
  realizados e a % de cobertura entre membros de empresas ainda na carteira
  ativa do CS e membros de empresas Ongoing.
- *Cobertura por empresa*: agrupa os membros pela empresa (mesma lógica de
  "Conta Nome" usada na aba CX) e mostra cobertura + ativação lado a lado,
  com o CS responsável.
- *Segmentação por mês de cadastro*: agrupa os membros pelo mês em que
  foram cadastrados; para cada leva, mostra % de cobertura, % de ativação,
  o split de ativados com/sem onboarding, e a distribuição de em qual mês o
  onboarding de fato aconteceu.
- Bloco "Entre os ativados": dos membros que já bateram a meta (3 aulas),
  quantos tiveram onboarding e quantos ativaram sem passar por ele.

**CX Ongoing (nova aba) — base: `cxongoing.csv` + `consumo.csv`**
- Aba independente das demais: o agrupamento por empresa usa sempre o nome
  exatamente como está em `cxongoing.csv` (**não** é cruzado com
  `empresas.csv`).
- *Ativado*: **1 aula concluída** (diferente das outras abas, que exigem
  3) — e só conta consumo ocorrido **a partir da "Data cadastro Ongoing"**
  do membro (aulas anteriores a essa data são ignoradas no cálculo).
- *Alerta / Desengajado / Em andamento*: mesmas regras das outras abas
  (sem registro = alerta; sem acesso há mais de 30 dias = desengajado).
- *Churn*: "Proprietário do Negócio" = Thaynara Santos **e** "Analista
  Ongoing" = Thabata Harumi.
- *Origem* (coluna "Funil CX"): **Reengajamento** quando o valor é
  exatamente "Reengajamento", **Waid** quando é exatamente "Waid", ou
  **Novo membro** para qualquer outro valor (inclusive vazio).
- Meta: **membros ativados em quantidade** (não em percentual como nas
  outras abas), com alvo que varia por mês — hoje 100 em setembro/2026 e
  120 em outubro/2026 (ajustável em `assets/data.js`,
  `CX_ONGOING_META_TARGET_POR_MES`). O **"mês da meta" é o mês do
  CONSUMO** — a data da aula que ativou o membro (1ª aula registrada em
  `consumo.csv`/`consumo_supabase.csv` a partir da "Data cadastro
  Ongoing", cruzada pelo e-mail) — e não mais o mês de "Data cadastro
  Ongoing". Membro que ainda não ativou não tem mês da meta. Ao escolher
  um mês no filtro, o indicador mostra a meta daquele mês; sem filtro,
  soma a meta de todos os meses com ativados presentes na base.
- *Cobertura de engajamento*: % de membros com **reunião de reengajamento**
  E/OU **PDI assíncrono** realizado (`cxongoing.csv`, colunas "Data da
  reunião de reengajamento Ongoing" e "Data PDI assíncrono" — qualquer uma
  das duas preenchida já conta como coberto). Cada membro mostra as duas
  datas em colunas separadas (Reunião / PDI assíncrono) na lista — as duas
  contam para a mesma cobertura, mas são ações distintas. O painel também
  mostra a quantidade total de reuniões realizadas e de PDIs assíncronos
  realizados separadamente, e — entre os membros ativados — quantos e qual
  % tiveram reunião vs. quantos e qual % tiveram PDI assíncrono. Cobertura
  por empresa também disponível (expansível).

## Filtros disponíveis

- **Aba CS**: CS responsável, mês da meta, data de fechamento (intervalo),
  data de handoff (intervalo), CX/PF responsável pelos usuários, status da
  empresa, nome da empresa.
- **Aba CX**: CX responsável, mês da meta, status (ativado / em andamento /
  desengajado / alerta / churn), CS da empresa, nome da empresa, e-mail do
  membro.
- **Aba Onboarding**: Analista de Onboarding (CX), CS, data de cadastro do
  membro (intervalo), com/sem onboarding realizado, nome da empresa.
- **Aba CX Ongoing**: CX (Analista Ongoing), **mês da meta** (mês do
  consumo — a aula que ativou o membro, não o cadastro ongoing), status,
  origem (novo membro / reengajamento / waid), **CSM** (via
  `data/empresasongoing.csv` — cada CSM filtra só suas próprias empresas),
  data de cadastro ongoing (intervalo), nome da empresa, e-mail do membro.

Clique em qualquer empresa/mês para ver os usuários/membros vinculados
(responsável, aulas concluídas, data de onboarding/reengajamento, último
acesso); clique em um usuário/membro para ver a lista de aulas assistidas
com as datas.

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
Note que "Thabata Harumi" já aparece corretamente como analista na nova aba
CX Ongoing (vinda diretamente do nome em `cxongoing.csv`, não do e-mail).

## Ponto em aberto: formato de "Matrícula"

Você mencionou em rodadas anteriores um ajuste no "formato de matrícula",
sem detalhar o novo formato. Por segurança, o painel já está pronto para
usar uma coluna **"Matrícula"** em `consumo.csv` (quando existir) como
identificador único de cada aula — mais confiável que o nome em texto para
evitar contar a mesma aula duas vezes se o nome mudar entre exportações.
Enquanto essa coluna não vier, tudo funciona exatamente como hoje (dedup
pelo nome da aula). Me manda um exemplo de linha do novo formato quando
tiver, para eu confirmar se a lógica já implementada atende.
