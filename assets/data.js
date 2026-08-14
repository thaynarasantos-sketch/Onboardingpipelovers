/* =========================================================================
   PipeLovers · Onboarding Dashboard — data.js (v2)
   Carrega os 4 CSVs (empresas, membros, usuarios, consumo), normaliza e
   aplica as regras de negócio de ativação de CS e CX.
   ========================================================================= */

const CSV_PATHS = {
  empresas: "data/empresas.csv",
  membros: "data/membros.csv",
  usuarios: "data/usuarios.csv",
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
const AULAS_PARA_ATIVAR = 3;   // membro/usuário ativado = 3 aulas concluídas
const DIAS_DESENGAJAMENTO = 30;
const CHURN_OWNER_NAME = "thaynara santos"; // proprietário do negócio = churn (CX)

// e-mails institucionais -> responsável (CX) ou "PF" (gestor comercial do CS)
const RESPONSAVEL_EMAIL_MAP = {
  "joao.fabricio@pipelovers.net": "João Fabrício",
  "mariana.vieira@pipelovers.net": "Mariana Vieira",
  "anne.siqueira@pipelovers.net": "Anne Siqueira",
  "natalia.espindola@pipelovers.net": "Natalia Espindola",
  "thaynara.santos@pipelovers.net": "PF",
};

/* ---------------------------- helpers ---------------------------------- */

function norm(s) {
  return (s || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return "";
}

function parseBRDate(str) {
  if (!str) return null;
  const s = str.toString().trim();
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
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
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

// Resolve o "responsável" (CX ou PF) de um usuário a partir do e-mail
// institucional preenchido em "Proprietário do Onboarding". Retorna null
// quando o e-mail não está na lista de responsáveis identificados — nesse
// caso o usuário é desconsiderado da base de ativação de CS.
function resolveResponsavelFromEmail(email) {
  const key = norm(email);
  if (!key) return null;
  return RESPONSAVEL_EMAIL_MAP[key] || null;
}

// Unifica variações do mesmo nome (ex.: "João Fabrício" vs "João Fabricio")
// preferindo a grafia acentuada como forma canônica de exibição.
function buildCanonicalNames(rawNames) {
  const map = new Map();
  for (const raw of rawNames) {
    const clean = (raw || "").trim();
    if (!clean) continue;
    const key = norm(clean);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, clean);
    } else {
      const hasAccentExisting = /[^\x00-\x7F]/.test(existing);
      const hasAccentNew = /[^\x00-\x7F]/.test(clean);
      if (!hasAccentExisting && hasAccentNew) map.set(key, clean);
    }
  }
  return (raw) => {
    const clean = (raw || "").trim();
    if (!clean) return "";
    return map.get(norm(clean)) || clean;
  };
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
      delimiter: "", // auto-detect ("," nas planilhas de empresas/membros/usuarios, ";" no consumo)
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    });
    return parsed.data;
  });
}

/* ---------------------------- Main loader ------------------------------- */

async function loadAllData() {
  const [empresasRaw, membrosRaw, usuariosRaw, consumoRaw] = await Promise.all([
    fetchCSV(CSV_PATHS.empresas),
    fetchCSV(CSV_PATHS.membros),
    fetchCSV(CSV_PATHS.usuarios),
    fetchCSV(CSV_PATHS.consumo),
  ]);
  return buildModel(empresasRaw, membrosRaw, usuariosRaw, consumoRaw);
}

function buildModel(empresasRaw, membrosRaw, usuariosRaw, consumoRaw) {
  const today = new Date(Date.UTC(
    new Date().getFullYear(), new Date().getMonth(), new Date().getDate()
  ));

  /* ---- 0. Nomes canônicos de CX (unifica "João Fabrício" / "João Fabricio") */
  const cxRawNames = membrosRaw.map((r) => pick(r, ["Analista Onboarding"]));
  const canonCX = buildCanonicalNames(cxRawNames);

  /* ---- 1. Consumo agrupado por e-mail ---------------------------------- */
  const consumoByEmail = new Map();
  for (const row of consumoRaw) {
    const email = norm(pick(row, ["Email", "E-mail", "email"]));
    if (!email) continue;
    if (!consumoByEmail.has(email)) consumoByEmail.set(email, []);
    const dt = parseBRDate(pick(row, ["Data de conclusão", "Data de início", "Data de término"]));
    const conteudo = pick(row, ["Nome da aula", "Conteúdo"]) || "—";
    consumoByEmail.get(email).push({ conteudo: conteudo.trim(), data: dt });
  }

  function consumoStats(emailKey) {
    const list = (consumoByEmail.get(emailKey) || []).slice()
      .sort((a, b) => (a.data && b.data ? a.data - b.data : 0));
    const aulasSet = new Set(list.map((c) => c.conteudo));
    let ultimoAcesso = null;
    for (const c of list) if (c.data && (!ultimoAcesso || c.data > ultimoAcesso)) ultimoAcesso = c.data;
    return { consumo: list, qtdAulasConcluidas: aulasSet.size, ultimoAcesso, temConsumo: list.length > 0 };
  }

  function statusFromConsumo(stats) {
    if (!stats.temConsumo) return "alerta";
    if (stats.qtdAulasConcluidas >= AULAS_PARA_ATIVAR) return "ativado";
    if (stats.ultimoAcesso && daysBetween(today, stats.ultimoAcesso) > DIAS_DESENGAJAMENTO) return "desengajado";
    return "em_andamento";
  }

  /* ---- 2. Empresas ------------------------------------------------------ */
  const empresas = empresasRaw
    .filter((r) => norm(pick(r, ["Conta Nome"])))
    .map((r, idx) => {
      const dataFechamento = parseBRDate(pick(r, ["Data de Fechamento"]));
      const dataHandoff = parseBRDate(pick(r, ["Data Handoff Onboarding"]));
      const numUsuarios = Number((pick(r, ["Número de usuários que vão usar PipeLovers"]) || "").replace(/[^\d.]/g, "")) || 0;
      const motivoChurn = (pick(r, ["Motivo de churn - Onboarding"]) || "").trim();
      const isChurn = !!motivoChurn;
      const metaKey = metaMonthKey(dataFechamento);
      return {
        id: `emp_${idx}`,
        cs: (pick(r, ["Analista Onboarding"]) || "").trim() || "Sem CS",
        nome: (pick(r, ["Conta Nome"]) || "").trim(),
        nomeKey: norm(pick(r, ["Conta Nome"])),
        dataFechamento,
        dataOnboarding: parseBRDate(pick(r, ["Data de Onboarding"])),
        dataHandoff,
        numUsuarios,
        thresholdPct: numUsuarios > 20 ? 65 : 60,
        isChurn,
        motivoChurn,
        metaKey,
        usuarios: [],       // preenchido abaixo (usuarios.csv) — base da ativação de CS
        responsaveis: new Set(), // CX / PF distintos entre os usuários da empresa
      };
    });

  const empresaByKey = new Map(empresas.map((e) => [e.nomeKey, e]));

  /* ---- 3. Usuários (base de ativação de CS, via usuarios.csv) -----------
     Deduplicados por e-mail (mantém a primeira ocorrência), vinculados à
     empresa pelo nome e ao responsável (CX ou PF) pelo e-mail institucional. */
  const usuariosSeen = new Set();
  let usuIdx = 0;
  for (const r of usuariosRaw) {
    const email = (pick(r, ["email do usuario e membro", "Email", "E-mail", "email"]) || "").trim();
    const emailKey = norm(email);
    if (!emailKey || usuariosSeen.has(emailKey)) continue;
    usuariosSeen.add(emailKey);

    const nomeEmpresa = (pick(r, ["Nome da Empresa", "Conta Nome"]) || "").trim();
    const empresaMatch = empresaByKey.get(norm(nomeEmpresa)) || null;
    if (!empresaMatch) continue; // usuário fora da carteira atual de empresas do CS

    const stats = consumoStats(emailKey);
    const responsavelEmail = pick(r, ["Proprietário do Onboarding"]);
    const responsavel = resolveResponsavelFromEmail(responsavelEmail);
    if (!responsavel) continue; // proprietário do onboarding não identificado -> desconsiderar usuário

    const usuario = {
      id: `usu_${usuIdx++}`,
      nome: (pick(r, ["Nome Completo"]) || `${pick(r, ["Nome"])} ${pick(r, ["Sobrenome"])}`).trim() || "—",
      email,
      emailKey,
      responsavel, // "PF" ou nome do CX
      isPF: responsavel === "PF",
      consumo: stats.consumo,
      qtdAulasConcluidas: stats.qtdAulasConcluidas,
      ultimoAcesso: stats.ultimoAcesso,
      status: statusFromConsumo(stats),
    };
    empresaMatch.usuarios.push(usuario);
    empresaMatch.responsaveis.add(responsavel);
  }

  /* ---- 4. Métricas por empresa ------------------------------------------ */
  for (const emp of empresas) {
    const total = emp.usuarios.length;
    const ativados = emp.usuarios.filter((u) => u.status === "ativado").length;
    emp.totalMembros = total;
    emp.membrosAtivados = ativados;
    emp.pctAtivacao = total > 0 ? Math.round((ativados / total) * 1000) / 10 : 0;
    emp.handoffOk = !!emp.dataHandoff;
    emp.atingiuThreshold = total > 0 && emp.pctAtivacao >= emp.thresholdPct;
    emp.responsaveisList = [...emp.responsaveis].sort((a, b) => a.localeCompare(b, "pt-BR"));

    if (emp.isChurn) {
      emp.statusEmpresa = "churn";
    } else if (emp.atingiuThreshold && emp.handoffOk) {
      emp.statusEmpresa = "ativada";
    } else if (emp.atingiuThreshold && !emp.handoffOk) {
      emp.statusEmpresa = "aguardando_handoff";
    } else if (ativados === 0) {
      emp.statusEmpresa = "em_risco";
    } else {
      emp.statusEmpresa = "em_andamento";
    }
  }

  /* ---- 5. Membros (base de ativação de CX, via membros.csv) --------------
     Enriquecidos com consumo + vínculo à empresa (CS) ou "ongoing", e com o
     status de churn quando Proprietário do Negócio = Thaynara Santos.       */
  const membros = membrosRaw
    .filter((r) => norm(pick(r, ["E-mail"])))
    .map((r, idx) => {
      const email = (pick(r, ["E-mail"]) || "").trim();
      const emailKey = norm(email);
      const contaNome = (pick(r, ["Conta Nome"]) || "").trim();
      const contaKey = norm(contaNome);
      const dataCadastro = parseBRDate(pick(r, ["Data de cadastro membro"]));
      const empresaMatch = empresaByKey.get(contaKey) || null;
      const isOngoing = !empresaMatch;

      const stats = consumoStats(emailKey);
      const analistaRaw = (pick(r, ["Analista Onboarding"]) || "").trim();
      const analista = canonCX(analistaRaw) || "Sem CX";
      const proprietarioRaw = (pick(r, ["Proprietário do Negócios"]) || "").trim();
      const proprietario = canonCX(proprietarioRaw);

      const isChurnMembro = !!analistaRaw && norm(proprietario) === CHURN_OWNER_NAME;
      const status = isChurnMembro ? "churn" : statusFromConsumo(stats);
      const metaKey = metaMonthKey(dataCadastro);

      const membro = {
        id: `mem_${idx}`,
        nome: (pick(r, ["Nome Negócios"]) || "—").trim(),
        email,
        emailKey,
        contaNome: contaNome || "—",
        cx: analista,
        proprietario,
        dataCadastro,
        dataOnboarding: parseBRDate(pick(r, ["Data de Onboarding"])),
        metaKey,
        cs: empresaMatch ? empresaMatch.cs : null,
        empresaId: empresaMatch ? empresaMatch.id : null,
        isOngoing,
        consumo: stats.consumo,
        qtdAulasConcluidas: stats.qtdAulasConcluidas,
        ultimoAcesso: stats.ultimoAcesso,
        status, // alerta | em_andamento | desengajado | ativado | churn
        saiuDaEmpresa: proprietarioRaw && analistaRaw && norm(proprietario) !== norm(analista),
      };
      return membro;
    });

  /* ---- 6. Meses de meta disponíveis (para os filtros) -------------------- */
  const metaMonthsSet = new Set();
  empresas.forEach((e) => e.metaKey && metaMonthsSet.add(e.metaKey));
  membros.forEach((m) => m.metaKey && metaMonthsSet.add(m.metaKey));
  const metaMonths = [...metaMonthsSet].sort().map((key) => ({ key, label: metaMonthLabel(key) }));

  return { empresas, membros, metaMonths, today };
}
