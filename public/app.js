import { readPdf } from './pdf-import.js';
import { createLabController } from './lab-bootstrap.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, collection, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  "apiKey": "AIzaSyAkloEU1am_WTHdO3FIFkPaiX885bx8uuQ",
  "authDomain": "historico-orcamentario-cau-pr.firebaseapp.com",
  "projectId": "historico-orcamentario-cau-pr",
  "storageBucket": "historico-orcamentario-cau-pr.firebasestorage.app",
  "messagingSenderId": "334076153916",
  "appId": "1:334076153916:web:d69f099641d8af9c88b339"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;   // { uid, email }
let currentRole = null;   // 'master' | 'viewer'
let authRevision = 0;
var todayISO = new Date().toISOString().slice(0,10);

// ---------- elementos ----------
const loginScreen = document.getElementById('loginScreen');
const onboardScreen = document.getElementById('onboardScreen');
const appShell = document.getElementById('appShell');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const onboardMsg = document.getElementById('onboardMsg');
const sidebarUser = document.getElementById('sidebarUser');
const logoutBtn = document.getElementById('logoutBtn');
const laboratory = createLabController({
  nav: document.getElementById('labNav'),
  root: document.getElementById('view-laboratorio'),
  getCurrentUser: () => currentUser,
  readAsset: async (id) => {
    const asset = await getDocFromServer(doc(db, 'implantaLab', id));
    if (!asset.exists()) throw new Error('Conteúdo indisponível.');
    return asset.data();
  },
  getSnapshotDates: () => availableDates.slice(),
  getSnapshot: (date) => snapshotsByDate[date],
  centerMap: () => MAPEAMENTO_CENTROS,
  getCategories: () => catState,
  getAccountAlias: (name) => nomeExibicaoConta(name)
});

// ---------- login ----------
loginBtn.addEventListener('click', function(){
  loginError.textContent = '';
  signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value)
    .catch(function(err){ loginError.textContent = 'E-mail ou senha incorretos.'; });
});
loginPassword.addEventListener('keydown', function(e){ if (e.key === 'Enter') loginBtn.click(); });

logoutBtn.addEventListener('click', function(){ signOut(auth); });

function provisionNewUser(user, isCurrent){
  onboardMsg.textContent = 'Preparando sua conta...';
  return getDoc(doc(db, 'config', 'roles')).then(function(rolesSnap){
    if (!isCurrent()) return null;
    var masterEmail = rolesSnap.exists() ? rolesSnap.data().masterEmail : null;
    var role = (masterEmail && user.email === masterEmail) ? 'master' : 'viewer';
    return setDoc(doc(db, 'users', user.uid), {
      email: user.email, role: role, displayName: user.email.split('@')[0]
    }).then(function(){ return isCurrent() ? role : null; });
  });
}

// ---------- observador de autenticação ----------
onAuthStateChanged(auth, function(user){
  const revision = ++authRevision;
  currentUser = user || null;
  currentRole = null;
  laboratory.sync();
  appShell.style.display = 'none';
  onboardScreen.style.display = 'none';
  loginScreen.style.display = user ? 'none' : 'flex';
  const isCurrent = () => revision === authRevision && currentUser?.uid === user?.uid;
  if (!user){
    return;
  }
  getDoc(doc(db, 'users', user.uid)).then(function(snap){
    if (!isCurrent()) return;
    if (snap.exists()){
      currentRole = snap.data().role;
      enterApp();
    } else {
      loginScreen.style.display = 'none';
      onboardScreen.style.display = 'flex';
      provisionNewUser(user, isCurrent).then(function(role){
        if (!isCurrent() || !role) return;
        currentRole = role;
        enterApp();
      }).catch(function(err){
        if (!isCurrent()) return;
        onboardMsg.textContent = 'Não foi possível preparar sua conta. Peça para o master verificar o acesso. (' + err.message + ')';
      });
    }
  }).catch(function(){
    if (!isCurrent()) return;
    loginScreen.style.display = 'flex';
    loginError.textContent = 'Não foi possível verificar seu perfil. Tente entrar novamente.';
  });
});

function enterApp(){
  laboratory.sync();
  loginScreen.style.display = 'none';
  onboardScreen.style.display = 'none';
  appShell.style.display = 'flex';
  sidebarUser.textContent = currentUser.email + ' · ' + (currentRole === 'master' ? 'master' : 'visualizador(a)');
  document.querySelectorAll('.master-only').forEach(function(el){
    el.style.display = (currentRole === 'master' && !el.classList.contains('view')) ? '' : 'none';
  });
  document.querySelectorAll('.view').forEach(function(el){ el.style.display = el.id === 'view-inicio' ? 'block' : 'none'; });
  document.querySelectorAll('.nav-item[data-view]').forEach(function(el){ el.classList.toggle('active', el.dataset.view === 'inicio'); });
  document.getElementById('budgetControls').hidden = false;
  const revision = authRevision;
  initDataAndViews(() => revision === authRevision && !!currentUser);
}

// ---------- navegação da barra lateral ----------
document.querySelectorAll('.nav-item[data-view]').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.nav-item').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(function(v){ v.style.display = 'none'; });
    document.getElementById('view-' + btn.dataset.view).style.display = 'block';
    document.getElementById('budgetControls').hidden = !['inicio','estudos'].includes(btn.dataset.view);
    if(btn.dataset.view==='estudos') renderStudies();
    if(btn.dataset.view==='laboratorio') laboratory.open();
  });
});

// ---------- utilitários ----------
function stripAccents(s){ return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function fmt(n){
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  var amount = Math.abs(n).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  return 'R$ ' + (n < 0 && amount !== '0,00' ? '-' : '') + amount;
}
function fmtSigned(n){
  var amount = fmt(n);
  return n > 0 && amount !== '—' && amount !== 'R$ 0,00' ? amount.replace('R$ ', 'R$ +') : amount;
}
function fmtDate(iso){ var p = iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }

// ---------- Firestore: snapshots (retrato por data, com detalhe por conta contábil) ----------
// Coleção 'snapshotsDetalhe': cada retrato guarda, por centro de custo, o
// subtotal e a lista de contas contábeis. É a única fonte de dados do
// sistema — alimentada pelo upload do relatório bruto do SISCONT.
function listSnapshotDates(){
  return getDocs(collection(db, 'snapshotsDetalhe')).then(function(qs){
    var dates = []; qs.forEach(function(d){ dates.push(d.id); }); return dates.sort();
  });
}
function loadSnapshot(date){
  return getDoc(doc(db, 'snapshotsDetalhe', date)).then(function(d){ return d.exists() ? d.data() : null; });
}
function saveSnapshot(date, centros, totalGeral, origem){
  return setDoc(doc(db, 'snapshotsDetalhe', date), { date: date, centros: centros, totalGeral: totalGeral, savedAt: new Date().toISOString(), ownerId: currentUser.uid, origem: origem || { formato: 'excel', coluna: 'na_data', parserVersion: 4 } });
}
function deleteSnapshot(date){
  return deleteDoc(doc(db, 'snapshotsDetalhe', date));
}

// Converte o retrato (centros -> subtotal por Orç.Desbloq/Empenhado/Liquidado/Pago)
// na lógica de cálculo de sempre: o Orçado é uma referência FIXA que não se
// altera conforme o dinheiro é empenhado/liquidado/pago — só os saldos mudam.
// Reconstrução validada: Orçado = Orç.Desbloq (atual) + Empenhado (atual),
// pois o relatório bruto do SISCONT só informa o que "sobra" a cada etapa
// (Orç.Desbloq. já É o Saldo do Orçamento), não o total original.
function rowsFromSnapshot(snap){
  if (!snap || !snap.centros) return [];
  return Object.keys(snap.centros).map(function(centro){
    var s = snap.centros[centro].subtotal;
    var orcado = s.Orc_Desbloq + s.Empenhado;
    return {
      centro: centro,
      orcado: orcado,
      empenho: s.Empenhado,
      liquidacao: s.Liquidado,
      pagamento: s.Pago,
      saldoOrc: s.Orc_Desbloq,
      saldoLiq: s.Empenhado - s.Liquidado,
      saldoPagar: s.Liquidado - s.Pago
    };
  });
}

// ---------- Firestore: apelidos de conta contábil ----------
function loadApelidosDoc(){
  return getDoc(doc(db, 'config', 'apelidosContas')).then(function(d){ return d.exists() ? d.data() : { map:{} }; });
}
function saveApelidosDoc(data){ return setDoc(doc(db, 'config', 'apelidosContas'), data); }
var apelidosState = { map:{} };
function nomeExibicaoConta(conta){
  return (apelidosState.map && apelidosState.map[conta]) ? apelidosState.map[conta] : conta;
}

// ---------- Firestore: categorias ----------
var DEFAULT_CATS = ['Comissões','Fiscalização','Atendimento','Fundo de Apoio','Projetos','Administrativo/Outros'];
function loadCategoriasDoc(){
  return getDoc(doc(db, 'config', 'categorias')).then(function(d){
    return d.exists() ? d.data() : { map: {}, list: DEFAULT_CATS.slice(), colors: {} };
  });
}
function saveCategoriasDoc(data){ return setDoc(doc(db, 'config', 'categorias'), data); }

function suggestCategory(nome){
  if (/^0[2-9]\s*-/.test(nome)) return 'Comissões';
  var n = stripAccents(nome);
  if (n.indexOf('fiscalizacao') !== -1) return 'Fiscalização';
  if (n.indexOf('atendimento') !== -1) return 'Atendimento';
  if (n.indexOf('fundo de apoio') !== -1) return 'Fundo de Apoio';
  if (n.indexOf('projeto') !== -1) return 'Projetos';
  if (n.indexOf('comissao') !== -1 || n.indexOf('camara') !== -1 || n.indexOf('conselho diretor') !== -1) return 'Comissões';
  return 'Administrativo/Outros';
}

// ---------- estado em memória (cache local pós-login) ----------
var catState = { map: {}, list: DEFAULT_CATS.slice(), colors: {} };
var lastCurrentSnap = null;
var selectedCategories = null; // null = todas selecionadas

// Detecta chaves de categoria salvas com o nome cru do SISCONT (de uploads
// feitos antes do mapeamento existir) e migra pro nome padronizado,
// eliminando duplicatas na tela de Categorias. Roda automaticamente, sem
// precisar de botão — e é seguro rodar toda vez (não faz nada se já estiver tudo limpo).
function migrarNomenclaturaAntiga(){
  var changed = false;
  Object.keys(catState.map).forEach(function(key){
    var resolvido = resolverNomeCentro(key).nome;
    if (resolvido !== key){
      if (catState.map[resolvido]){
        delete catState.map[key];
      } else {
        catState.map[resolvido] = catState.map[key];
        delete catState.map[key];
      }
      changed = true;
    }
  });
  return changed;
}

function initDataAndViews(isCurrent){
  const revision = authRevision;
  if (typeof isCurrent !== 'function') isCurrent = () => revision === authRevision && !!currentUser;
  Promise.all([loadCategoriasDoc(), listSnapshotDates(), loadApelidosDoc()]).then(function(res){
    if (!isCurrent()) return;
    catState = res[0];
    if (!catState.colors) catState.colors = {};
    var dates = res[1];
    apelidosState = res[2];
    if (!apelidosState.map) apelidosState.map = {};
    var changed = currentRole === 'master' ? migrarNomenclaturaAntiga() : false;
    return Promise.all(dates.map(loadSnapshot)).then(function(snaps){
      if (!isCurrent()) return;
      snaps.forEach(function(snap){
        rowsFromSnapshot(snap).forEach(function(r){
          if (!catState.map[r.centro]){ catState.map[r.centro] = suggestCategory(r.centro); changed = true; }
        });
      });
      var save = changed && currentRole === 'master' ? saveCategoriasDoc(catState) : Promise.resolve();
      return save.then(function(){
        if (!isCurrent()) return;
        selectedCategories = categoryNames();
        renderCatMultiList();
        updateCatMultiBtnLabel();
        renderCatColorList();
        renderCatTable();
        renderSnapshotChips(dates);
        setupDateSlider(dates, snaps);
        lastCurrentSnap = dates.length ? snapshotsByDate[dates[dates.length-1]] : null;
        renderCurrent(lastCurrentSnap);
        renderCategorySummary(lastCurrentSnap);
        laboratory.refresh();
      });
    });
  });
  document.getElementById('contaInfo').textContent = 'Logado como ' + currentUser.email + ' (' + (currentRole==='master'?'master':'visualizador(a)') + ').';
}

// escapa texto digitado pelo usuário antes de colocar em HTML
function escHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function safeHexColor(value, fallback){
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

// ---------- filtros ----------
var filterBusca = document.getElementById('filterBusca');
var catMultiList = document.getElementById('catMultiList');
var balanceOrder = document.getElementById('balanceOrder');
var balanceScope = document.getElementById('balanceScope');
function categoryNames(){return Array.from(new Set(catState.list.concat(Object.values(catState.map)))).sort(function(a,b){return a.localeCompare(b,'pt-BR');});}
document.getElementById('filterClear').addEventListener('click',function(){selectedCategories=categoryNames();filterBusca.value='';balanceOrder.value='desc';balanceScope.value='all';renderCatMultiList();refreshFilteredViews();});
filterBusca.addEventListener('input',refreshFilteredViews);
balanceOrder.addEventListener('change',refreshFilteredViews);balanceScope.addEventListener('change',refreshFilteredViews);
document.getElementById('catMultiAll').addEventListener('click',function(){selectedCategories=categoryNames();renderCatMultiList();refreshFilteredViews();});
document.getElementById('catMultiNone').addEventListener('click',function(){selectedCategories=[];renderCatMultiList();refreshFilteredViews();});
function renderCatMultiList(){
  var names=categoryNames();if(selectedCategories===null)selectedCategories=names.slice();catMultiList.replaceChildren();
  names.forEach(function(c){var btn=document.createElement('button');btn.type='button';btn.className='category-toggle';var active=selectedCategories.includes(c);btn.setAttribute('aria-pressed',String(active));
    var indicator=document.createElement('span');indicator.className='category-indicator';indicator.style.backgroundColor=safeHexColor(catState.colors && catState.colors[c], '#7c9873');
    var label=document.createElement('span');label.textContent=c;var state=document.createElement('span');state.className='toggle-state';state.textContent=active?'Ligada':'Desligada';btn.append(indicator,label,state);
    btn.addEventListener('click',function(){if(selectedCategories.includes(c))selectedCategories=selectedCategories.filter(function(x){return x!==c;});else selectedCategories.push(c);renderCatMultiList();refreshFilteredViews();});catMultiList.append(btn);
  });updateCatMultiBtnLabel();
}
function updateCatMultiBtnLabel(){document.getElementById('categorySelectionStatus').textContent=(selectedCategories || categoryNames()).length+' de '+categoryNames().length+' categorias ligadas';}
function passesBalance(r){return balanceScope.value==='all'||(balanceScope.value==='positive'&&r.saldoOrc>0.005)||(balanceScope.value==='negative'&&r.saldoOrc< -0.005)||(balanceScope.value==='zero'&&Math.abs(r.saldoOrc)<=0.005);}
function compareBudgetRows(a,b){return (balanceOrder.value==='name'?0:(balanceOrder.value==='asc'?a.saldoOrc-b.saldoOrc:b.saldoOrc-a.saldoOrc)) || a.centro.localeCompare(b.centro,'pt-BR');}
function visibleRows(snap){return rowsFromSnapshot(snap).filter(function(r){return passesFilter(r.centro)&&passesBalance(r);}).sort(compareBudgetRows);}

function passesFilter(centro){
  if (selectedCategories !== null){
    var cat = catState.map[centro] || 'Sem categoria';
    if (selectedCategories.indexOf(cat) === -1) return false;
  }
  var busca = stripAccents(filterBusca.value.trim());
  if (busca && stripAccents(centro).indexOf(busca) === -1) return false;
  return true;
}
function refreshFilteredViews(){
  if (lastCurrentSnap){ renderCurrent(lastCurrentSnap); renderCategorySummary(lastCurrentSnap); renderStudies(); }
}

// ---------- categorias (tabela + cores) ----------
var catTableBody = document.querySelector('#catTable tbody');
var catColorList = document.getElementById('catColorList');
document.getElementById('newCatBtn').addEventListener('click', function(){
  var name = (document.getElementById('newCatInput').value || '').trim();
  if (!name || currentRole !== 'master') return;
  if (catState.list.indexOf(name) === -1){
    catState.list.push(name);
    saveCategoriasDoc(catState).then(function(){
      selectedCategories = categoryNames();
      renderCatMultiList(); updateCatMultiBtnLabel(); renderCatColorList(); renderCatTable();
    });
  }
  document.getElementById('newCatInput').value = '';
});

function renderCatColorList(){
  if (!catColorList) return;
  if (!catState.colors) catState.colors = {};
  catColorList.innerHTML = '';
  catState.list.forEach(function(c){
    var row = document.createElement('div');
    row.className = 'cat-color-row';
    var input = document.createElement('input');
    input.type = 'color';
    input.value = safeHexColor(catState.colors[c], '#F5F1E7');
    input.addEventListener('change', function(){
      catState.colors[c] = input.value;
      saveCategoriasDoc(catState).then(function(){ renderCatMultiList(); refreshFilteredViews(); });
    });
    var name = document.createElement('span');
    name.className = 'cat-color-name';
    name.textContent = c;
    row.appendChild(input); row.appendChild(name);
    catColorList.appendChild(row);
  });
}

function renderCatTable(){
  var centros = Object.keys(catState.map).sort(function(a,b){return a.localeCompare(b);});
  catTableBody.innerHTML = '';
  if (!centros.length){ catTableBody.innerHTML = '<tr><td colspan="2" class="muted">Nenhum retrato salvo ainda.</td></tr>'; return; }
  centros.forEach(function(centro){
    var tr = document.createElement('tr');
    var tdCentro = document.createElement('td'); tdCentro.textContent = centro;
    var tdSel = document.createElement('td');
    if (currentRole === 'master'){
      var sel = document.createElement('select');
      catState.list.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; if (c===catState.map[centro]) o.selected=true; sel.appendChild(o); });
      sel.addEventListener('change', function(){
        catState.map[centro] = sel.value;
        saveCategoriasDoc(catState).then(refreshFilteredViews);
      });
      tdSel.appendChild(sel);
    } else {
      tdSel.textContent = catState.map[centro] || '—';
    }
    tr.appendChild(tdCentro); tr.appendChild(tdSel);
    catTableBody.appendChild(tr);
  });
}

// ---------- situação atual ----------
var currentCard = document.getElementById('currentCard');
function renderCurrent(snap){
  var todasRows = rowsFromSnapshot(snap);
  if (!todasRows.length){ currentCard.innerHTML = '<p class="muted">Nenhum retrato salvo ainda.</p>'; return; }
  var rows = visibleRows(snap);
  var tot = {orcado:0,empenho:0,liquidacao:0,pagamento:0,saldoOrc:0,saldoLiq:0,saldoPagar:0};
  rows.forEach(function(r){ tot.orcado+=r.orcado; tot.empenho+=r.empenho; tot.liquidacao+=r.liquidacao; tot.pagamento+=r.pagamento; tot.saldoOrc+=r.saldoOrc; tot.saldoLiq+=r.saldoLiq; tot.saldoPagar+=r.saldoPagar; });
  var pct = tot.orcado ? (tot.pagamento/tot.orcado*100) : 0;
  var html = '<p class="muted" style="margin:0 0 12px;">Referente a ' + fmtDate(snap.date) + ' · ' + rows.length + ' de ' + todasRows.length + ' centros exibidos</p>';
  if (!snap.origem || snap.origem.coluna !== 'na_data' || snap.origem.parserVersion < 3) html += '<p class="import-warning">Este retrato foi salvo com uma versão anterior. Reimporte o relatório para aplicar a leitura exclusiva de Na Data.</p>';
  if (snap.origem) html += '<p class="source-note">Fonte: '+escHtml(snap.origem.formato || 'Excel')+' · coluna Na Data · '+escHtml(snap.origem.arquivo || 'relatório SISCONT')+'</p>';
  html += '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:12px; margin-bottom:18px;">';
  html += '<div class="metric"><div class="label">Orçado total</div><div class="value">'+fmt(tot.orcado)+'</div></div>';
  html += '<div class="metric"><div class="label">Pago até aqui</div><div class="value">'+fmt(tot.pagamento)+'</div></div>';
  html += '<div class="metric blue"><div class="label">Saldo de orçamento</div><div class="value">'+fmt(tot.saldoOrc)+'</div></div>';
  html += '<div class="metric orange"><div class="label">% executado</div><div class="value">'+pct.toFixed(2)+'%</div></div></div>';
  if (!rows.length){ html += '<p class="muted">Nenhum centro de custo corresponde ao filtro atual.</p>'; currentCard.innerHTML = html; return; }

  // ----- visão geral consolidada da seleção atual (mesmas somas e fórmulas dos cartões) -----
  var todasSelecionadas = (selectedCategories === null || selectedCategories.length === categoryNames().length);
  var buscaAtiva = filterBusca.value.trim();
  var rotuloSelecao = todasSelecionadas ? 'Todas as categorias' : selectedCategories.map(escHtml).join(' + ');
  if (buscaAtiva) rotuloSelecao += ' · busca: "' + escHtml(buscaAtiva) + '"';
  var gPctEmp = tot.orcado ? (tot.empenho / tot.orcado * 100) : 0;
  var gPctLiq = tot.orcado ? (tot.liquidacao / tot.orcado * 100) : 0;
  var gPctPag = tot.orcado ? (tot.pagamento / tot.orcado * 100) : 0;
  html += '<div class="cc-geral">';
  html += '<div class="cc-name">Visão geral</div>';
  html += '<div class="cc-cat">'+rotuloSelecao+' · '+rows.length+' centro(s) de custo</div>';
  html += '<div class="cc-orcado">Orçado: <strong>'+fmt(tot.orcado)+'</strong></div>';
  html += '<div class="geral-bars">';
  html += '<div><div class="pbar-row"><span>Empenhado</span><span>'+fmt(tot.empenho)+' · '+gPctEmp.toFixed(1)+'%</span></div><div class="pbar"><div class="pbar-fill empenho" style="width:'+Math.min(gPctEmp,100)+'%;"></div></div></div>';
  html += '<div><div class="pbar-row"><span>Liquidado</span><span>'+fmt(tot.liquidacao)+' · '+gPctLiq.toFixed(1)+'%</span></div><div class="pbar"><div class="pbar-fill liquidado" style="width:'+Math.min(gPctLiq,100)+'%;"></div></div></div>';
  html += '<div><div class="pbar-row"><span>Pago</span><span>'+fmt(tot.pagamento)+' · '+gPctPag.toFixed(1)+'%</span></div><div class="pbar"><div class="pbar-fill pago" style="width:'+Math.min(gPctPag,100)+'%;"></div></div></div>';
  html += '</div>';
  html += '<div class="cc-saldos">';
  html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo do orçamento</div><div class="cc-saldo-value">'+fmt(tot.saldoOrc)+'</div></div>';
  html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo a liquidar</div><div class="cc-saldo-value">'+fmt(tot.saldoLiq)+'</div></div>';
  html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo a pagar</div><div class="cc-saldo-value">'+fmt(tot.saldoPagar)+'</div></div>';
  html += '</div></div>';

  html += '<div class="cc-grid">';
  rows.forEach(function(r){
    var pctEmp = r.orcado ? (r.empenho / r.orcado * 100) : 0;
    var pctLiq = r.orcado ? (r.liquidacao / r.orcado * 100) : 0;
    var pctPag = r.orcado ? (r.pagamento / r.orcado * 100) : 0;
    var cardColor = safeHexColor(catState.colors && catState.colors[catState.map[r.centro]], '');
    html += '<div class="cc-card"' + (cardColor ? ' style="background:'+cardColor+';"' : '') + '>';
    html += '<div class="cc-name">'+escHtml(r.centro)+'</div>';
    html += '<div class="cc-cat">'+escHtml(catState.map[r.centro]||'sem categoria')+'</div>';
    html += '<div class="cc-orcado">Orçado: <strong>'+fmt(r.orcado)+'</strong></div>';
    html += '<div class="pbar-row"><span>Empenhado</span><span>'+fmt(r.empenho)+' · '+pctEmp.toFixed(1)+'%</span></div>';
    html += '<div class="pbar"><div class="pbar-fill empenho'+(pctEmp>100?' over':'')+'" style="width:'+Math.min(pctEmp,100)+'%;"></div></div>';
    html += '<div class="pbar-row"><span>Liquidado</span><span>'+fmt(r.liquidacao)+' · '+pctLiq.toFixed(1)+'%</span></div>';
    html += '<div class="pbar"><div class="pbar-fill liquidado'+(pctLiq>100?' over':'')+'" style="width:'+Math.min(pctLiq,100)+'%;"></div></div>';
    html += '<div class="pbar-row"><span>Pago</span><span>'+fmt(r.pagamento)+' · '+pctPag.toFixed(1)+'%</span></div>';
    html += '<div class="pbar"><div class="pbar-fill pago'+(pctPag>100?' over':'')+'" style="width:'+Math.min(pctPag,100)+'%;"></div></div>';
    html += '<div class="cc-saldos">';
    html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo do orçamento</div><div class="cc-saldo-value">'+fmt(r.saldoOrc)+'</div></div>';
    html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo a liquidar</div><div class="cc-saldo-value">'+fmt(r.saldoLiq)+'</div></div>';
    html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo a pagar</div><div class="cc-saldo-value">'+fmt(r.saldoPagar)+'</div></div>';
    html += '</div></div>';
  });
  html += '</div>';
  currentCard.innerHTML = html;

  var cardEls = currentCard.querySelectorAll('.cc-card');
  cardEls.forEach(function(el, idx){
    el.classList.add('clickable');
    el.title = 'Ver contas contábeis deste centro de custo';
    el.addEventListener('click', function(){ openDetalheCentro(rows[idx].centro, snap.date); });
  });
}

// ---------- resumo por categoria ----------
var categorySummaryCard = document.getElementById('categorySummaryCard');
function renderCategorySummary(snap){
  var todasRows = rowsFromSnapshot(snap);
  if (!todasRows.length){ categorySummaryCard.innerHTML = '<p class="muted">Nenhum retrato salvo ainda.</p>'; return; }
  var busca = stripAccents(filterBusca.value.trim());
  var rows = visibleRows(snap);
  var byCat = {};
  rows.forEach(function(r){
    var cat = catState.map[r.centro] || 'Sem categoria';
    if (!byCat[cat]) byCat[cat] = {orcado:0,empenho:0,liquidacao:0,pagamento:0,saldoOrc:0,saldoLiq:0,saldoPagar:0,n:0};
    byCat[cat].orcado+=r.orcado; byCat[cat].empenho+=r.empenho; byCat[cat].liquidacao+=r.liquidacao; byCat[cat].pagamento+=r.pagamento;
    byCat[cat].saldoOrc+=r.saldoOrc; byCat[cat].saldoLiq+=r.saldoLiq; byCat[cat].saldoPagar+=r.saldoPagar; byCat[cat].n+=1;
  });
  var cats = Object.keys(byCat).sort(function(a,b){return balanceOrder.value==='name'?a.localeCompare(b,'pt-BR'):(balanceOrder.value==='asc'?byCat[a].saldoOrc-byCat[b].saldoOrc:byCat[b].saldoOrc-byCat[a].saldoOrc)||a.localeCompare(b,'pt-BR');});
  var html = '<div style="overflow-x:auto;"><table><thead><tr><th>Categoria</th><th>Centros</th><th>Orçado</th><th>Empenhado</th><th>Liquidado</th><th>Pago</th><th>Saldo orçamento</th><th>Saldo a liquidar</th><th>Saldo a pagar</th><th>% executado</th></tr></thead><tbody>';
  cats.forEach(function(cat){
    var c = byCat[cat]; var pct = c.orcado ? (c.pagamento/c.orcado*100) : 0;
    html += '<tr><td>'+escHtml(cat)+'</td><td>'+c.n+'</td><td>'+fmt(c.orcado)+'</td><td>'+fmt(c.empenho)+'</td><td>'+fmt(c.liquidacao)+'</td><td>'+fmt(c.pagamento)+'</td><td>'+fmt(c.saldoOrc)+'</td><td>'+fmt(c.saldoLiq)+'</td><td>'+fmt(c.saldoPagar)+'</td><td>'+pct.toFixed(2)+'%</td></tr>';
  });
  html += '</tbody></table></div>';
  categorySummaryCard.innerHTML = html;
}

// ---------- retratos (upload) — só master ----------
var fileInput = document.getElementById('fileInput');
var saveBtn = document.getElementById('saveBtn');
var parseStatus = document.getElementById('parseStatus');
var chipsWrap = document.getElementById('chipsWrap');

function extractDateFromFilename(name){
  var matches = name.match(/\d{8}/g);
  if (!matches || !matches.length) return null;
  var last = matches[matches.length - 1];
  var dd = parseInt(last.slice(0,2), 10), mm = parseInt(last.slice(2,4), 10), yyyy = parseInt(last.slice(4,8), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 2000 || yyyy > 2100) return null;
  return yyyy + '-' + String(mm).padStart(2,'0') + '-' + String(dd).padStart(2,'0');
}

// ---------- parser único do relatório bruto do SISCONT (Conta x Centro de Custo) ----------
// Formato em blocos de 4 linhas por combinação Conta+Centro, com colunas
// Conta | Centro Custos | Despesa | Na Data | No Exercício | Saldo | Na Data | No Exercício.
// Todas as métricas usam exclusivamente Na Data. No Exercício não representa
// necessariamente a posição histórica selecionada. Retratos antigos devem ser reimportados.
var METRICAS_DETALHE = ['Orc_Desbloq','Empenhado','Liquidado','Pago'];
var LINHA_BLOCO_DETALHE = [
  { metrica:'Orc_Desbloq', lado:'saldo',   coluna:'na_data' },
  { metrica:'Empenhado',   lado:'despesa', coluna:'na_data' },
  { metrica:'Liquidado',   lado:'despesa', coluna:'na_data' },
  { metrica:'Pago',        lado:'despesa', coluna:'na_data' }
];

function isRelatorioBrutoSiscont(data){
  for (var i=0;i<Math.min(data.length,4);i++){
    var row = data[i] || [];
    var texto = stripAccents(row.map(function(x){ return (x===null||x===undefined)?'':String(x); }).join('|'));
    if (texto.indexOf('centro custos')!==-1 && texto.indexOf('despesa')!==-1 && texto.indexOf('saldo')!==-1) return true;
  }
  return false;
}

// ---------- mapeamento de centro de custo: código bruto do SISCONT -> nome padronizado ----------
// Preserva a numeração sequencial e a nomenclatura da metodologia anterior
// (ex.: "1.01.01" do SISCONT -> "02 - ATIVIDADES CEF"), pra bater com as
// categorias já cadastradas e manter a ordem de exibição de sempre.
// Válido para o ano de 2027; a reparametrização anual é responsabilidade do master.
var MAPEAMENTO_CENTROS = {
  '1.07': { seq: 1, nomeFinal: 'REALIZAÇÃO DAS PLENÁRIAS CAU/PR' },
  '1.01.01': { seq: 2, nomeFinal: 'ATIVIDADES CEF' },
  '1.02.01': { seq: 3, nomeFinal: 'ATIVIDADES - CED' },
  '1.03.01': { seq: 4, nomeFinal: 'ATIVIDADES CEP' },
  '1.05.01': { seq: 5, nomeFinal: 'ATIVIDADES COA' },
  '1.04.01': { seq: 6, nomeFinal: 'ATIVIDADES CPF' },
  '3.01': { seq: 7, nomeFinal: 'COLEGIADOS DAS ENTIDADES ESTADUAIS DE ARQUITETOS E URBANISTAS (CEAU-CAU/PR)' },
  '2.02': { seq: 8, nomeFinal: 'COMISSÃO DE POLÍTICAS URBANAS E AMBIENTAL DO CAU/PR (CPUA/PR)' },
  '3.02': { seq: 9, nomeFinal: 'CONSELHO DIRETOR CAU/PR' },
  '4.01.05.01': { seq: 10, nomeFinal: 'ATIVIDADES DA PRESIDÊNCIA' },
  '4.02.07.01': { seq: 11, nomeFinal: 'ATIVIDADES GERÊNCIA GERAL' },
  '4.02.05.1.01': { seq: 12, nomeFinal: 'ATIVIDADES GERÊNCIA DE FISCALIZAÇÃO (SEDE)' },
  '4.02.05.1.02': { seq: 14, nomeFinal: 'ATIVIDADES GERÊNCIA DE FISCALIZAÇÃO - CASCAVEL' },
  '4.02.05.1.03': { seq: 15, nomeFinal: 'ATIVIDADES GERÊNCIA DE FISCALIZAÇÃO - LONDRINA' },
  '4.02.05.1.04': { seq: 16, nomeFinal: 'ATIVIDADES GERÊNCIA DE FISCALIZAÇÃO - MARINGÁ' },
  '4.02.05.1.05': { seq: 17, nomeFinal: 'ATIVIDADES GERÊNCIA DE FISCALIZAÇÃO - PATO BRANCO' },
  '4.02.05.1.07': { seq: 18, nomeFinal: 'ATIVIDADES GERÊNCIA DE FISCALIZAÇÃO - CSC DA FISCALIZAÇÃO' },
  '4.02.06.1.01': { seq: 19, nomeFinal: 'ATIVIDADES GERÊNCIA DE ATENDIMENTO (SEDE)' },
  '4.02.06.1.03': { seq: 22, nomeFinal: 'ATIVIDADES GERÊNCIA DE ATENDIMENTO - LONDRINA' },
  '4.02.06.1.07': { seq: 25, nomeFinal: 'ATIVIDADES GERÊNCIA DE ATENDIMENTO - CSC DO ATENDIMENTO' },
  '4.02.03.01.01': { seq: 26, nomeFinal: 'ATIVIDADES GERÊNCIA ADMINISTRATIVA (SEDE)' },
  '4.02.03.01.02': { seq: 28, nomeFinal: 'ATIVIDADES GERÊNCIA ADMINISTRATIVA - CASCAVEL' },
  '4.02.03.01.03': { seq: 29, nomeFinal: 'ATIVIDADES GERÊNCIA ADMINISTRATIVA - LONDRINA' },
  '4.02.03.01.04': { seq: 30, nomeFinal: 'ATIVIDADES GERÊNCIA ADMINISTRATIVA - MARINGÁ' },
  '4.02.03.01.05': { seq: 31, nomeFinal: 'ATIVIDADES GERÊNCIA ADMINISTRATIVA - PATO BRANCO' },
  '4.02.03.01.07': { seq: 32, nomeFinal: 'ATIVIDADES GERÊNCIA ADMINISTRATIVA - CAPACITAÇÃO E TREINAMENTOS' },
  '4.01.04.01.01': { seq: 33, nomeFinal: 'ATIVIDADES ASSESSORIA DE COMUNICAÇÃO' },
  '4.02.04.01.01': { seq: 34, nomeFinal: 'ATIVIDADES GERÊNCIA FINANCEIRA' },
  '4.02.04.01.02': { seq: 35, nomeFinal: 'FUNDO DE APOIO - CAU BÁSICO' },
  '4.01.02.01': { seq: 36, nomeFinal: 'ASSESSORIA JURÍDICA' },
  '4.02.04.01.03': { seq: 37, nomeFinal: 'RESERVA DE CONTINGÊNCIA' },
  '4.01.05.02.18': { seq: 38, nomeFinal: 'ASSISTÊNCIA TÉCNICA EM HABITAÇÃO DE INTERESSE SOCIAL (ATHIS)' },
  '4.02.03.02.02': { seq: 40, nomeFinal: 'PROJETOS GERÊNCIA ADMINISTRATIVA - PDTI - PLANO DIRETOR DE TECNOLOGIA DA INFORMAÇÃO' },
  '4.02.03.02.05': { seq: 41, nomeFinal: 'PROJETOS GERÊNCIA ADMINISTRATIVA - REFORMA DA SEDE PRÓPRIA' },
  '4.01.04.02.03': { seq: 43, nomeFinal: 'PROJETOS ASSESSORIA DE COMUNICAÇÃO - DIA DO ARQUITETO E URBANISTA' },
  '4.01.05.02.11': { seq: 46, nomeFinal: 'PROJETO ESPECÍFICO/ESTRATÉGICO- CAU EDUCA - CADERNO DE ATIVIDADES DA TURMA DA MÔNICA' },
  '4.01.04.02.14': { seq: 47, nomeFinal: 'PROJETO FESTIVAL DA ARQUITETURA' },
  '4.02.03.02.07': { seq: 48, nomeFinal: 'PROJETO AQUISIÇÃO DE IMÓVEIS NAS REGIONAIS DO CAU/PR' },
  '4.01.05.02.12': { seq: 49, nomeFinal: 'PROJETO CÂMARAS TÉCNICAS' },
  '4.01.04.02.01': { seq: 50, nomeFinal: 'PROJETOS ASSESSORIA DE COMUNICAÇÃO - PATROCINIOS' },
  '4.02.07.02.03': { seq: 51, nomeFinal: 'PROJETO ESTRATÉGICO TEIA DE SOLUÇÕES EM ARQUITETURA E URBANISMO P/ DESENVOLV. SUSTENTÁVEL DO PR' },
  '4.01.05.02.14': { seq: 53, nomeFinal: 'PROJETO ESTRATÉGICO AÇÕES PRIORITÁRIAS DO CEAU - PR (PRODUZIR VIDEOCATS)' },
  '4.02.07.02.02': { seq: 55, nomeFinal: 'PROJETO COMISSÃO TEMPORÁRIA DE REVISÃO DO MÉTODOS DE COMUNICAÇÃO' },
  '2.13': { seq: 56, nomeFinal: 'PROJETO CPUA - COMISSÃO TEMPORÁRIA PARA PROMOÇÃO DOS CONCURSOS PÚBLICOS' },
  '2.17': { seq: 57, nomeFinal: 'COMISSÃO TEMPORÁRIA DE ANÁLISE DE PROCESSO ÉTICO' },
  '2.18': { seq: 58, nomeFinal: 'COMISSÕES TEMPORÁRIAS DE PROCESSOS DE SINDICÂNCIAS NO ÂMBITO DO CAU/PR' },
  '4.02.07.02.01': { seq: 59, nomeFinal: 'PROJETO ESPECÍFICO/ESTRATÉGICO - LGPD - LEI DE PROTEÇÃO DE DADOS PESSOAIS' },
  '2.20': { seq: 60, nomeFinal: 'COMISSÃO ESPECIAL DE POLÍTICAS AFIRMATIVAS' },
  '2.19': { seq: 61, nomeFinal: 'COMISSÃO ESPECIAL DE ASSISTÊNCIA TÉCNICA DE HABITAÇÃO DE INTERESSE SOCIAL (CATHIS)' },
  '1.08': { seq: 62, nomeFinal: 'COMISSÃO PERMANENTE DE ÉTICA E INTEGRIDADE' },
  '2.04': { seq: 63, nomeFinal: 'COMISSÃO ELEITORAL TEMPORÁRIA' },
  '4.01.05.02.15': { seq: 64, nomeFinal: 'CÂMARA TEMÁTICA DE PATRIMÔNIO' },
  '1.09.02.01': { seq: 65, nomeFinal: 'CÂMARA TEMÁTICA DE EMERGÊNCIAS CLIMÁTICAS E CIDADES RESILIENTES' },
  '4.01.05.02.16': { seq: 66, nomeFinal: 'CÂMARA TEMÁTICA DE EMPREENDEDORISMO E INOVAÇÃO' },
  '4.02.05.2.11': { seq: 67, nomeFinal: 'PROJETO ESTRATÉGICO - DESENVOLVER PLATAFORMA DE INTEGRAÇÃO E INTELIGÊNCIA DE DADOS DA FISCALIZAÇÃO' },
  '4.02.05.2.12': { seq: 68, nomeFinal: 'PROJETO ESTRATÉGICO - IMPLANTAÇÃO DO PROGRAMA CAU/JR NO ÂMBITO DO CAU/PR' },
  '4.01.05.02.17': { seq: 69, nomeFinal: 'PROJETO ESTRATÉGICO - IMPLANTAÇÃO DO PROGRAMA DE VOTAÇÃO NO ÂMBITO DO CAU/PR' },
  '4.02.03.02.08': { seq: 70, nomeFinal: 'PROJETOS GERÊNCIA ADMINISTRATIVA - SISTEMA DE POWER BI (BUSINESS INTELIGENCE)' },
  '4.02.03.02.09': { seq: 71, nomeFinal: 'PROJETOS GERÊNCIA ADMINISTRATIVA - SISTEMA DE CHAT BOT' },
  '4.02.06.2.05': { seq: 72, nomeFinal: 'PROJETO ESTRATÉGICO - DIAGNÓSTICO E IMPLEMENTAÇÃO DA GESTÃO DOCUMENTAL DO CAU/PR' },
  '1.02.02.01': { seq: 73, nomeFinal: 'PROJETO ESPECÍFICO/ESTRATÉGICO - AÇÕES PRIORITÁRIAS DA CED' },
  '1.02.02.06': { seq: 74, nomeFinal: 'PROJETO ESTRATÉGICO - REALIZAR CAMPANHA EDUCACIOAL-PREVENTIVA SOBRE TEMAS À ÉTICA E DISCIPLINA' },
  '1.09.02.02': { seq: 75, nomeFinal: 'PROJETO ESTRATÉGICO-PUBLIC.MANUAL PARA SOLUÇÕES BASEADAS NA NATUREZA EM CIDADES E COMUNIDADES DO PR' },
  '1.09.02.03': { seq: 76, nomeFinal: 'PROJETO ESTRATÉGICO-EDITAL P/ OFICINAS DE SOLUÇÕES BASEADAS NA NATUREZA EM CIDADES E COMUNIDADES' },
  '1.09.02.04': { seq: 77, nomeFinal: 'PROJETO ESTRATÉGICO-EVENTO "POLÍTICAS AFIRMATIVAS NO CAU" E LANÇAMENTO DE PESQUISA JUNTO DAS IES' }
};

function resolverNomeCentro(centroBruto){
  var codigo = centroBruto.indexOf(' - ') !== -1 ? centroBruto.split(' - ')[0].trim() : centroBruto.trim();
  var m = MAPEAMENTO_CENTROS[codigo];
  if (!m) return { nome: centroBruto, novo: true };
  var seqPadded = (m.seq < 10 ? '0' : '') + m.seq;
  return { nome: seqPadded + ' - ' + m.nomeFinal, novo: false };
}

function parseDetalhadoFromData(data){
  var centros = {};
  var totalGeral = {}; METRICAS_DETALHE.forEach(function(m){ totalGeral[m]=0; });
  var avisos = [];
  var contaAtual=null, centroAtual=null, valoresAtuais=null, posicao=0;

  function zera(){ var o={}; METRICAS_DETALHE.forEach(function(m){ o[m]=0; }); return o; }
  function textoLimpo(v){ return (v===null||v===undefined) ? '' : String(v).replace(/\s+/g,' ').trim(); }
  function fecha(){
    if (!contaAtual || !centroAtual) return;
    if (!centros[centroAtual]) centros[centroAtual] = { contas:{}, subtotal:zera() };
    if (!centros[centroAtual].contas[contaAtual]) centros[centroAtual].contas[contaAtual] = zera();
    METRICAS_DETALHE.forEach(function(m){
      centros[centroAtual].contas[contaAtual][m] += valoresAtuais[m];
      centros[centroAtual].subtotal[m] += valoresAtuais[m];
      totalGeral[m] += valoresAtuais[m];
    });
  }

  for (var i=2;i<data.length;i++){
    var row = data[i] || [];
    var conta = textoLimpo(row[0]);
    var centroBruto = textoLimpo(row[1]);
    var centro = centroBruto ? resolverNomeCentro(centroBruto).nome : '';
    var naData1 = row[3], noExercicio1 = row[4];
    var naData2 = row[6], noExercicio2 = row[7];

    if (conta && centro){
      fecha();
      contaAtual = conta; centroAtual = centro; valoresAtuais = zera(); posicao = 0;
      if (centroBruto && resolverNomeCentro(centroBruto).novo && avisos.indexOf('Centro de custo não mapeado: "'+centroBruto+'" — usando o nome bruto do SISCONT.') === -1){
        avisos.push('Centro de custo não mapeado: "'+centroBruto+'" — usando o nome bruto do SISCONT.');
      }
    }
    if (!contaAtual) continue;

    var esperado = LINHA_BLOCO_DETALHE[posicao];
    if (esperado){
      var naData = esperado.lado==='saldo' ? naData2 : naData1;
      var noExercicio = esperado.lado==='saldo' ? noExercicio2 : noExercicio1;
      // Sem fallback para No Exercício, mesmo se Na Data estiver zerado.
      var valor = naData;
      if (valor === null || valor === undefined || valor === '') throw new Error('Na Data ausente na linha '+(i+1));
      if (typeof valor === 'string') {
        valor = valor.trim().replace(/R\$\s*/g,'').replace(/\s/g,'');
        if (valor.includes(',')) valor = valor.replace(/\./g,'').replace(',','.');
      }
      var numero = Number(valor);
      if (!Number.isFinite(numero)) throw new Error('Na Data inválido na linha '+(i+1));
      valoresAtuais[esperado.metrica] = numero;
    }
    posicao++;
  }
  fecha();

  if (!Object.keys(centros).length) throw new Error('Nenhum centro de custo encontrado no arquivo.');
  return { centros: centros, totalGeral: totalGeral, avisos: avisos };
}

function parseWorkbookDetalhado(file, cb){
  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      var ws = wb.Sheets[wb.SheetNames[0]];
      var data = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
      if (!data.length) throw new Error('Planilha vazia.');
      if (!isRelatorioBrutoSiscont(data)){
        throw new Error('Esse arquivo não parece ser o relatório bruto de Disponibilidade Orçamentária do SISCONT (Conta x Centro de Custo). Confira se exportou o relatório certo.');
      }
      cb(null, parseDetalhadoFromData(data));
    } catch(err){ cb(err); }
  };
  reader.onerror = function(){ cb(new Error('Falha ao ler o arquivo.')); };
  reader.readAsArrayBuffer(file);
}

var preparedImports = [];
var importGeneration = 0;
if (fileInput) fileInput.addEventListener('change', async function(){
  var generation = ++importGeneration;
  preparedImports = []; saveBtn.disabled = true;
  var files = Array.from(fileInput.files || []), results = [], seen = new Set();
  fileInput.disabled = true;
  try {
    var existing = await listSnapshotDates();
    for (var file of files){
      try {
        var det;
        if (/\.pdf$/i.test(file.name)) det = await readPdf(file, resolverNomeCentro, function(n,total){parseStatus.textContent = 'Lendo '+file.name+' — página '+n+' de '+total;});
        else {det = await new Promise(function(resolve,reject){parseWorkbookDetalhado(file,function(err,d){err?reject(err):resolve(d);});});det.date=extractDateFromFilename(file.name);det.origem={formato:'excel',coluna:'na_data',parserVersion:4,arquivo:file.name};}
        if (!det.date) throw new Error('Data não encontrada. Use ddmmaaaa no nome da planilha.');
        if (seen.has(det.date)) throw new Error('Outra seleção já usa esta data. Selecione um arquivo por referência.');
        seen.add(det.date); preparedImports.push(det);
        var t=det.totalGeral;
        results.push('<article class="import-preview"><strong>'+escHtml(file.name)+'</strong><p>Referência: '+fmtDate(det.date)+' · '+Object.keys(det.centros).length+' centros · '+(existing.includes(det.date)?'Substituirá o retrato existente':'Novo retrato')+'</p><p>Saldo orçamentário: '+fmt(t.Orc_Desbloq)+' · Empenhado: '+fmt(t.Empenhado)+' · Liquidado: '+fmt(t.Liquidado)+' · Pago: '+fmt(t.Pago)+'</p>'+(det.origem.formato==='excel'?'<p class="import-warning">O Excel customizado já apresentou divergências em Pago — Na Data. Confira com o PDF antes de salvar.</p>':'<p>Valores extraídos exclusivamente da coluna Na Data do PDF.</p>')+(det.avisos || []).map(function(w){return '<p class="import-warning">'+escHtml(w)+'</p>';}).join('')+'</article>');
      }catch(err){results.push('<p class="import-warning">'+escHtml(file.name)+': '+escHtml(err.message)+'</p>');}
    }
    if(generation!==importGeneration)return;
    parseStatus.innerHTML=results.join('') || 'Selecione os relatórios.';
    saveBtn.textContent='Salvar '+preparedImports.length+' retrato(s) conferido(s)';saveBtn.disabled=!preparedImports.length;
  }catch(err){parseStatus.textContent='Falha ao preparar: '+err.message;}
  finally{fileInput.disabled=false;}
});
if (saveBtn) saveBtn.addEventListener('click', async function(){
  if(!preparedImports.length || currentRole!=='master')return;
  saveBtn.disabled=true;fileInput.disabled=true;
  var remaining=[], messages=[];
  for(var det of preparedImports){
    try{
      await saveSnapshot(det.date,det.centros,det.totalGeral,det.origem);
      messages.push('Salvo: '+fmtDate(det.date));
      Object.keys(det.centros).forEach(function(centro){if(!catState.map[centro])catState.map[centro]=suggestCategory(centro);});
    }catch(err){remaining.push(det);messages.push('Falha em '+fmtDate(det.date)+': '+err.message);}
  }
  try{await saveCategoriasDoc(catState);await initDataAndViews();}catch(err){messages.push('Falha ao atualizar a visualização: '+err.message);}
  preparedImports=remaining;parseStatus.textContent=messages.join(' · ');fileInput.disabled=false;saveBtn.disabled=!remaining.length;saveBtn.textContent=remaining.length?'Tentar salvar novamente':'Salvar retrato(s)';if(!remaining.length)fileInput.value='';
});

function renderSnapshotChips(dates){
  if (!chipsWrap) return;
  if (!dates.length){ chipsWrap.innerHTML = '<span class="muted">Nenhum retrato salvo ainda.</span>'; return; }
  chipsWrap.innerHTML = '';
  dates.forEach(function(d){
    var chip = document.createElement('span'); chip.className='chip'; chip.innerHTML = '<span>'+fmtDate(d)+'</span>';
    var del = document.createElement('button');
    del.innerHTML = '&times;';
    del.title = 'Excluir este retrato';
    del.addEventListener('click', function(){
      var ok = window.confirm('Excluir o retrato de ' + fmtDate(d) + '? Essa ação não pode ser desfeita.');
      if (!ok) return;
      del.disabled = true;
      deleteSnapshot(d).then(function(){
        initDataAndViews();
      }).catch(function(err){
        alert('Não foi possível excluir: ' + err.message);
        del.disabled = false;
      });
    });
    chip.appendChild(del);
    chipsWrap.appendChild(chip);
  });
}
var availableDates = [];
var snapshotsByDate = {};
var dateSlider = document.getElementById('dateSlider');
var dateSliderLabel = document.getElementById('dateSliderLabel');

var referenceMonth = document.getElementById('referenceMonth');
var referenceDate = document.getElementById('referenceDate');
var referenceHeading = document.getElementById('referenceHeading');
function selectReference(date){
  var idx=availableDates.indexOf(date);if(idx<0)return;
  dateSlider.value=idx;dateSliderLabel.textContent=fmtDate(date);
  dateSlider.setAttribute('aria-label','Data de referência');dateSlider.setAttribute('aria-valuetext',fmtDate(date));
  referenceHeading.textContent=fmtDate(date);referenceMonth.value=date.slice(0,7);
  referenceDate.replaceChildren();
  availableDates.filter(function(d){return d.slice(0,7)===date.slice(0,7);}).forEach(function(d){var o=new Option(fmtDate(d),d);referenceDate.add(o);});referenceDate.value=date;
  lastCurrentSnap=snapshotsByDate[date];renderCurrent(lastCurrentSnap);renderCategorySummary(lastCurrentSnap);syncStudyDates(date);renderStudies();
}
function setupDateSlider(dates, snaps){
  availableDates=dates;snapshotsByDate={};snaps.forEach(function(s,i){snapshotsByDate[dates[i]]=s;});
  dateSlider.min=0;dateSlider.max=Math.max(0,dates.length-1);dateSlider.disabled=!dates.length;
  referenceMonth.disabled=referenceDate.disabled=!dates.length;referenceMonth.replaceChildren();referenceDate.replaceChildren();
  Array.from(new Set(dates.map(function(d){return d.slice(0,7);}))).forEach(function(m){var label=new Date(m+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});referenceMonth.add(new Option(label,m));});
  if(dates.length)selectReference(dates[dates.length-1]);else{dateSliderLabel.textContent=referenceHeading.textContent='Sem retratos';}
}
dateSlider.addEventListener('input',function(){selectReference(availableDates[Number(dateSlider.value)]);});
referenceDate.addEventListener('change',function(){selectReference(referenceDate.value);});
referenceMonth.addEventListener('change',function(){var dates=availableDates.filter(function(d){return d.slice(0,7)===referenceMonth.value;});if(dates.length)selectReference(dates[dates.length-1]);});

// ---------- backup ----------
var exportBtn = document.getElementById('exportBtn');
if (exportBtn) exportBtn.addEventListener('click', function(){
  listSnapshotDates().then(function(dates){
    Promise.all(dates.map(loadSnapshot)).then(function(snaps){
      var backup = { exportedAt: new Date().toISOString(), snapshots: snaps, categorias: catState.map, category_list: catState.list };
      var blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json;charset=utf-8;'});
      var url = URL.createObjectURL(blob); var a = document.createElement('a');
      a.href=url; a.download='backup_historico_orcamentario_'+todayISO+'.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });
  });
});

// ---------- detalhe por conta contábil (aberto ao clicar num centro de custo) ----------
var viewDetalheCentro = document.getElementById('view-detalheCentro');
var detalheVoltarBtn = document.getElementById('detalheVoltarBtn');
var detalheCentroTitulo = document.getElementById('detalheCentroTitulo');
var detalheCentroData = document.getElementById('detalheCentroData');
var detalheCentroCard = document.getElementById('detalheCentroCard');
var viewAntesDoDetalhe = 'inicio';

function openDetalheCentro(centro, date){
  var navAtivo = document.querySelector('.nav-item.active');
  viewAntesDoDetalhe = navAtivo ? navAtivo.dataset.view : 'inicio';
  document.querySelectorAll('.view').forEach(function(v){ v.style.display = 'none'; });
  viewDetalheCentro.style.display = 'block';
  document.getElementById('budgetControls').hidden=true;
  detalheCentroTitulo.textContent = centro;
  detalheCentroData.textContent = 'Referente a ' + fmtDate(date);
  detalheCentroCard.innerHTML = '<p class="muted">Carregando...</p>';
  loadSnapshot(date).then(function(det){
    if (!det || !det.centros || !det.centros[centro]){
      detalheCentroCard.innerHTML = '<p class="muted">Sem detalhamento por conta contábil para essa data. Suba o relatório bruto do SISCONT na tela "Retratos (upload)".</p>';
      return;
    }
    renderDetalheCentro(det.centros[centro]);
  }).catch(function(err){
    detalheCentroCard.innerHTML = '<p class="muted">Erro ao carregar: ' + escHtml(err.message) + '</p>';
  });
}

if (detalheVoltarBtn) detalheVoltarBtn.addEventListener('click', function(){
  viewDetalheCentro.style.display = 'none';
  document.getElementById('view-' + viewAntesDoDetalhe).style.display = 'block';
  document.getElementById('budgetControls').hidden=!['inicio','estudos'].includes(viewAntesDoDetalhe);
});

function renderDetalheCentro(bloco){
  var contas = Object.keys(bloco.contas).sort(function(a,b){ return nomeExibicaoConta(a).localeCompare(nomeExibicaoConta(b)); });
  var orcadoTotal = bloco.subtotal.Orc_Desbloq + bloco.subtotal.Empenhado;
  var html = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:12px; margin-bottom:20px;">';
  html += '<div class="metric"><div class="label">Orçado</div><div class="value">'+fmt(orcadoTotal)+'</div></div>';
  html += '<div class="metric"><div class="label">Empenhado</div><div class="value">'+fmt(bloco.subtotal.Empenhado)+'</div></div>';
  html += '<div class="metric"><div class="label">Liquidado</div><div class="value">'+fmt(bloco.subtotal.Liquidado)+'</div></div>';
  html += '<div class="metric orange"><div class="label">Pago</div><div class="value">'+fmt(bloco.subtotal.Pago)+'</div></div></div>';

  contas.forEach(function(conta){
    var v = bloco.contas[conta];
    var orcado = v.Orc_Desbloq + v.Empenhado;
    var saldoOrc = v.Orc_Desbloq;
    var saldoLiq = v.Empenhado - v.Liquidado;
    var saldoPagar = v.Liquidado - v.Pago;
    var pctEmp = orcado ? (v.Empenhado / orcado * 100) : 0;
    var pctLiq = orcado ? (v.Liquidado / orcado * 100) : 0;
    var pctPag = orcado ? (v.Pago / orcado * 100) : 0;
    var contaCodificada = encodeURIComponent(conta);
    html += '<div class="conta-row">';
    html += '<div class="conta-row-head"><span class="conta-nome" title="'+escHtml(conta)+'">'+escHtml(nomeExibicaoConta(conta))+'</span>';
    if (currentRole === 'master'){ html += '<button class="conta-edit-btn" data-conta="'+escHtml(contaCodificada)+'">✎ apelido</button>'; }
    html += '</div>';
    html += '<div class="cc-orcado">Orçado: <strong>'+fmt(orcado)+'</strong></div>';
    html += '<div class="pbar-row"><span>Empenhado</span><span>'+fmt(v.Empenhado)+' · '+pctEmp.toFixed(1)+'%</span></div>';
    html += '<div class="pbar"><div class="pbar-fill empenho'+(pctEmp>100?' over':'')+'" style="width:'+Math.min(pctEmp,100)+'%;"></div></div>';
    html += '<div class="pbar-row"><span>Liquidado</span><span>'+fmt(v.Liquidado)+' · '+pctLiq.toFixed(1)+'%</span></div>';
    html += '<div class="pbar"><div class="pbar-fill liquidado'+(pctLiq>100?' over':'')+'" style="width:'+Math.min(pctLiq,100)+'%;"></div></div>';
    html += '<div class="pbar-row"><span>Pago</span><span>'+fmt(v.Pago)+' · '+pctPag.toFixed(1)+'%</span></div>';
    html += '<div class="pbar"><div class="pbar-fill pago'+(pctPag>100?' over':'')+'" style="width:'+Math.min(pctPag,100)+'%;"></div></div>';
    html += '<div class="cc-saldos">';
    html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo do orçamento</div><div class="cc-saldo-value">'+fmt(saldoOrc)+'</div></div>';
    html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo a liquidar</div><div class="cc-saldo-value">'+fmt(saldoLiq)+'</div></div>';
    html += '<div class="cc-saldo-box"><div class="cc-saldo-label">Saldo a pagar</div><div class="cc-saldo-value">'+fmt(saldoPagar)+'</div></div>';
    html += '</div></div>';
  });

  detalheCentroCard.innerHTML = html;

  if (currentRole === 'master'){
    detalheCentroCard.querySelectorAll('.conta-edit-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var conta = decodeURIComponent(btn.dataset.conta);
        var atual = (apelidosState.map && apelidosState.map[conta]) || '';
        var novo = window.prompt('Apelido para exibir no lugar de:\n' + conta, atual);
        if (novo === null) return; // cancelou
        if (!apelidosState.map) apelidosState.map = {};
        if (novo.trim()) apelidosState.map[conta] = novo.trim();
        else delete apelidosState.map[conta];
        saveApelidosDoc(apelidosState).then(function(){ renderDetalheCentro(bloco); });
      });
    });
  }
}

// ---------- minha conta ----------
document.getElementById('changePasswordBtn').addEventListener('click', function(){
  var msg = document.getElementById('passwordMsg');
  var v = document.getElementById('newPasswordInput').value;
  if (!v || v.length < 6){ msg.textContent = 'A senha precisa ter ao menos 6 caracteres.'; return; }
  updatePassword(currentUser, v).then(function(){
    msg.textContent = 'Senha alterada com sucesso.';
    document.getElementById('newPasswordInput').value = '';
  }).catch(function(err){
    msg.textContent = 'Não foi possível trocar agora — faça login novamente e tente de novo (' + err.code + ').';
  });
});

// Estudos calculados a partir dos retratos existentes, sem alterar documentos.
var studyFrom=document.getElementById('studyFrom'),studyTo=document.getElementById('studyTo');
function syncStudyDates(date){
  var previous=studyFrom.value;studyFrom.replaceChildren();studyTo.replaceChildren();
  availableDates.filter(function(d){return d.slice(0,4)===date.slice(0,4);}).forEach(function(d){studyFrom.add(new Option(fmtDate(d),d));studyTo.add(new Option(fmtDate(d),d));});
  if(availableDates.includes(previous)&&previous.slice(0,4)===date.slice(0,4))studyFrom.value=previous;studyTo.value=date;
}
studyFrom.addEventListener('change',renderStudies);studyTo.addEventListener('change',renderStudies);
function studyTotal(rows){var t={orcado:0,empenho:0,liquidacao:0,pagamento:0,saldoOrc:0,saldoLiq:0,saldoPagar:0};rows.forEach(function(r){Object.keys(t).forEach(function(k){t[k]+=r[k];});});return t;}
function studyMoney(v){return fmt(v);}
function renderStudies(){
  var host=document.getElementById('studiesContent');if(!lastCurrentSnap){host.innerHTML='<p class="muted">Carregue um retrato para começar.</p>';return;}
  var date=lastCurrentSnap.date,rows=visibleRows(lastCurrentSnap),t=studyTotal(rows),html='<p class="muted">Referência '+fmtDate(date)+' · '+rows.length+' centros após os filtros</p>';
  html+='<div class="study-metrics">'+[['Saldo disponível',t.saldoOrc],['Empenhado a liquidar',t.saldoLiq],['Liquidado a pagar',t.saldoPagar]].map(function(x){return '<div class="card"><div class="label">'+x[0]+'</div><strong>'+studyMoney(x[1])+'</strong></div>';}).join('')+'</div>';
  var negative=rows.filter(function(r){return r.saldoOrc< -0.005;});var inconsistent=rows.filter(function(r){return r.saldoLiq< -0.005||r.saldoPagar< -0.005;});
  if(negative.length||inconsistent.length)html+='<p class="import-warning">Conferência: '+negative.length+' centros com saldo orçamentário negativo; '+inconsistent.length+' com liquidado acima do empenhado ou pago acima do liquidado. Esses valores podem incluir ajustes ou divergências da fonte.</p>';
  if(!lastCurrentSnap.origem || lastCurrentSnap.origem.parserVersion<3)html+='<p class="import-warning">Retrato antigo: confira a leitura de Na Data antes de usar esta análise.</p>';
  var rank=rows.slice().sort(function(a,b){return b.saldoOrc-a.saldoOrc||a.centro.localeCompare(b.centro);}).slice(0,10);var max=Math.max(1,...rank.map(function(r){return Math.abs(r.saldoOrc);}));
  html+='<div class="card"><h3>10 maiores saldos do orçamento</h3><p class="muted">Disponibilidade por centro na referência selecionada.</p>'+rank.map(function(r){return '<div class="study-rank"><span>'+escHtml(r.centro)+'</span><strong>'+studyMoney(r.saldoOrc)+'</strong><div class="study-bar"><span style="width:'+Math.min(100,Math.abs(r.saldoOrc)/max*100)+'% ;background:'+(r.saldoOrc<0?'#b5473a':'#5f8054')+'"></span></div></div>';}).join('')+(rank.length?'':'<p>Nenhum centro atende aos filtros.</p>')+'</div>';
  var months={};availableDates.filter(function(d){return d.slice(0,4)===date.slice(0,4)&&d<=date;}).forEach(function(d){months[d.slice(0,7)]=d;});
  html+='<div class="card"><h3>Evolução das posições em '+date.slice(0,4)+'</h3><p class="muted">Último retrato disponível de cada mês, até a referência selecionada. Categorias e busca são aplicadas; o filtro de saldo é aplicado em cada posição e pode mudar o conjunto de centros.</p><div class="study-table"><table><thead><tr><th>Data</th><th>Centros</th><th>Orçado</th><th>Empenhado</th><th>Liquidado</th><th>Pago</th><th>Saldo disponível</th></tr></thead><tbody>';
  Object.values(months).forEach(function(d){var rr=visibleRows(snapshotsByDate[d]),tt=studyTotal(rr);html+='<tr><td>'+fmtDate(d)+'</td><td>'+rr.length+'</td>'+['orcado','empenho','liquidacao','pagamento','saldoOrc'].map(function(k){return '<td>'+studyMoney(tt[k])+'</td>';}).join('')+'</tr>';});html+='</tbody></table></div></div>';
  var from=studyFrom.value,to=studyTo.value;
  if(from&&to){if(from>to)html+='<p class="import-warning">Selecione uma posição inicial anterior ou igual à final.</p>';else{
    var old=rowsFromSnapshot(snapshotsByDate[from]),current=visibleRows(snapshotsByDate[to]);var oldMap=Object.fromEntries(old.map(function(r){return [r.centro,r];}));var newMap=Object.fromEntries(rowsFromSnapshot(snapshotsByDate[to]).map(function(r){return [r.centro,r];}));
    html+='<div class="card"><h3>Variação entre '+fmtDate(from)+' e '+fmtDate(to)+'</h3><p class="muted">Conjunto de centros definido pelos filtros na posição final. Valores negativos indicam redução, ajuste ou estorno.</p><div class="study-table"><table><thead><tr><th>Centro</th><th>Δ Empenhado</th><th>Δ Liquidado</th><th>Δ Pago</th><th>Δ Saldo</th></tr></thead><tbody>';
    current.forEach(function(r){var o=oldMap[r.centro];html+='<tr><td>'+escHtml(r.centro)+'</td>'+(o?['empenho','liquidacao','pagamento','saldoOrc'].map(function(k){return '<td>'+fmtSigned(r[k]-o[k])+'</td>';}).join(''):'<td colspan="4">Ausente na posição inicial; comparação indisponível</td>')+'</tr>';});
    var missing=old.filter(function(r){return !newMap[r.centro]&&passesFilter(r.centro);});html+='</tbody></table></div>'+(missing.length?'<p class="import-warning">Ausentes na posição final: '+missing.map(function(r){return escHtml(r.centro);}).join(', ')+'. Não foram tratados como zero.</p>':'')+'</div>';
  }}host.innerHTML=html;
}
