'use strict';

/* =========================================================
   1. DATOS BASE — rutina fija de la semana
   ========================================================= */
const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const DIAS_LABEL = { lunes:'Lun', martes:'Mar', miercoles:'Mié', jueves:'Jue', viernes:'Vie', sabado:'Sáb', domingo:'Dom' };
const DIAS_LARGO = { lunes:'lunes', martes:'martes', miercoles:'miércoles', jueves:'jueves', viernes:'viernes', sabado:'sábado', domingo:'domingo' };

// type: 'negocio' | 'cursada' | 'estudio' | 'viaje'
const RUTINA = {
  lunes: [
    { hora:'15:00 – 16:00', label:'Viaje a la facultad', type:'viaje', icon:'🚌' },
    { hora:'16:00 – 22:00', label:'Cursada', type:'cursada', icon:'🎓' },
  ],
  martes: [
    { hora:'08:30 – 13:00', label:'Negocio (turno mañana)', type:'negocio', icon:'🏠' },
    { hora:'13:00 – 17:00', label:'Entrenamiento / Estudio', type:'estudio', icon:'💻' },
    { hora:'17:00 – 20:30', label:'Negocio (turno tarde)', type:'negocio', icon:'🏠' },
  ],
  miercoles: [
    { hora:'08:30 – 13:00', label:'Negocio (turno mañana)', type:'negocio', icon:'🏠' },
    { hora:'17:00 – 22:00', label:'Cursada', type:'cursada', icon:'🎓' },
  ],
  jueves: [
    { hora:'08:30 – 13:00', label:'Negocio (turno mañana)', type:'negocio', icon:'🏠' },
    { hora:'17:00 – 22:00', label:'Cursada', type:'cursada', icon:'🎓' },
  ],
  viernes: [
    { hora:'08:30 – 13:00', label:'Negocio (turno mañana)', type:'negocio', icon:'🏠' },
    { hora:'13:00 – 17:00', label:'Entrenamiento / Estudio', type:'estudio', icon:'💻' },
    { hora:'17:00 – 20:30', label:'Negocio (turno tarde)', type:'negocio', icon:'🏠' },
  ],
  sabado: [],
  domingo: [],
};

const TYPE_COLOR = {
  negocio:'var(--green-soft)', cursada:'var(--violet-soft)', estudio:'var(--cyan)', viaje:'var(--amber)',
};

// Qué tipos de bloque resalta cada modo de contexto
const CONTEXT_HIGHLIGHT = {
  local:   ['negocio'],
  cursada: ['cursada','viaje'],
  estudio: ['estudio'],
};

/* =========================================================
   2. STORE — habla con /api/data (Turso) vía clave-valor genérico,
   con caché en memoria para lecturas instantáneas.
   ========================================================= */
const Store = (() => {
  const API = '/api/data';
  let cache = {};

  async function refresh(){
    const res = await fetch(API);
    if (!res.ok) throw new Error('No se pudo conectar con la base de datos');
    cache = await res.json();
  }

  async function set(key, value){
    cache[key] = value; // optimista: actualiza ya mismo la UI
    const res = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error('No se pudo guardar en la base de datos');
  }

  const todayKey = () => 'focus:' + new Date().toISOString().slice(0, 10);

  function getFocusHoy(){
    return cache[todayKey()] || {
      metas: [
        { texto:'', done:false },
        { texto:'', done:false },
        { texto:'', done:false },
      ],
      habitos: { entrenamiento:false, codigo:false, gastos:false },
    };
  }
  async function setFocusHoy(data){
    await set(todayKey(), data);
  }
  function getContext(){ return cache.contextMode || 'local'; }
  async function setContext(v){ await set('contextMode', v); }
  function getDiaSeleccionado(){
    return cache.diaSeleccionado || DIAS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  }
  async function setDiaSeleccionado(v){ await set('diaSeleccionado', v); }

  // --- Finanzas / Deudas (misma base, claves nuevas) ---
  function getDeudas(){ return cache.deudas || []; }
  async function setDeudas(v){ await set('deudas', v); }
  function getPagos(){ return cache.pagos || []; }
  async function setPagos(v){ await set('pagos', v); }
  function getWalletsFin(){ return cache.walletsFin || { efectivo:0, virtual:0 }; }
  async function setWalletsFin(v){ await set('walletsFin', v); }

  return {
    refresh, getFocusHoy, setFocusHoy, getContext, setContext, getDiaSeleccionado, setDiaSeleccionado,
    getDeudas, setDeudas, getPagos, setPagos, getWalletsFin, setWalletsFin,
  };
})();

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);

/* =========================================================
   2b. SELECTORS — cálculos financieros
   ========================================================= */
const Fin = {
  pagosDeDeuda(deudaId){ return Store.getPagos().filter(p => p.deudaId === deudaId); },
  totalPagado(deudaId){ return Fin.pagosDeDeuda(deudaId).reduce((s, p) => s + p.monto, 0); },
  saldoRestante(deuda){ return Math.max(0, deuda.monto - Fin.totalPagado(deuda.id)); },
  deudasEnriquecidas(){
    return Store.getDeudas().map(d => {
      const pagado = Fin.totalPagado(d.id);
      const saldo = Math.max(0, d.monto - pagado);
      return { deuda:d, pagado, saldo, saldada: saldo <= 0 };
    }).sort((a, b) => {
      if (a.saldada !== b.saldada) return a.saldada ? 1 : -1;
      return new Date(b.deuda.fecha) - new Date(a.deuda.fecha);
    });
  },
  totalAdeudado(){
    return Fin.deudasEnriquecidas().filter(x => !x.saldada).reduce((s, x) => s + x.saldo, 0);
  },
};

/* =========================================================
   3. RENDER
   ========================================================= */
const HABITOS_DEF = [
  { key:'entrenamiento', label:'Entrenamiento', icon:'🏋️' },
  { key:'codigo', label:'Avance en código', icon:'💻' },
  { key:'gastos', label:'Control de gastos', icon:'💸' },
];

function renderFecha(){
  const d = new Date();
  const txt = d.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('fechaHoy').textContent = txt;
}

function tickReloj(){
  const el = document.getElementById('relojVivo');
  if (el) el.textContent = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
}
setInterval(tickReloj, 1000);
tickReloj();

function switchView(name){
  const current = document.querySelector('.view-pane.active');
  const target = document.getElementById('view-' + name);
  if (!target || current === target) return;

  current.style.animation = 'viewOut .22s ease forwards';
  setTimeout(() => {
    current.classList.remove('active');
    current.style.animation = '';
    target.classList.add('active');
  }, 220);

  document.querySelectorAll('.nav-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });

  document.getElementById('fabNuevaDeuda').classList.toggle('hide', name !== 'deudas');
}

function renderContextBar(activeOverride){
  const active = activeOverride || Store.getContext();
  document.querySelectorAll('.context-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.context === active);
  });
}

function renderMetas(){
  const data = Store.getFocusHoy();
  const host = document.getElementById('metasList');
  host.innerHTML = '';

  data.metas.forEach((meta, i) => {
    const row = document.createElement('div');
    row.className = 'meta-row';
    row.innerHTML = `
      <div class="checkbox ${meta.done ? 'checked' : ''}" data-action="toggle-meta" data-i="${i}">
        ${meta.done ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06231a" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>' : ''}
      </div>
      <input type="text" class="meta-input ${meta.done ? 'done' : ''}" data-action="edit-meta" data-i="${i}"
             placeholder="Meta innegociable #${i + 1}" value="${escapeHtml(meta.texto)}">
    `;
    host.appendChild(row);
  });

  const done = data.metas.filter(m => m.done).length;
  document.getElementById('metasCount').textContent = `${done}/3`;
  document.getElementById('metasProgress').style.width = (done / 3 * 100) + '%';
}

function renderHabitos(){
  const data = Store.getFocusHoy();
  const host = document.getElementById('habitosList');
  host.innerHTML = '';

  HABITOS_DEF.forEach(h => {
    const on = data.habitos[h.key];
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.innerHTML = `
      <div class="habit-icon">${h.icon}</div>
      <p class="habit-label ${on ? 'done' : ''}">${h.label}</p>
      <div class="toggle ${on ? 'on' : ''}" data-action="toggle-habito" data-key="${h.key}">
        <div class="toggle-dot"></div>
      </div>
    `;
    host.appendChild(row);
  });
}

function renderDayTabs(){
  const activo = Store.getDiaSeleccionado();
  const host = document.getElementById('dayTabs');
  host.innerHTML = '';
  DIAS.forEach(dia => {
    const btn = document.createElement('button');
    btn.className = `day-tab ${dia === activo ? 'active' : ''}`;
    btn.dataset.action = 'select-day';
    btn.dataset.dia = dia;
    btn.textContent = DIAS_LABEL[dia];
    host.appendChild(btn);
  });
}

function renderTimeline(){
  const dia = Store.getDiaSeleccionado();
  const context = Store.getContext();
  const highlight = CONTEXT_HIGHLIGHT[context] || [];
  const bloques = RUTINA[dia] || [];
  const host = document.getElementById('timelineHost');
  host.innerHTML = '';

  if (!bloques.length) {
    host.innerHTML = `<p class="tl-empty">Día libre — sin bloques cargados para el ${DIAS_LARGO[dia]}.</p>`;
    return;
  }

  bloques.forEach(b => {
    const dim = highlight.length && !highlight.includes(b.type);
    const item = document.createElement('div');
    item.className = `tl-item ${dim ? 'dim' : ''}`;
    item.innerHTML = `
      <div class="tl-dot" style="background:${TYPE_COLOR[b.type]}"></div>
      <p class="tl-time mono" style="color:${TYPE_COLOR[b.type]}">${b.hora}</p>
      <p class="tl-label">${b.icon} ${b.label}</p>
    `;
    host.appendChild(item);
  });
}

function renderFinSummary(){
  const w = Store.getWalletsFin();
  const disponible = w.efectivo + w.virtual;
  const adeudado = Fin.totalAdeudado();
  const diferencia = disponible - adeudado;

  document.getElementById('saldoEfectivo').textContent = money(w.efectivo);
  document.getElementById('saldoVirtual').textContent = money(w.virtual);
  document.getElementById('finTotalAdeudado').textContent = money(adeudado);
  const difEl = document.getElementById('finDiferencia');
  difEl.textContent = money(diferencia);
  difEl.style.color = diferencia >= 0 ? 'var(--green-soft)' : 'var(--red)';
}

function renderDeudas(){
  const enriched = Fin.deudasEnriquecidas();
  const activas = enriched.filter(x => !x.saldada);
  document.getElementById('deudasActivasCount').textContent = `${activas.length} activa${activas.length === 1 ? '' : 's'}`;

  const host = document.getElementById('deudasList');
  host.innerHTML = '';

  if (!enriched.length) {
    host.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-faint); font-size:13px;">No tenés deudas anotadas. Tocá el botón + para agregar una.</div>`;
    return;
  }

  enriched.forEach(({ deuda, pagado, saldo, saldada }) => {
    const pct = deuda.monto > 0 ? Math.min(100, (pagado / deuda.monto) * 100) : 0;
    const row = document.createElement('div');
    row.className = `debt-row ${saldada ? 'saldada' : ''}`;
    row.dataset.action = 'edit-debt';
    row.dataset.id = deuda.id;
    row.innerHTML = `
      <div class="row-between" style="margin-bottom:8px;">
        <p style="font-size:14px; font-weight:700; margin:0;">${escapeHtml(deuda.descripcion)}</p>
        <span class="debt-badge" style="background:${saldada ? 'var(--green-dim)' : 'var(--red-dim)'}; color:${saldada ? 'var(--green-soft)' : 'var(--red)'}">
          ${saldada ? '✓ Saldada' : 'Activa'}
        </span>
      </div>
      <div class="progress-track" style="margin-bottom:8px;">
        <div class="progress-fill" style="width:${pct}%; background:${saldada ? 'var(--green-soft)' : 'var(--amber)'}"></div>
      </div>
      <div class="row-between">
        <p class="mono" style="font-size:11px; color:var(--text-faint); margin:0;">Pagado ${money(pagado)} de ${money(deuda.monto)}</p>
        <p class="mono" style="font-size:14px; font-weight:800; margin:0; color:${saldada ? 'var(--green-soft)' : 'var(--red)'}">${money(saldo)}</p>
      </div>
    `;
    host.appendChild(row);
  });
}

function renderPaymentsList(deudaId){
  const pagos = Fin.pagosDeDeuda(deudaId).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const host = document.getElementById('paymentsList');
  if (!pagos.length) {
    host.innerHTML = `<p style="font-size:12px; color:var(--text-faint);">Todavía no registraste pagos.</p>`;
    return;
  }
  host.innerHTML = pagos.map(p => `
    <div class="row-between" style="background:var(--surface-3); border-radius:11px; padding:9px 12px;">
      <p class="mono" style="font-size:11px; color:var(--text-dim); margin:0;">${new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</p>
      <div class="row g-2">
        <p class="mono" style="font-size:13px; font-weight:700; color:var(--green-soft); margin:0;">${money(p.monto)}</p>
        <button data-action="delete-payment" data-id="${p.id}" data-debt="${deudaId}" style="width:22px; height:22px; border-radius:99px; background:var(--red-dim); display:flex; align-items:center; justify-content:center;">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function money(n){ return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }

function renderAll(){
  renderFecha();
  renderContextBar();
  renderMetas();
  renderHabitos();
  renderDayTabs();
  renderTimeline();
  renderFinSummary();
  renderDeudas();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function toast(msg, kind = 'ok'){
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast';
  const dot = document.createElement('span');
  dot.style.color = kind === 'error' ? 'var(--red)' : 'var(--green-soft)';
  dot.textContent = '●';
  el.append(dot, document.createTextNode(' ' + msg));
  host.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function setSyncing(isSyncing){
  document.getElementById('syncIcon').classList.toggle('spin', isSyncing);
}

/* =========================================================
   4. EVENTOS
   ========================================================= */
document.addEventListener('click', async (e) => {
  if (e.target.closest('#syncBadge')) {
    setSyncing(true);
    try { await Store.refresh(); renderAll(); toast('Datos actualizados'); }
    catch (err) { toast('No se pudo actualizar. Revisá tu conexión.', 'error'); }
    setSyncing(false);
    return;
  }

  const ctxBtn = e.target.closest('[data-context]');
  if (ctxBtn) {
    const prev = Store.getContext();
    renderContextBar(ctxBtn.dataset.context); // respuesta visual inmediata
    document.getElementById('rutinaSection').scrollIntoView({ behavior:'smooth', block:'center' });
    try {
      await Store.setContext(ctxBtn.dataset.context);
      renderTimeline();
    } catch (err) {
      toast('No se pudo guardar. Revisá tu conexión.', 'error');
      renderContextBar(prev);
    }
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'toggle-meta') {
    const i = Number(actionEl.dataset.i);
    const data = Store.getFocusHoy();
    data.metas[i].done = !data.metas[i].done;
    renderMetas(); // optimista
    try { await Store.setFocusHoy(data); }
    catch (err) { toast('No se pudo guardar. Revisá tu conexión.', 'error'); }
  }

  if (action === 'toggle-habito') {
    const key = actionEl.dataset.key;
    const data = Store.getFocusHoy();
    data.habitos[key] = !data.habitos[key];
    renderHabitos(); // optimista
    try { await Store.setFocusHoy(data); }
    catch (err) { toast('No se pudo guardar. Revisá tu conexión.', 'error'); }
  }

  if (action === 'select-day') {
    Store.setDiaSeleccionado(actionEl.dataset.dia); // solo local a la sesión, no crítico
    renderDayTabs();
    renderTimeline();
  }

  if (action === 'switch-view') {
    switchView(actionEl.dataset.view);
  }

  if (action === 'edit-wallet') {
    const tipo = actionEl.dataset.tipo;
    const w = Store.getWalletsFin();
    const label = tipo === 'efectivo' ? 'efectivo físico' : 'billetera virtual';
    const val = prompt(`Saldo disponible en ${label} ($):`, w[tipo]);
    if (val === null) return;
    const num = Number(val);
    if (isNaN(num) || num < 0) return toast('Ingresá un monto válido', 'error');
    try {
      await Store.setWalletsFin({ ...w, [tipo]: num });
      renderFinSummary();
      toast('Saldo actualizado');
    } catch (err) { toast('No se pudo guardar. Revisá tu conexión.', 'error'); }
  }

  if (action === 'new-debt') openDebtModal();
  if (action === 'edit-debt') openDebtModal(actionEl.dataset.id);
  if (action === 'close-debt') closeDebtModal();
  if (action === 'save-debt') await saveDebt();
  if (action === 'delete-debt') await deleteDebt();
  if (action === 'add-payment') await addPayment();
  if (action === 'delete-payment') await deletePayment(actionEl.dataset.id, actionEl.dataset.debt);
});

document.getElementById('debtModal').addEventListener('click', (e) => {
  if (e.target.id === 'debtModal') closeDebtModal();
});

function openDebtModal(id){
  document.getElementById('debtModal').style.display = 'flex';
  document.getElementById('paymentsSection').classList.toggle('hide', !id);

  if (id) {
    const deuda = Store.getDeudas().find(d => d.id === id);
    document.getElementById('debtModalTitle').textContent = 'Editar deuda';
    document.getElementById('dId').value = deuda.id;
    document.getElementById('dDescripcion').value = deuda.descripcion;
    document.getElementById('dMonto').value = deuda.monto;
    document.getElementById('dFecha').value = deuda.fecha;
    document.getElementById('dPagoMonto').value = '';

    const saldo = Fin.saldoRestante(deuda);
    const pagado = Fin.totalPagado(deuda.id);
    const pct = deuda.monto > 0 ? Math.min(100, (pagado / deuda.monto) * 100) : 0;
    document.getElementById('dSaldoRestante').textContent = money(saldo);
    document.getElementById('dProgressFill').style.width = pct + '%';
    renderPaymentsList(id);
  } else {
    document.getElementById('debtModalTitle').textContent = 'Nueva deuda';
    document.getElementById('dId').value = '';
    document.getElementById('dDescripcion').value = '';
    document.getElementById('dMonto').value = '';
    document.getElementById('dFecha').value = today();
  }
}

function closeDebtModal(){
  document.getElementById('debtModal').style.display = 'none';
}

async function saveDebt(){
  const id = document.getElementById('dId').value;
  const descripcion = document.getElementById('dDescripcion').value.trim();
  const monto = Number(document.getElementById('dMonto').value);
  const fecha = document.getElementById('dFecha').value;

  if (!descripcion) return toast('Ponele una descripción a la deuda', 'error');
  if (!monto || monto <= 0) return toast('Ingresá un monto válido', 'error');
  if (!fecha) return toast('Elegí una fecha', 'error');

  const btn = document.getElementById('btnSaveDebt');
  btn.disabled = true;
  try {
    const deudas = Store.getDeudas();
    if (id) {
      await Store.setDeudas(deudas.map(d => d.id === id ? { id, descripcion, monto, fecha } : d));
      toast('Deuda actualizada');
    } else {
      deudas.push({ id: uid(), descripcion, monto, fecha });
      await Store.setDeudas(deudas);
      toast('Deuda registrada');
    }
    closeDebtModal();
    renderDeudas();
    renderFinSummary();
  } catch (err) {
    toast('No se pudo guardar. Revisá tu conexión.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteDebt(){
  const id = document.getElementById('dId').value;
  if (!id || !confirm('¿Eliminar esta deuda y todos sus pagos registrados?')) return;
  try {
    await Store.setDeudas(Store.getDeudas().filter(d => d.id !== id));
    await Store.setPagos(Store.getPagos().filter(p => p.deudaId !== id));
    closeDebtModal();
    renderDeudas();
    renderFinSummary();
    toast('Deuda eliminada');
  } catch (err) {
    toast('No se pudo eliminar. Revisá tu conexión.', 'error');
  }
}

async function addPayment(){
  const deudaId = document.getElementById('dId').value;
  const monto = Number(document.getElementById('dPagoMonto').value);
  if (!monto || monto <= 0) return toast('Ingresá un monto de pago válido', 'error');

  try {
    const pagos = Store.getPagos();
    pagos.push({ id: uid(), deudaId, monto, fecha: today() });
    await Store.setPagos(pagos);
    document.getElementById('dPagoMonto').value = '';
    toast('Pago registrado');

    const deuda = Store.getDeudas().find(d => d.id === deudaId);
    const saldo = Fin.saldoRestante(deuda);
    const pagado = Fin.totalPagado(deudaId);
    const pct = deuda.monto > 0 ? Math.min(100, (pagado / deuda.monto) * 100) : 0;
    document.getElementById('dSaldoRestante').textContent = money(saldo);
    document.getElementById('dProgressFill').style.width = pct + '%';
    renderPaymentsList(deudaId);
    renderDeudas();
    renderFinSummary();
  } catch (err) {
    toast('No se pudo registrar el pago. Revisá tu conexión.', 'error');
  }
}

async function deletePayment(id, deudaId){
  if (!confirm('¿Eliminar este pago?')) return;
  try {
    await Store.setPagos(Store.getPagos().filter(p => p.id !== id));
    toast('Pago eliminado');

    const deuda = Store.getDeudas().find(d => d.id === deudaId);
    const saldo = Fin.saldoRestante(deuda);
    const pagado = Fin.totalPagado(deudaId);
    const pct = deuda.monto > 0 ? Math.min(100, (pagado / deuda.monto) * 100) : 0;
    document.getElementById('dSaldoRestante').textContent = money(saldo);
    document.getElementById('dProgressFill').style.width = pct + '%';
    renderPaymentsList(deudaId);
    renderDeudas();
    renderFinSummary();
  } catch (err) {
    toast('No se pudo eliminar. Revisá tu conexión.', 'error');
  }
}

let metaSaveTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="edit-meta"]');
  if (!el) return;
  const i = Number(el.dataset.i);
  const data = Store.getFocusHoy();
  data.metas[i].texto = el.value;

  clearTimeout(metaSaveTimer);
  metaSaveTimer = setTimeout(async () => {
    try { await Store.setFocusHoy(data); }
    catch (err) { toast('No se pudo guardar. Revisá tu conexión.', 'error'); }
  }, 500);
});

/* =========================================================
   5. INIT
   ========================================================= */
async function init(){
  setSyncing(true);
  try {
    await Store.refresh();
  } catch (err) {
    toast('No se pudo conectar con la base de datos', 'error');
  }
  setSyncing(false);
  renderAll();
}
init();
