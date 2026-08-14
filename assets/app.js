/* =========================================================================
   PipeLovers · Onboarding Dashboard — app.js (v2)
   Renderização das abas CS e CX: filtros (checkbox multi-seleção), KPIs
   (gauges de meta), tabelas com drill-down (empresa -> usuário/membro -> aulas).
   ========================================================================= */

const STATUS_META = {
  ativado:      { label: "Ativado",       cls: "ok"    },
  em_andamento: { label: "Em andamento",  cls: "info"  },
  desengajado:  { label: "Desengajado",   cls: "warn"  },
  alerta:       { label: "Alerta",        cls: "bad"   },
  churn:        { label: "Churn",         cls: "churn" },
};
const EMPRESA_STATUS_META = {
  ativada:             { label: "Ativada",             cls: "ok"    },
  aguardando_handoff:  { label: "Aguardando handoff",  cls: "warn"  },
  em_andamento:        { label: "Em andamento",        cls: "info"  },
  em_risco:            { label: "Em risco",            cls: "bad"   },
  churn:               { label: "Churn",               cls: "churn" },
};
const CS_STATUS_ORDER = ["ativada", "aguardando_handoff", "em_andamento", "em_risco", "churn"];
const CX_STATUS_ORDER = ["ativado", "em_andamento", "desengajado", "alerta", "churn"];

let MODEL = null;

const state = {
  cs: {
    f: { analistas: new Set(), meta: new Set(), fechFrom: "", fechTo: "", hoFrom: "", hoTo: "", nome: "", responsavel: new Set(), status: new Set() },
    expandedEmp: new Set(),
    expandedMem: new Set(),
  },
  cx: {
    f: { analistas: new Set(), meta: new Set(), status: new Set(), cs: new Set(), empresa: "", email: "" },
    expandedEmp: new Set(),
    expandedMem: new Set(),
  },
};

/* --------------------------- boot --------------------------------------- */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireTabs();
  wireRefresh();
  await loadAndRender(true);
}

function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function wireRefresh() {
  document.getElementById("btn-refresh").addEventListener("click", () => loadAndRender(false));
}

async function loadAndRender(first) {
  setStatusPill("loading");
  try {
    MODEL = await loadAllData();
    initFiltersOnce();
    renderCS();
    renderCX();
    setStatusPill("ok");
  } catch (err) {
    console.error(err);
    setStatusPill("err", err.message);
    if (first) {
      document.getElementById("view-cs").innerHTML = errorBox(err.message);
      document.getElementById("view-cx").innerHTML = errorBox(err.message);
    }
  }
}

function errorBox(msg) {
  return `<div class="err-box">Não foi possível carregar os dados (${escapeHtml(msg)}).
  Verifique se os arquivos <code>data/empresas.csv</code>, <code>data/membros.csv</code>,
  <code>data/usuarios.csv</code> e <code>data/consumo.csv</code> estão publicados no repositório
  e se esta página está sendo servida via GitHub Pages (http/https) — o carregamento de CSV não
  funciona abrindo o arquivo localmente (file://).</div>`;
}

function setStatusPill(kind, msg) {
  const el = document.getElementById("status-pill");
  el.classList.remove("stale", "err");
  if (kind === "loading") {
    el.querySelector(".txt").textContent = "Carregando dados…";
  } else if (kind === "ok") {
    const now = new Date();
    el.querySelector(".txt").textContent = `Dados carregados às ${now.toLocaleTimeString("pt-BR")}`;
  } else {
    el.classList.add("err");
    el.querySelector(".txt").textContent = "Erro ao carregar dados";
  }
}

let filtersInited = false;
function initFiltersOnce() {
  if (filtersInited) { refreshMetaMonthOptions(); return; }
  filtersInited = true;

  const csAnalistas = uniqueSorted(MODEL.empresas.map((e) => e.cs));
  const cxAnalistas = uniqueSorted(MODEL.membros.map((m) => m.cx));
  const responsaveis = uniqueSorted(MODEL.empresas.flatMap((e) => e.responsaveisList));

  buildMultiSelect("cs-f-analista", state.cs.f.analistas, () => renderCS(), itemsFromLabels(csAnalistas));
  buildMultiSelect("cs-f-meta", state.cs.f.meta, () => renderCS(), itemsFromMonths(MODEL.metaMonths));
  buildMultiSelect("cs-f-responsavel", state.cs.f.responsavel, () => renderCS(), itemsFromLabels(responsaveis));
  buildMultiSelect("cs-f-status", state.cs.f.status, () => renderCS(), itemsFromKeyed(CS_STATUS_ORDER, EMPRESA_STATUS_META));

  buildMultiSelect("cx-f-analista", state.cx.f.analistas, () => renderCX(), itemsFromLabels(cxAnalistas));
  buildMultiSelect("cx-f-meta", state.cx.f.meta, () => renderCX(), itemsFromMonths(MODEL.metaMonths));
  buildMultiSelect("cx-f-status", state.cx.f.status, () => renderCX(), itemsFromKeyed(CX_STATUS_ORDER, STATUS_META));
  buildMultiSelect("cx-f-cs", state.cx.f.cs, () => renderCX(), itemsFromLabels(csAnalistas));

  document.getElementById("cs-f-fechfrom").addEventListener("change", (e) => { state.cs.f.fechFrom = e.target.value; renderCS(); });
  document.getElementById("cs-f-fechto").addEventListener("change", (e) => { state.cs.f.fechTo = e.target.value; renderCS(); });
  document.getElementById("cs-f-hofrom").addEventListener("change", (e) => { state.cs.f.hoFrom = e.target.value; renderCS(); });
  document.getElementById("cs-f-hoto").addEventListener("change", (e) => { state.cs.f.hoTo = e.target.value; renderCS(); });
  document.getElementById("cs-f-nome").addEventListener("input", (e) => { state.cs.f.nome = e.target.value; renderCS(); });
  document.getElementById("cs-f-clear").addEventListener("click", () => clearFilters("cs"));

  document.getElementById("cx-f-empresa").addEventListener("input", (e) => { state.cx.f.empresa = e.target.value; renderCX(); });
  document.getElementById("cx-f-email").addEventListener("input", (e) => { state.cx.f.email = e.target.value; renderCX(); });
  document.getElementById("cx-f-clear").addEventListener("click", () => clearFilters("cx"));
}

function refreshMetaMonthOptions() {
  // reconstrói opções de mês de meta caso novos meses tenham surgido em um novo CSV
  buildMultiSelect("cs-f-meta", state.cs.f.meta, () => renderCS(), itemsFromMonths(MODEL.metaMonths));
  buildMultiSelect("cx-f-meta", state.cx.f.meta, () => renderCX(), itemsFromMonths(MODEL.metaMonths));
}

function clearFilters(tab) {
  const f = state[tab].f;
  Object.keys(f).forEach((k) => {
    if (f[k] instanceof Set) f[k].clear(); else f[k] = "";
  });
  document.querySelectorAll(`#view-${tab} .f-input`).forEach((i) => (i.value = ""));
  document.querySelectorAll(`#view-${tab} .msel-opt input`).forEach((i) => (i.checked = false));
  document.querySelectorAll(`#view-${tab} .msel-btn .msel-btn-label`).forEach((l) => (l.textContent = "Todos"));
  document.querySelectorAll(`#view-${tab} .msel-btn .count`).forEach((c) => c.remove());
  tab === "cs" ? renderCS() : renderCX();
}

/* --------------------------- multi-select widget ------------------------
   buildMultiSelect(containerId, targetSet, onChange, items)
   items: array of {label, value} — value is what gets stored in targetSet. */

function buildMultiSelect(containerId, targetSet, onChange, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "msel";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "msel-btn";
  btn.innerHTML = `<span class="msel-btn-label">Todos</span>`;
  const panel = document.createElement("div");
  panel.className = "msel-panel";

  const opts = document.createElement("div");
  items.forEach(({ label, value }) => {
    const row = document.createElement("label");
    row.className = "msel-opt";
    row.innerHTML = `<input type="checkbox" value="${escapeAttr(value)}"><span>${escapeHtml(label)}</span>`;
    const input = row.querySelector("input");
    input.checked = targetSet.has(value);
    input.addEventListener("change", () => {
      if (input.checked) targetSet.add(value); else targetSet.delete(value);
      updateMselLabel(btn, targetSet.size, items.length);
      onChange();
    });
    opts.appendChild(row);
  });

  const actions = document.createElement("div");
  actions.className = "msel-actions";
  actions.innerHTML = `<button type="button" data-a="all">Selecionar todos</button><button type="button" data-a="none">Limpar</button>`;
  actions.querySelector('[data-a="all"]').addEventListener("click", () => {
    targetSet.clear();
    items.forEach(({ value }) => targetSet.add(value));
    panel.querySelectorAll("input").forEach((i) => (i.checked = true));
    updateMselLabel(btn, targetSet.size, items.length);
    onChange();
  });
  actions.querySelector('[data-a="none"]').addEventListener("click", () => {
    targetSet.clear();
    panel.querySelectorAll("input").forEach((i) => (i.checked = false));
    updateMselLabel(btn, 0, items.length);
    onChange();
  });

  panel.appendChild(opts);
  panel.appendChild(actions);
  wrap.appendChild(btn);
  wrap.appendChild(panel);
  container.appendChild(wrap);

  btn.addEventListener("click", () => {
    document.querySelectorAll(".msel.open").forEach((m) => m !== wrap && m.classList.remove("open"));
    wrap.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  });

  updateMselLabel(btn, targetSet.size, items.length);
}

function itemsFromLabels(labels) {
  return labels.map((l) => ({ label: l, value: l }));
}
function itemsFromMonths(months) {
  return months.map((m) => ({ label: m.label, value: m.key }));
}
function itemsFromKeyed(keys, metaMap) {
  return keys.map((k) => ({ label: metaMap[k].label, value: k }));
}

function updateMselLabel(btn, count, total) {
  const label = btn.querySelector(".msel-btn-label");
  const existingCount = btn.querySelector(".count");
  if (existingCount) existingCount.remove();
  label.textContent = count === 0 ? "Todos" : `${count} selecionado${count > 1 ? "s" : ""}`;
}

/* --------------------------- filtering ----------------------------------- */

function inRange(date, fromStr, toStr) {
  if (!date) return !fromStr && !toStr;
  if (fromStr && date < new Date(fromStr + "T00:00:00Z")) return false;
  if (toStr && date > new Date(toStr + "T23:59:59Z")) return false;
  return true;
}

function filterEmpresas() {
  const f = state.cs.f;
  return MODEL.empresas.filter((e) => {
    if (f.analistas.size && !f.analistas.has(e.cs)) return false;
    if (f.meta.size && !f.meta.has(e.metaKey)) return false;
    if (f.nome && !norm(e.nome).includes(norm(f.nome))) return false;
    if (!inRange(e.dataFechamento, f.fechFrom, f.fechTo)) return false;
    if ((f.hoFrom || f.hoTo) && !inRange(e.dataHandoff, f.hoFrom, f.hoTo)) return false;
    if (f.responsavel.size && !e.responsaveisList.some((r) => f.responsavel.has(r))) return false;
    if (f.status.size && !f.status.has(e.statusEmpresa)) return false;
    return true;
  }).sort((a, b) => b.pctAtivacao - a.pctAtivacao);
}

function filterMembrosCX() {
  const f = state.cx.f;
  return MODEL.membros.filter((m) => {
    if (f.analistas.size && !f.analistas.has(m.cx)) return false;
    if (f.meta.size && !f.meta.has(m.metaKey)) return false;
    if (f.status.size && !f.status.has(m.status)) return false;
    if (f.cs.size && !(m.cs && f.cs.has(m.cs))) return false;
    if (f.empresa && !norm(m.contaNome).includes(norm(f.empresa))) return false;
    if (f.email && !norm(m.email).includes(norm(f.email))) return false;
    return true;
  });
}

/* --------------------------- gauge / kpis -------------------------------- */

function gaugeSVG(pct, colorVar) {
  const r = 40, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return `<svg width="96" height="96" viewBox="0 0 96 96">
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="${colorVar}" stroke-width="9"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
  </svg>`;
}

function pctColor(pct, target) {
  if (pct >= target) return "var(--ok)";
  if (pct >= target * 0.6) return "var(--warn)";
  return "var(--bad)";
}

function stackBar(segments) {
  return `<div class="stackbar">${segments.map((s) => `<span style="width:${s.pct}%;background:${s.color}"></span>`).join("")}</div>`;
}
function legend(items) {
  return `<div class="legend">${items.map(([label, color]) => `<div class="li"><span class="sw" style="background:${color}"></span>${label}</div>`).join("")}</div>`;
}

/* ================================ CS TAB ================================= */

function renderCS() {
  if (!MODEL) return;
  const list = filterEmpresas();
  renderCSKpis(list);
  renderCSTable(list);
}

function CS_TARGET_PCT_display(list) {
  const csSet = state.cs.f.analistas.size ? [...state.cs.f.analistas] : uniqueSorted(list.map((e) => e.cs));
  if (!csSet.length) return CS_TARGET_PCT.default;
  const pcts = csSet.map(csTargetPct);
  return Math.round((sum(pcts) / pcts.length) * 10) / 10;
}

function renderCSKpis(list) {
  const box = document.getElementById("cs-kpis");
  const total = list.length;
  const churn = list.filter((e) => e.statusEmpresa === "churn").length;
  const ativadas = list.filter((e) => e.statusEmpresa === "ativada").length;
  const aguardando = list.filter((e) => e.statusEmpresa === "aguardando_handoff").length;
  const andamento = list.filter((e) => e.statusEmpresa === "em_andamento").length;
  const risco = list.filter((e) => e.statusEmpresa === "em_risco").length;
  const pctGeral = total ? Math.round((ativadas / total) * 1000) / 10 : 0;
  const targetPct = CS_TARGET_PCT_display(list);

  box.innerHTML = `
    <div class="card kpi-goal">
      ${gaugeSVG(pctGeral, pctColor(pctGeral, targetPct))}
      <div class="kpi-goal-text">
        <div class="lbl">Atingimento da meta</div>
        <div class="val">${fmtPct(pctGeral)}</div>
        <div class="sub">Meta: <b>${targetPct}%</b> das empresas ativadas até o fim do mês</div>
      </div>
    </div>
    <div class="card kpi-simple">
      <div class="lbl">Empresas na carteira</div>
      <div class="val">${total}</div>
      <div class="breakdown-grid">
        <div class="bd-item"><span class="bd-num" style="color:var(--ok)">${ativadas}</span><span class="bd-label">Ativadas</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--warn)">${aguardando}</span><span class="bd-label">Aguard. handoff</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--blue-soft)">${andamento}</span><span class="bd-label">Em andamento</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--bad)">${risco}</span><span class="bd-label">Em risco</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--churn)">${churn}</span><span class="bd-label">Churn</span></div>
      </div>
      ${stackBar([
        { pct: total ? ativadas/total*100 : 0, color: "var(--ok)" },
        { pct: total ? aguardando/total*100 : 0, color: "var(--warn)" },
        { pct: total ? andamento/total*100 : 0, color: "var(--blue-soft)" },
        { pct: total ? risco/total*100 : 0, color: "var(--bad)" },
        { pct: total ? churn/total*100 : 0, color: "var(--churn)" },
      ])}
    </div>
    <div class="card kpi-simple">
      <div class="lbl">Aguardando handoff</div>
      <div class="val">${aguardando}</div>
      <div class="sub">Empresas que já bateram o % de ativação mas ainda não têm data de handoff registrada</div>
    </div>
    <div class="card kpi-simple">
      <div class="lbl">Usuários nas empresas filtradas</div>
      <div class="val">${sum(list.map((e) => e.totalMembros))}</div>
      <div class="sub"><b>${sum(list.map((e) => e.membrosAtivados))}</b> usuários ativados (3 aulas concluídas)</div>
    </div>
  `;
}

function renderCSTable(list) {
  const wrap = document.getElementById("cs-table-wrap");
  document.getElementById("cs-result-count").textContent = `${list.length} empresa${list.length !== 1 ? "s" : ""}`;

  if (!list.length) {
    wrap.innerHTML = emptyState("Nenhuma empresa encontrada com os filtros atuais.");
    return;
  }

  const rows = list.map((emp) => {
    const st = EMPRESA_STATUS_META[emp.statusEmpresa];
    const expanded = state.cs.expandedEmp.has(emp.id);
    return `
      <tr class="row-main${expanded ? " expanded" : ""}" data-emp="${emp.id}">
        <td><div class="cell-main">${chevSvg()}<div><div class="name-strong">${escapeHtml(emp.nome)}</div>
          <div class="name-sub">${emp.numUsuarios} usuários contratados · limite ${emp.thresholdPct}%</div></div></div></td>
        <td>${escapeHtml(emp.cs)}</td>
        <td>${emp.responsaveisList.length ? emp.responsaveisList.map(escapeHtml).join(", ") : "—"}</td>
        <td><span class="badge ${st.cls}"><span class="dot"></span>${st.label}</span></td>
        <td>
          <div class="mini-progress"><span style="width:${Math.min(100, emp.pctAtivacao)}%"></span></div>
          <div class="pct-txt">${fmtPct(emp.pctAtivacao)} · ${emp.membrosAtivados}/${emp.totalMembros}</div>
        </td>
        <td>${fmtDate(emp.dataFechamento)}</td>
        <td>${emp.dataHandoff ? fmtDate(emp.dataHandoff) : "—"}</td>
        <td>${metaMonthLabel(emp.metaKey)}</td>
      </tr>
      <tr class="row-detail${expanded ? " open" : ""}" data-emp-detail="${emp.id}">
        <td colspan="8" class="detail-wrap">${renderEmpresaUsuariosBlock(emp)}</td>
      </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Empresa</th><th>CS</th><th>CX / PF</th><th>Status</th><th>Ativação</th>
        <th>Fechamento</th><th>Handoff</th><th>Mês da meta</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  wireExpandableTable(wrap, "cs");
}

function renderEmpresaUsuariosBlock(emp) {
  if (emp.statusEmpresa === "churn") {
    return `<div class="detail-title">Empresa em churn</div>
      <div class="no-courses">Motivo: ${escapeHtml(emp.motivoChurn)} — desconsiderada da meta de ativação, contabilizada apenas na carteira total (${emp.totalMembros} usuários, ${emp.membrosAtivados} ativados).</div>`;
  }
  if (!emp.usuarios.length) {
    return `<div class="detail-title">Usuários</div><div class="no-courses">Nenhum usuário encontrado na base de usuários (usuarios.csv) para esta empresa.</div>`;
  }
  const head = `<div class="member-grid-head"><div>Usuário</div><div>E-mail</div><div>Responsável</div><div>Status</div><div>Aulas</div><div>Últ. acesso</div></div>`;
  const rows = emp.usuarios.slice().sort((a, b) => b.qtdAulasConcluidas - a.qtdAulasConcluidas).map((u) => memberRow(u, "cs")).join("");
  return `<div class="detail-title">Usuários (${emp.usuarios.length})</div><div class="member-grid">${head}${rows}</div>`;
}

function memberRow(m, tab) {
  const st = STATUS_META[m.status];
  const responsavelLabel = tab === "cs" ? m.responsavel : m.cx;
  return `
    <div class="member-row" data-mem="${m.id}" data-tab="${tab}">
      <div class="mm-name">${escapeHtml(m.nome)}</div>
      <div class="mm-email">${escapeHtml(m.email)}</div>
      <div class="mm-cs">${escapeHtml(responsavelLabel || "—")}</div>
      <div><span class="badge ${st.cls}"><span class="dot"></span>${st.label}</span></div>
      <div>${m.qtdAulasConcluidas} / ${AULAS_PARA_ATIVAR}</div>
      <div class="mm-last">${m.ultimoAcesso ? fmtDate(m.ultimoAcesso) : "—"}</div>
    </div>
    <div class="courses-panel" id="courses-${tab}-${m.id}" style="display:none">${renderCourses(m)}</div>`;
}

function renderCourses(m) {
  if (!m.consumo.length) return `<div class="no-courses">Nenhum registro de consumo encontrado para este e-mail.</div>`;
  return m.consumo.slice().reverse().map((c) => `
    <div class="course-item">
      <span class="cname">${escapeHtml(c.conteudo)} ✓</span>
      <span class="cdate">${c.data ? fmtDate(c.data) : "—"}</span>
    </div>`).join("");
}

/* ================================ CX TAB ================================= */

function renderCX() {
  if (!MODEL) return;
  const list = filterMembrosCX();
  renderCXKpis(list);
  renderCXTable(list);
}

function renderCXKpis(list) {
  const box = document.getElementById("cx-kpis");
  const total = list.length;
  const ativados = list.filter((m) => m.status === "ativado").length;
  const alerta = list.filter((m) => m.status === "alerta").length;
  const deseng = list.filter((m) => m.status === "desengajado").length;
  const andamento = list.filter((m) => m.status === "em_andamento").length;
  const churn = list.filter((m) => m.status === "churn").length;
  const pct = total ? Math.round((ativados / total) * 1000) / 10 : 0;

  box.innerHTML = `
    <div class="card kpi-goal">
      ${gaugeSVG(pct, pctColor(pct, CX_TARGET_PCT))}
      <div class="kpi-goal-text">
        <div class="lbl">Atingimento da meta</div>
        <div class="val">${fmtPct(pct)}</div>
        <div class="sub">Meta: <b>${CX_TARGET_PCT}%</b> dos membros com 3 aulas até o fim do mês</div>
      </div>
    </div>
    <div class="card kpi-simple">
      <div class="lbl">Membros na carteira</div>
      <div class="val">${total}</div>
      <div class="breakdown-grid">
        <div class="bd-item"><span class="bd-num" style="color:var(--ok)">${ativados}</span><span class="bd-label">Ativados</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--blue-soft)">${andamento}</span><span class="bd-label">Em andamento</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--warn)">${deseng}</span><span class="bd-label">Desengajados</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--bad)">${alerta}</span><span class="bd-label">Alerta</span></div>
        <div class="bd-item"><span class="bd-num" style="color:var(--churn)">${churn}</span><span class="bd-label">Churn</span></div>
      </div>
      ${stackBar([
        { pct: total ? ativados/total*100 : 0, color: "var(--ok)" },
        { pct: total ? andamento/total*100 : 0, color: "var(--blue-soft)" },
        { pct: total ? deseng/total*100 : 0, color: "var(--warn)" },
        { pct: total ? alerta/total*100 : 0, color: "var(--bad)" },
        { pct: total ? churn/total*100 : 0, color: "var(--churn)" },
      ])}
    </div>
    <div class="card kpi-simple">
      <div class="lbl">Desengajados</div>
      <div class="val">${deseng}</div>
      <div class="sub">Sem consumo de aula há mais de ${DIAS_DESENGAJAMENTO} dias</div>
    </div>
    <div class="card kpi-simple">
      <div class="lbl">Em alerta</div>
      <div class="val">${alerta}</div>
      <div class="sub">Nenhum registro de acesso encontrado na base de consumo</div>
    </div>
  `;
}

function renderCXTable(list) {
  const wrap = document.getElementById("cx-table-wrap");
  document.getElementById("cx-result-count").textContent = `${list.length} membro${list.length !== 1 ? "s" : ""}`;

  if (!list.length) {
    wrap.innerHTML = emptyState("Nenhum membro encontrado com os filtros atuais.");
    return;
  }

  // agrupar por empresa (chave normalizada, para não separar por diferenças de maiúsculas/espaços)
  const groups = new Map();
  for (const m of list) {
    const key = norm(m.contaNome) || "—";
    if (!groups.has(key)) groups.set(key, { label: m.contaNome || "—", members: [] });
    groups.get(key).members.push(m);
  }
  const groupArr = [...groups.values()].sort((a, b) => b.members.length - a.members.length);

  const rows = groupArr.map(({ label: empresaNome, members }) => {
    const id = `cx_${slug(empresaNome)}`;
    const ativados = members.filter((m) => m.status === "ativado").length;
    const pct = Math.round((ativados / members.length) * 1000) / 10;
    const isOngoing = members[0].isOngoing;
    const cs = members[0].cs;
    const expanded = state.cx.expandedEmp.has(id);
    return `
      <tr class="row-main${expanded ? " expanded" : ""}" data-emp="${id}">
        <td><div class="cell-main">${chevSvg()}<div><div class="name-strong">${escapeHtml(empresaNome)}</div>
          <div class="name-sub">${members.length} membro${members.length !== 1 ? "s" : ""}</div></div></div></td>
        <td>${isOngoing ? `<span class="badge info"><span class="dot"></span>Ongoing</span>` : escapeHtml(cs || "—")}</td>
        <td>
          <div class="mini-progress"><span style="width:${Math.min(100, pct)}%"></span></div>
          <div class="pct-txt">${fmtPct(pct)} · ${ativados}/${members.length}</div>
        </td>
        <td>${uniqueSorted(members.map((m) => m.cx)).join(", ")}</td>
        <td>${uniqueSorted(members.map((m) => metaMonthLabel(m.metaKey))).join(", ")}</td>
      </tr>
      <tr class="row-detail${expanded ? " open" : ""}" data-emp-detail="${id}">
        <td colspan="5" class="detail-wrap">
          <div class="detail-title">Membros (${members.length})</div>
          <div class="member-grid">
            <div class="member-grid-head"><div>Membro</div><div>E-mail</div><div>CX</div><div>Status</div><div>Aulas</div><div>Últ. acesso</div></div>
            ${members.map((m) => memberRow(m, "cx")).join("")}
          </div>
        </td>
      </tr>`;
  }).join("");

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Empresa</th><th>CS / Origem</th><th>Ativação</th><th>CX</th><th>Mês da meta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  wireExpandableTable(wrap, "cx");
}

/* --------------------------- shared expand wiring ------------------------ */

function wireExpandableTable(wrap, tab) {
  wrap.querySelectorAll(".row-main").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.dataset.emp;
      const detail = wrap.querySelector(`[data-emp-detail="${cssEscape(id)}"]`);
      const setRef = tab === "cs" ? state.cs.expandedEmp : state.cx.expandedEmp;
      const willOpen = !tr.classList.contains("expanded");
      tr.classList.toggle("expanded", willOpen);
      detail.classList.toggle("open", willOpen);
      if (willOpen) setRef.add(id); else setRef.delete(id);
    });
  });
  wrap.querySelectorAll(".member-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = row.dataset.mem;
      const t = row.dataset.tab;
      const panel = document.getElementById(`courses-${t}-${id}`);
      const setRef = t === "cs" ? state.cs.expandedMem : state.cx.expandedMem;
      const willOpen = panel.style.display === "none";
      panel.style.display = willOpen ? "block" : "none";
      if (willOpen) setRef.add(id); else setRef.delete(id);
    });
  });
  wrap.querySelectorAll(".row-detail").forEach((tr) => tr.addEventListener("click", (e) => e.stopPropagation()));
}

/* --------------------------- misc utils ---------------------------------- */

function chevSvg() {
  return `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>`;
}
function emptyState(msg) {
  return `<div class="state-box"><div class="big">${escapeHtml(msg)}</div><div class="small">Ajuste ou limpe os filtros para ver mais resultados.</div></div>`;
}
function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function fmtPct(n) { return `${n.toFixed(1).replace(".0", "")}%`; }
function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, "-"); }
function cssEscape(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
