"""
PipeLovers / Onboardingpipelovers — gera data/consumo_supabase.csv a partir da
view "vw_consumo_completo" do Supabase.

Diferente dos painéis do redarbor/Grupo Sem Parar (que são de UM cliente só,
filtrados por id_conta), este painel cobre a carteira INTEIRA de clientes da
PipeLovers (cada empresa em data/empresas.csv tem seu próprio id_conta lá no
Supabase). Por isso este script NÃO filtra por id_conta — busca TODO o
consumo, e o próprio painel (assets/data.js) já ignora sozinho qualquer
e-mail que não bate com membros.csv/usuarios.csv, exatamente como descrito no
README ("Linhas de consumo.csv cujo e-mail não corresponde a nenhum
membro/usuário cadastrado são ignoradas automaticamente").

DEDUPLICAÇÃO: para não contar a mesma aula duas vezes (uma vez no
consumo.csv manual antigo, outra vez no consumo_supabase.csv novo), este
script lê o data/consumo.csv já existente e monta um conjunto de chaves
(email + nome da aula, normalizados — mesma lógica de dedup usada pelo
próprio data.js: "Nome da aula" tem prioridade, cai para "Conteúdo" se
vazio). Qualquer linha do Supabase cuja chave já exista nesse conjunto é
IGNORADA — só entra no consumo_supabase.csv o que é novidade:
  - aulas que o Supabase tem registradas mas que nunca foram
    subidas manualmente (preenche buracos do histórico antigo);
  - qualquer aula assistida de hoje em diante.
O consumo.csv manual nunca é alterado por este script.

Colunas de saída iguais às de data/consumo.csv (Nome,Email,CPF,Conteúdo,
Módulo,Nome da aula,Data de conclusão) — CPF e Módulo ficam vazios (o
Supabase não tem essa granularidade), e tanto "Conteúdo" quanto "Nome da
aula" recebem o content_title do Supabase (o data.js usa "Nome da aula" com
prioridade para dedup e exibição).

Variáveis de ambiente necessárias (via GitHub Actions Secrets):
  SUPABASE_URL                -> ex.: https://rovzsgbbrjbkbjbakwap.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   -> chave "service_role" (Project Settings -> API)
"""
import os
import re
import sys
import csv
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

VIEW_NAME = "vw_consumo_completo"

# Colunas na view
COL_EMAIL = "member_email"
COL_NAME = "member_name"
COL_CONTENT = "content_title"
COL_DATE = "completed_at"

OUTPUT_PATH = "data/consumo_supabase.csv"
MANUAL_CSV_PATH = "data/consumo.csv"  # base histórica manual, nunca é alterada
PAGE_SIZE = 1000
BR_TZ = ZoneInfo("America/Sao_Paulo")


def normalize(text):
    """minúsculo, sem acento, sem espaços duplicados/nas pontas — pra comparar
    'mesma aula'/'mesmo email' mesmo com pequenas diferenças de digitação."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def pick(row, keys):
    for k in keys:
        v = row.get(k)
        if v is not None and str(v).strip() != "":
            return v
    return ""


def load_already_counted_keys():
    """Lê data/consumo.csv (se existir) e devolve o conjunto de chaves
    (email normalizado, aula normalizada) já contabilizadas manualmente —
    mesma prioridade de coluna que o data.js usa: 'Nome da aula' > 'Conteúdo'."""
    keys = set()
    if not os.path.exists(MANUAL_CSV_PATH):
        print(f"Aviso: {MANUAL_CSV_PATH} não encontrado — nenhuma deduplicação será feita.")
        return keys
    with open(MANUAL_CSV_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            email = normalize(pick(row, ["Email", "E-mail", "email"]))
            aula = normalize(pick(row, ["Nome da aula", "Conteúdo"]))
            if email and aula:
                keys.add((email, aula))
    print(f"{len(keys)} combinação(ões) email+aula já presentes em {MANUAL_CSV_PATH} (serão ignoradas do Supabase).")
    return keys


def fetch_all_rows():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (secrets do GitHub Actions).")
        sys.exit(1)

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    base = f"{SUPABASE_URL}/rest/v1/{VIEW_NAME}"
    select_cols = f"{COL_EMAIL},{COL_NAME},{COL_CONTENT},{COL_DATE}"

    all_rows = []
    offset = 0
    while True:
        params = {
            "select": select_cols,
            "order": f"{COL_DATE}.asc",
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        resp = requests.get(base, headers=headers, params=params, timeout=60)
        if not resp.ok:
            print(f"ERRO ao consultar Supabase (HTTP {resp.status_code}): {resp.text[:500]}")
            sys.exit(1)
        batch = resp.json()
        if not batch:
            break
        all_rows.extend(batch)
        offset += len(batch)
        print(f"  ...{offset} linha(s) buscada(s) até agora")
        if len(batch) < PAGE_SIZE:
            break
    return all_rows


def to_br_datetime(iso_str):
    """Converte um timestamp ISO (Supabase, UTC) para 'DD/MM/AAAA HH:MM',
    mesmo formato usado em data/consumo.csv (coluna 'Data de conclusão')."""
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    except ValueError:
        return ""
    return dt.astimezone(BR_TZ).strftime("%d/%m/%Y %H:%M")


def main():
    already_counted = load_already_counted_keys()

    print(f"Buscando TODO o consumo em {SUPABASE_URL}/rest/v1/{VIEW_NAME} (sem filtro de id_conta) ...")
    rows = fetch_all_rows()

    os.makedirs("data", exist_ok=True)
    written = 0
    skipped_dupe = 0
    skipped_empty = 0
    seen_in_this_run = set()
    with open(OUTPUT_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Nome", "Email", "CPF", "Conteúdo", "Módulo", "Nome da aula", "Data de conclusão"])
        for r in rows:
            nome = (r.get(COL_NAME) or "").strip()
            email = (r.get(COL_EMAIL) or "").strip()
            conteudo = (r.get(COL_CONTENT) or "").strip()
            data_br = to_br_datetime(r.get(COL_DATE))
            if not email or not conteudo or not data_br:
                skipped_empty += 1
                continue

            key = (normalize(email), normalize(conteudo))
            if key in already_counted or key in seen_in_this_run:
                skipped_dupe += 1
                continue

            seen_in_this_run.add(key)
            # CPF e Módulo ficam vazios (Supabase não tem essa granularidade);
            # Conteúdo e Nome da aula recebem o mesmo content_title.
            writer.writerow([nome, email, "", conteudo, "", conteudo, data_br])
            written += 1

    print(f"OK: {OUTPUT_PATH} gerado com {written} linha(s) nova(s) "
          f"({skipped_dupe} já estavam contabilizadas e foram ignoradas; "
          f"{skipped_empty} descartada(s) por falta de email/conteúdo/data; "
          f"{len(rows)} linha(s) buscada(s) no total do Supabase).")


if __name__ == "__main__":
    main()
