/* =========================================================================
   PipeLovers · Onboarding Dashboard — data.js
   Carrega os CSVs (data/empresas.csv, data/membros.csv, data/consumo.csv),
   normaliza e aplica as regras de negócio de ativação de CS e CX.
   ========================================================================= */

const CSV_PATHS = {
  empresas: "data/empresas.csv",
  membros: "data/membros.csv",
  consumo: "data/consumo.csv",
};

const CS_TARGET_PCT = { // meta macro por CS (% da carteira de empresas ativada)
  default: 60,
  map: {
    "gonzalo cami": 60,
    "nicoly lima": 60,
    "priscila banzato": 65,
    "maria": 65,
  },
};
const CX_TARGET_PCT = 80;      // meta macro de CX: 80% dos membros ativados
const AULAS_PARA_ATIVAR = 3;   // membro ativado = 3 aulas concluídas (100%)
const DIAS_DESENGAJAMENTO = 30;

/* ---------------------------- helpers ---------------------------------- */

function norm(s) {
  return (s || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();
}

function parseBRDate(str) {
  if (!str) return null;
  const s = str.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function addMonthsUTC(date, n) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  return d;
}

function metaMonthKey(registrationDate) {
  // meta mês = mês de cadastro/fechamento + 2 (ex: fechamento em junho -> meta de agosto)
  if (!registrationDate) return null;
  const d = addMonthsUTC(registrationDate, 2);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function metaMonthLabel(key) {
  if (!key) return "—";
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES_PT[m - 1]} ${y}`;
}

function metaMonthEnd(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)); // último dia do mês
}

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function csTargetPct(csName) {
  const key = norm(csName);
  for (const k in CS_TARGET_PCT.map) {
    if (key.includes(k)) return CS_TARGET_PCT.map[k];
  }
  return CS_TARGET_PCT.default;
}

/* ---------------------------- CSV loading ------------------------------- */

function fetchCSV(path) {
  // cache-busting: garante que o navegador e a CDN do GitHub Pages nunca sirvam
  // uma cópia antiga do CSV depois de uma atualização de dados.
  const bustedPath = `${path}?v=${Date.now()}`;
  return fetch(bustedPath, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error(`Não foi possível carregar ${path} (HTTP ${res.status})`);
    return res.text();
  }).then((text) => {
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: "", // auto-detect (empresas/membros = ",", consumo = ";")
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    });
    return parsed.data;
  });
}

/* ---------------------------- Main loader ------------------------------- */

async function loadAllData() {
  const [empresasRaw, membrosRaw, consumoRaw] = await Promise.all([
    fetchCSV(CSV_PATHS.empresas),
    fetchCSV(CSV_PATHS.membros),
    fetchCSV(CSV_PATHS.consumo),
  ]);
  return buildModel(empresasRaw, membrosRaw, consumoRaw);
}

function buildModel(empresasRaw, membrosRaw, consumoRaw) {
  const today = new Date(Date.UTC(
    new Date().getFullYear(), new Date().getMonth(), new Date().getDate()
  ));

  /* ---- 1. Consumo agrupado por email --------------------------------- */
  const consumoByEmail = new Map();
  for (const row of consumoRaw) {
    const email = norm(row["Email"]);
    if (!email) continue;
    if (!consumoByEmail.has(email)) consumoByEmail.set(email, []);
    // "Data de início" é a referência oficial de consumo da aula; quando ausente
    // (comum em cursos automáticos), usa "Data de término" como substituta.
    const dt = parseBRDate(row["Data de início"]) || parseBRDate(row["Data de término"]);
    const progresso = (row["Progresso"] || "").replace("%", "").trim();
    consumoByEmail.get(email).push({
      conteudo: (row["Conteúdo"] || "—").trim(),
      data: dt,
      progresso: progresso ? Number(progresso) : 0,
    });
  }

  /* ---- 2. Empresas ------------------------------------------------------ */
  const empresas = empresasRaw
    .filter((r) => norm(r["Conta Nome"]))
    .map((r, idx) => {
      const dataFechamento = parseBRDate(r["Data de Fechamento"]);
      const dataHandoff = parseBRDate(r["Data Handoff Onboarding"]);
      const numUsuarios = Number((r["Número de usuários que vão usar PipeLovers"] || "").replace(/[^\d.]/g, "")) || 0;
      const motivoChurn = (r["Motivo de churn - Onboarding"] || "").trim();
      const isChurn = !!motivoChurn;
      const metaKey = metaMonthKey(dataFechamento);
      return {
        id: `emp_${idx}`,
        cs: (r["Analista Onboarding"] || "").trim() || "Sem CS",
        nome: (r["Conta Nome"] || "").trim(),
        nomeKey: norm(r["Conta Nome"]),
        dataFechamento,
        dataOnboarding: parseBRDate(r["Data de Onboarding"]),
        dataHandoff,
        numUsuarios,
        thresholdPct: numUsuarios > 20 ? 65 : 60,
        isChurn,
        motivoChurn,
        metaKey,
        membros: [], // preenchido abaixo
      };
    });

  const empresaByKey = new Map(empresas.map((e) => [e.nomeKey, e]));

  /* ---- 3. Membros --------------------------------------------------------
     Enriquecidos com consumo + vínculo à empresa (CS) ou "ongoing".        */
  const membros = membrosRaw
    .filter((r) => norm(r["E-mail"]))
    .map((r, idx) => {
      const email = (r["E-mail"] || "").trim();
      const emailKey = norm(email);
      const contaNome = (r["Conta Nome"] || "").trim();
      const contaKey = norm(contaNome);
      const dataCadastro = parseBRDate(r["Data de cadastro membro"]);
      const empresaMatch = empresaByKey.get(contaKey) || null;
      const isOngoing = !empresaMatch;

      const consumo = (consumoByEmail.get(emailKey) || []).slice()
        .sort((a, b) => (a.data && b.data ? a.data - b.data : 0));

      const cursosConcluidosSet = new Set();
      let ultimoAcesso = null;
      for (const c of consumo) {
        if (c.progresso >= 100) cursosConcluidosSet.add(c.conteudo);
        if (c.data && (!ultimoAcesso || c.data > ultimoAcesso)) ultimoAcesso = c.data;
      }
      const qtdAulasConcluidas = cursosConcluidosSet.size;
      const temConsumo = consumo.length > 0;

      let status;
      if (!temConsumo) {
        status = "alerta";
      } else if (qtdAulasConcluidas >= AULAS_PARA_ATIVAR) {
        status = "ativado";
      } else if (ultimoAcesso && daysBetween(today, ultimoAcesso) > DIAS_DESENGAJAMENTO) {
        status = "desengajado";
      } else {
        status = "em_andamento";
      }

      const metaKey = metaMonthKey(dataCadastro);

      const membro = {
        id: `mem_${idx}`,
        nome: (r["Nome Negócios"] || "—").trim(),
        email,
        emailKey,
        contaNome: contaNome || "—",
        cx: (r["Analista Onboarding"] || "").trim() || "Sem CX",
        proprietario: (r["Proprietário do Negócios"] || "").trim(),
        dataCadastro,
        dataOnboarding: parseBRDate(r["Data de Onboarding"]),
        metaKey,
        cs: empresaMatch ? empresaMatch.cs : null,
        empresaId: empresaMatch ? empresaMatch.id : null,
        isOngoing,
        consumo,
        qtdAulasConcluidas,
        ultimoAcesso,
        status, // alerta | em_andamento | desengajado | ativado
        saiuDaEmpresa: r["Proprietário do Negócios"] && r["Analista Onboarding"] &&
          norm(r["Proprietário do Negócios"]) !== norm(r["Analista Onboarding"]),
      };
      if (empresaMatch) empresaMatch.membros.push(membro);
      return membro;
    });

  /* ---- 4. Métricas por empresa ------------------------------------------ */
  for (const emp of empresas) {
    const total = emp.membros.length;
    const ativados = emp.membros.filter((m) => m.status === "ativado").length;
    emp.totalMembros = total;
    emp.membrosAtivados = ativados;
    emp.pctAtivacao = total > 0 ? Math.round((ativados / total) * 1000) / 10 : 0;
    emp.handoffOk = !!emp.dataHandoff;
    emp.atingiuThreshold = total > 0 && emp.pctAtivacao >= emp.thresholdPct;
    if (emp.isChurn) {
      emp.statusEmpresa = "churn";
    } else if (emp.atingiuThreshold && emp.handoffOk) {
      emp.statusEmpresa = "ativada";
    } else if (emp.atingiuThreshold && !emp.handoffOk) {
      emp.statusEmpresa = "aguardando_handoff";
    } else {
      emp.statusEmpresa = "em_risco";
    }
  }

  /* ---- 5. Meses de meta disponíveis (para os filtros) -------------------- */
  const metaMonthsSet = new Set();
  empresas.forEach((e) => e.metaKey && metaMonthsSet.add(e.metaKey));
  membros.forEach((m) => m.metaKey && metaMonthsSet.add(m.metaKey));
  const metaMonths = [...metaMonthsSet].sort().map((key) => ({ key, label: metaMonthLabel(key) }));

  return { empresas, membros, metaMonths, today };
}
