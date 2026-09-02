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
  cxongoing: "data/cxongoing.csv",
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
const AULAS_PARA_ATIVAR_ONGOING = 1; // membro ongoing ativado = 1 aula (após a data de cadastro ongoing)
const CX_ONGOING_META_TARGET = 100;  // meta fixa: 100 membros ativados no mês da data de cadastro ongoing
const DIAS_DESENGAJAMENTO = 30;
const CHURN_OWNER_NAME = "thaynara santos"; // proprietário do negócio = churn (CX)
const CHURN_ONGOING_ANALISTA = "thabata harumi"; // analista ongoing associado ao churn de CX Ongoing

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

function rawMonthKey(date) {
  // mês da própria data, sem deslocamento — usado no CX Ongoing (meta = mês
  // da própria "Data cadastro Ongoing", não mês+2 como em CS/CX).
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const [empresasRaw, membrosRaw, usuariosRaw, consumoRaw, cxongoingRaw] = await Promise.all([
    fetchCSV(CSV_PATHS.empresas),
    fetchCSV(CSV_PATHS.membros),
    fetchCSV(CSV_PATHS.usuarios),
    fetchCSV(CSV_PATHS.consumo),
    fetchCSV(CSV_PATHS.cxongoing),
  ]);
  return buildModel(empresasRaw, membrosRaw, usuariosRaw, consumoRaw, cxongoingRaw);
}

function buildModel(empresasRaw, membrosRaw, usuariosRaw, consumoRaw, cxongoingRaw) {
  const today = new Date(Date.UTC(
    new Date().getFullYear(), new Date().getMonth(), new Date().getDate()
  ));

  /* ---- 0. Nomes canônicos de CX (unifica "João Fabrício" / "João Fabricio") */
  const cxRawNames = membrosRaw.map((r) => pick(r, ["Analista Onboarding"]))
    .concat(cxongoingRaw.map((r) => pick(r, ["Analista Ongoing"])));
  const canonCX = buildCanonicalNames(cxRawNames);

  /* ---- 1. Consumo agrupado por e-mail ---------------------------------- */
  const consumoByEmail = new Map();
  for (const row of consumoRaw) {
    const email = norm(pick(row, ["Email", "E-mail", "email"]));
    if (!email) continue;
    if (!consumoByEmail.has(email)) consumoByEmail.set(email, []);
    const dt = parseBRDate(pick(row, ["Data de conclusão", "Data de início", "Data de término"]));
    const conteudo = pick(row, ["Nome da aula", "Conteúdo"]) || "—";
    // "Matrícula" (quando existir) identifica a aula de forma mais estável que o
    // nome em texto — evita contar duas vezes a mesma aula se o nome mudar de
    // grafia entre exportações. Quando ausente, cai no nome normalizado.
    const matricula = (pick(row, ["Matrícula", "Matricula"]) || "").toString().trim();
    const dedupKey = matricula || norm(conteudo);
    consumoByEmail.get(email).push({ conteudo: conteudo.trim(), data: dt, dedupKey });
  }

  function consumoStats(emailKey) {
    const list = (consumoByEmail.get(emailKey) || []).slice()
      .sort((a, b) => (a.data && b.data ? a.data - b.data : 0));
    const aulasSet = new Set(list.map((c) => c.dedupKey));
    let ultimoAcesso = null;
    for (const c of list) if (c.data && (!ultimoAcesso || c.data > ultimoAcesso)) ultimoAcesso = c.data;
    return { consumo: list, qtdAulasConcluidas: aulasSet.size, ultimoAcesso, temConsumo: list.length > 0 };
  }

  // Igual a consumoStats, mas só considera aulas com data de consumo igual ou
  // posterior a `sinceDate` — usado no CX Ongoing, onde só conta o consumo
  // ocorrido após a "Data cadastro Ongoing" do membro. Registros sem data
  // conhecida são descartados aqui (não dá para confirmar que vieram depois).
  function consumoStatsSince(emailKey, sinceDate) {
    const full = (consumoByEmail.get(emailKey) || []);
    const list = full.filter((c) => c.data && (!sinceDate || c.data >= sinceDate))
      .slice().sort((a, b) => a.data - b.data);
    const aulasSet = new Set(list.map((c) => c.dedupKey));
    let ultimoAcesso = null;
    for (const c of list) if (!ultimoAcesso || c.data > ultimoAcesso) ultimoAcesso = c.data;
    return { consumo: list, qtdAulasConcluidas: aulasSet.size, ultimoAcesso, temConsumo: list.length > 0 };
  }

  function statusFromConsumo(stats) {
    if (!stats.temConsumo) return "alerta";
    if (stats.qtdAulasConcluidas >= AULAS_PARA_ATIVAR) return "ativado";
    if (stats.ultimoAcesso && daysBetween(today, stats.ultimoAcesso) > DIAS_DESENGAJAMENTO) return "desengajado";
    return "em_andamento";
  }

  function statusFromConsumoOngoing(stats) {
    if (!stats.temConsumo) return "alerta";
    if (stats.qtdAulasConcluidas >= AULAS_PARA_ATIVAR_ONGOING) return "ativado";
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

  /* ---- 3. Membros (base de ativação de CX, via membros.csv) --------------
     Enriquecidos com consumo + vínculo à empresa (CS) ou "ongoing", e com o
     status de churn quando Proprietário do Negócio = Thaynara Santos. Este
     bloco roda antes dos usuários porque o status de churn calculado aqui
     também precisa ser aplicado ao usuário de mesmo e-mail na aba de CS.    */
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
      const dataOnboarding = parseBRDate(pick(r, ["Data de Onboarding"]));

      const membro = {
        id: `mem_${idx}`,
        nome: (pick(r, ["Nome Negócios"]) || "—").trim(),
        email,
        emailKey,
        contaNome: contaNome || "—",
        cx: analista,
        proprietario,
        dataCadastro,
        dataOnboarding,
        temOnboarding: !!dataOnboarding,
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

  // e-mails de membros em churn (CX) — usado para também marcar como churn o
  // usuário correspondente na aba de CS (mesmo e-mail = mesma pessoa).
  const churnedMembroEmails = new Set(membros.filter((m) => m.status === "churn").map((m) => m.emailKey));
  // e-mail -> data de onboarding (quando existir) — usado para trazer a data
  // de onboarding registrada em membros.csv para o usuário correspondente na
  // aba de CS (o usuarios.csv não tem essa coluna, mas a pessoa é a mesma).
  const onboardingDateByEmail = new Map(
    membros.filter((m) => m.dataOnboarding).map((m) => [m.emailKey, m.dataOnboarding])
  );

  /* ---- 4. Usuários (base de ativação de CS, via usuarios.csv) -----------
     Deduplicados por e-mail: quando o mesmo e-mail aparece em mais de uma
     linha (comum, já que a planilha não é limpa antes do upload), prioriza
     a linha que tem "Proprietário do Onboarding" identificado — evita
     descartar um usuário só porque a primeira ocorrência dele veio com o
     campo em branco e uma ocorrência seguinte tem o dado completo. Usuários
     cujo e-mail bate com um membro em churn (CX) também viram churn aqui e
     ficam fora do cálculo de % de ativação da empresa. */
  const usuariosByEmail = new Map();
  for (const r of usuariosRaw) {
    const email = (pick(r, ["email do usuario e membro", "Email", "E-mail", "email"]) || "").trim();
    const emailKey = norm(email);
    if (!emailKey) continue;
    const responsavel = resolveResponsavelFromEmail(pick(r, ["Proprietário do Onboarding"]));
    const existing = usuariosByEmail.get(emailKey);
    if (!existing) {
      usuariosByEmail.set(emailKey, { row: r, email, responsavel });
    } else if (!existing.responsavel && responsavel) {
      // a ocorrência atual tem responsável identificado e a anterior não -> substitui
      usuariosByEmail.set(emailKey, { row: r, email, responsavel });
    }
  }

  let usuIdx = 0;
  for (const { row: r, email, responsavel } of usuariosByEmail.values()) {
    const emailKey = norm(email);
    const nomeEmpresa = (pick(r, ["Nome da Empresa", "Conta Nome"]) || "").trim();
    const empresaMatch = empresaByKey.get(norm(nomeEmpresa)) || null;
    if (!empresaMatch) continue; // usuário fora da carteira atual de empresas do CS
    if (!responsavel) continue; // proprietário do onboarding não identificado -> desconsiderar usuário

    const stats = consumoStats(emailKey);
    const isChurnUsuario = churnedMembroEmails.has(emailKey);
    // Usuário PF (gestão direta do CS, sem CX) não tem reunião de onboarding
    // própria registrada em membros.csv — para ele, a data de onboarding é a
    // da própria empresa (empresas.csv, coluna "Data de Onboarding"). Para
    // usuários com CX, a data vem do membro de mesmo e-mail em membros.csv.
    const dataOnboarding = responsavel === "PF"
      ? (empresaMatch.dataOnboarding || null)
      : (onboardingDateByEmail.get(emailKey) || null);
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
      dataOnboarding,       // vem de membros.csv, cruzado por e-mail
      temOnboarding: !!dataOnboarding,
      status: isChurnUsuario ? "churn" : statusFromConsumo(stats),
    };
    empresaMatch.usuarios.push(usuario);
    empresaMatch.responsaveis.add(responsavel);
  }

  /* ---- 5. Métricas por empresa ------------------------------------------
     Usuários em churn (mesmo e-mail de um membro em churn no CX) entram na
     lista da empresa para visibilidade, mas ficam fora do numerador E do
     denominador do % de ativação — não contam contra nem a favor da meta.  */
  for (const emp of empresas) {
    const usuariosAtivaveis = emp.usuarios.filter((u) => u.status !== "churn");
    const total = usuariosAtivaveis.length;
    const ativados = usuariosAtivaveis.filter((u) => u.status === "ativado").length;
    const comOnboarding = usuariosAtivaveis.filter((u) => u.temOnboarding).length;
    emp.totalMembros = total;
    emp.membrosAtivados = ativados;
    emp.usuariosChurnCount = emp.usuarios.length - total;
    emp.pctAtivacao = total > 0 ? Math.round((ativados / total) * 1000) / 10 : 0;
    emp.usuariosComOnboarding = comOnboarding;
    emp.pctCobertura = total > 0 ? Math.round((comOnboarding / total) * 1000) / 10 : 0;
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

  /* ---- 6. Meses de meta disponíveis (para os filtros) -------------------- */
  const metaMonthsSet = new Set();
  empresas.forEach((e) => e.metaKey && metaMonthsSet.add(e.metaKey));
  membros.forEach((m) => m.metaKey && metaMonthsSet.add(m.metaKey));
  const metaMonths = [...metaMonthsSet].sort().map((key) => ({ key, label: metaMonthLabel(key) }));

  /* ---- 7. CX Ongoing (base: cxongoing.csv) ------------------------------
     Aba independente das demais: agrupamento é sempre pela própria empresa
     do cxongoing.csv (não é cruzado com empresas.csv). Ativação = 1 aula
     (não 3), contando só consumo ocorrido a partir da Data cadastro Ongoing.
     Churn = Proprietário do Negócio = Thaynara Santos E Analista Ongoing =
     Thabata Harumi. "Onboarding" aqui, reaproveitando os mesmos nomes de
     campo do resto do painel, representa a reunião de reengajamento. */
  const membrosOngoing = cxongoingRaw
    .filter((r) => norm(pick(r, ["E-mail"])))
    .map((r, idx) => {
      const email = (pick(r, ["E-mail"]) || "").trim();
      const emailKey = norm(email);
      const contaNome = (pick(r, ["Conta Nome"]) || "").trim();
      const dataCadastroOngoing = parseBRDate(pick(r, ["Data cadastro Ongoing"]));
      const analistaRaw = (pick(r, ["Analista Ongoing"]) || "").trim();
      const analista = canonCX(analistaRaw) || "Sem CX";
      const proprietarioRaw = (pick(r, ["Proprietário do Negócios"]) || "").trim();
      const proprietario = canonCX(proprietarioRaw);

      const isChurnOngoing = norm(proprietario) === CHURN_OWNER_NAME && norm(analista) === CHURN_ONGOING_ANALISTA;
      const stats = consumoStatsSince(emailKey, dataCadastroOngoing);
      const status = isChurnOngoing ? "churn" : statusFromConsumoOngoing(stats);
      const dataReengajamento = parseBRDate(pick(r, ["Data da reunião de reengajamento Ongoing"]));
      const metaKey = rawMonthKey(dataCadastroOngoing);

      return {
        id: `ongm_${idx}`,
        nome: (pick(r, ["Nome Negócios"]) || "—").trim(),
        email,
        emailKey,
        contaNome: contaNome || "—",
        cx: analista,
        proprietario,
        dataCadastro: dataCadastroOngoing,
        metaKey,
        isOngoing: true, // por definição, todo mundo nesta base já está em ongoing
        consumo: stats.consumo,
        qtdAulasConcluidas: stats.qtdAulasConcluidas,
        ultimoAcesso: stats.ultimoAcesso,
        dataOnboarding: dataReengajamento,   // reaproveita o campo -> é a reunião de reengajamento aqui
        temOnboarding: !!dataReengajamento,  // idem
        status, // alerta | em_andamento | desengajado | ativado | churn
      };
    });

  const ongoingMetaMonthsSet = new Set();
  membrosOngoing.forEach((m) => m.metaKey && ongoingMetaMonthsSet.add(m.metaKey));
  const ongoingMetaMonths = [...ongoingMetaMonthsSet].sort().map((key) => ({ key, label: metaMonthLabel(key) }));

  return { empresas, membros, metaMonths, membrosOngoing, ongoingMetaMonths, today };
}
