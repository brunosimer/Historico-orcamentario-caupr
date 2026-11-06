import {loadApiPosition,todaySaoPaulo,sumPosition} from './api-position.mjs';
import {LAB_METRICS,labNode,labButton,labSelect,labLabel,labMoney,labDate,labSourceTable} from './lab-ui.mjs';

const STAGES=[['empenhado','Empenhado','empenho'],['liquidado','Liquidado','liquidado'],['pago','Pago','pago']];
const BALANCES=[['saldoOrc','Saldo do orçamento'],['saldoLiq','Saldo a liquidar'],['saldoPagar','Saldo a pagar']];
const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const compareNames=(a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true});

// Money remains exact; only the bounded visual width becomes a Number.
function percentage(value,budget,places=1){
 if(typeof value!=='bigint'||typeof budget!=='bigint')return {text:'Indisponível',width:0,over:false};
 if(budget<=0n)return {text:'Sem base de orçamento',width:0,over:false};
 const scale=10n**BigInt(places),absolute=value<0n?-value:value;
 const rounded=(absolute*100n*scale+budget/2n)/budget;
 const text=(value<0n?'-':'')+(rounded/scale).toString()+','+(rounded%scale).toString().padStart(places,'0')+'%';
 const width=value<=0n?0:value>=budget?100:Number(value*10000n/budget)/100;
 return {text,width,over:value>budget};
}
function totals(items){return Object.fromEntries(LAB_METRICS.map(([key])=>[key,sumPosition(items,key)]));}
function amount(item,key){return sumPosition([item],key);}

export function mountIntegratedDashboard(context){
 const {root,isAuthorized,getAccountAlias=name=>name,getCategories=()=>({}),centerMap=()=>({}),onAudit=()=>{}}=context;
 let alive=true,request=null,revision=0,position=null,detailId=null,lastCardId=null;
 const canUse=()=>alive&&isAuthorized();
 const controls=labNode('section',undefined,'card lab-filters lab-current-filters'),fields=labNode('div',undefined,'lab-fields');
 controls.append(labNode('h3','Filtros'));
 const date=labNode('input');date.type='date';date.id='labPositionDate';date.required=true;date.value=todaySaoPaulo();date.max=date.value;
 const today=labButton('Hoje',()=>{if(!ensureAccess())return;date.max=todaySaoPaulo();date.value=date.max;invalidateDate();});
 const dateRow=labNode('div',undefined,'lab-date-field');dateRow.append(date,today);
 const center=labSelect([['','Todos os centros']]),category=labSelect([['','Todas as categorias']]);
 const search=labNode('input');search.type='search';search.placeholder='Nome do centro de custo';
 const order=labSelect([['desc','Maior para menor'],['asc','Menor para maior'],['name','Nome do centro']]);
 const balanceScope=labSelect([['all','Todos os saldos'],['positive','Saldo disponível (positivo)'],['zero','Saldo zerado'],['negative','Saldo negativo'],['unavailable','Saldo indisponível']]);
 fields.append(labLabel('Data limite',dateRow),labLabel('Centro de custo',center),labLabel('Categoria',category),labLabel('Buscar centro de custo',search),labLabel('Ordenar pelo saldo do orçamento',order),labLabel('Saldos exibidos',balanceScope));
 const actions=labNode('div',undefined,'lab-actions');
 const run=labButton('Consultar API',query,'btn primary');
 const audit=labButton('Auditoria',()=>{if(ensureAccess()&&validDate())onAudit(getFilters());});
 const cancel=labButton('Cancelar',()=>{if(!ensureAccess())return;cancelRequest();status.textContent='Consulta cancelada. Consulte a API para carregar os valores.';});
 const clear=labButton('Limpar filtros',()=>{if(!ensureAccess())return;center.value='';category.value='';search.value='';order.value='desc';balanceScope.value='all';detailId=null;render();});
 cancel.disabled=true;actions.append(run,audit,cancel,clear);
 const active=labNode('p',undefined,'lab-active-filters');
 const status=labNode('p','Consultando a referência atual…','lab-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 controls.append(fields,actions,active,status);
 const content=labNode('div',undefined,'lab-current-copy');root.replaceChildren(controls,content);

 function clearPrivate(){
  revision++;request?.abort();request=null;position=null;detailId=null;lastCardId=null;
  content.replaceChildren();controls.hidden=true;center.replaceChildren();category.replaceChildren();search.value='';status.textContent='';active.textContent='';
 }
 function ensureAccess(){if(canUse())return true;clearPrivate();return false;}
 function getFilters(){return {date:date.value,centerId:center.value,category:category.value,search:search.value,searchTarget:'centro',group:'centros',order:order.value,balanceScope:balanceScope.value};}
 function validDate(){date.max=todaySaoPaulo();return date.reportValidity()&&date.value<=date.max;}
 function mappedCenter(c){const mapping=typeof centerMap==='function'?centerMap():centerMap;return mapping?.[c.code];}
 function centerName(c){const mapped=mappedCenter(c);return mapped?.nomeFinal?String(mapped.seq).padStart(2,'0')+' - '+mapped.nomeFinal:String(c.name||'Centro sem nome');}
 function categoryOf(c){const config=getCategories()||{};return config.map?.[centerName(c)]||config.map?.[c.name]||'Sem categoria';}
 function accountName(a){
  const raw=String(a.name||'Conta sem nome'),direct=getAccountAlias(raw);
  const original=/^\s*\d+(?:\.\d+)+\s*[-–—]?\s*/.test(raw)||!a.code?raw:String(a.code)+' - '+raw;
  const alias=direct&&direct!==raw?direct:getAccountAlias(original);
  return String(alias||raw).replace(/^\s*\d+(?:\.\d+)+\s*[-–—]?\s*/,'')||'Conta sem nome';
 }
 function categoryColor(c){const color=getCategories()?.colors?.[categoryOf(c)];return typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)?color:'';}
 function populate(){
  const previousCenter=center.value,previousName=center.selectedOptions[0]?.textContent,previousCategory=category.value;
  center.replaceChildren();
  const choices=[['','Todos os centros'],...(position?.centers||[]).map(c=>[String(c.id),centerName(c)]).sort((a,b)=>compareNames(a[1],b[1]))];
  if(previousCenter&&!choices.some(([id])=>id===previousCenter))choices.push([previousCenter,previousName||'Centro sem registro nesta referência']);
  for(const[value,text]of choices){const option=labNode('option',text);option.value=value;center.append(option);}center.value=previousCenter;
  const categories=[...new Set((position?.centers||[]).map(categoryOf))].sort(compareNames);
  if(previousCategory&&!categories.includes(previousCategory))categories.push(previousCategory);
  category.replaceChildren();for(const[value,text]of [['','Todas as categorias'],...categories.map(name=>[name,name])]){const option=labNode('option',text);option.value=value;category.append(option);}category.value=previousCategory;
 }
 function cancelRequest(){revision++;request?.abort();request=null;run.disabled=false;cancel.disabled=true;}
 function updateContext(){
  const filters=getFilters(),parts=['Limite solicitado: '+labDate(filters.date),center.selectedOptions[0]?.textContent||'Todos os centros'];
  if(filters.category)parts.push(filters.category);if(filters.search.trim())parts.push('Busca: '+filters.search.trim());
  if(filters.balanceScope!=='all')parts.push(balanceScope.selectedOptions[0].textContent);
  active.textContent=parts.join(' · ');audit.setAttribute('aria-label','Executar auditoria até '+labDate(filters.date));
 }
 function invalidateDate(){
  if(!ensureAccess())return;cancelRequest();position=null;detailId=null;content.replaceChildren();controls.hidden=false;updateContext();
  status.textContent='Data alterada. Consulte a API para atualizar os valores.';
 }
 async function query(){
  if(!ensureAccess()||!validDate())return;
  cancelRequest();const currentRevision=revision,controller=new AbortController();request=controller;
  const requestedDate=date.value;position=null;detailId=null;content.replaceChildren();controls.hidden=false;run.disabled=true;cancel.disabled=false;updateContext();
  status.textContent='Consultando contas e centros de custo…';
  try{
   const result=await loadApiPosition(requestedDate,controller.signal);
   if(currentRevision!==revision||controller.signal.aborted)return;if(!ensureAccess())return;
   position=result;populate();render();
   status.textContent=result.sources.every(source=>source.ok)?'Consulta concluída. As fontes são mensais; a data solicitada não comprova corte diário.':'Consulta parcial. Confira as fontes indisponíveis abaixo.';
  }catch(error){
   if(currentRevision===revision&&ensureAccess()){position=null;content.replaceChildren();status.textContent=controller.signal.aborted?'Consulta cancelada. Consulte novamente para carregar os valores.':'Consulta não concluída: '+error.message;}
  }finally{
   if(currentRevision===revision&&canUse()){request=null;run.disabled=false;cancel.disabled=true;}
   else if(alive&&!isAuthorized())clearPrivate();
  }
 }
 function metric(label,value,color=''){
  const box=labNode('div',undefined,'metric'+(color?' '+color:'')+(value==='Indisponível'||value==='Sem base de orçamento'?' lab-current-metric-unavailable':''));box.append(labNode('div',label,'label'),labNode('div',value,'value'));return box;
 }
 function metricGrid(t,detail=false){
  const grid=labNode('div',undefined,'lab-current-metrics'+(detail?' lab-current-detail-metrics':''));
  if(detail)grid.append(metric('Orçado',labMoney(t.orcado)),metric('Empenhado',labMoney(t.empenhado)),metric('Liquidado',labMoney(t.liquidado)),metric('Pago',labMoney(t.pago),'orange'));
  else grid.append(metric('Orçado total',labMoney(t.orcado)),metric('Pago até aqui',labMoney(t.pago)),metric('Saldo de orçamento',labMoney(t.saldoOrc),'blue'),metric('% executado',percentage(t.pago,t.orcado,2).text,'orange'));
  return grid;
 }
 function budgetLine(t){const line=labNode('div','Orçado: ','cc-orcado');line.append(labNode('strong',labMoney(t.orcado)));return line;}
 function appendBars(target,t,overview=false){
  const bars=overview?labNode('div',undefined,'geral-bars'):target;
  for(const[key,name,color]of STAGES){
   const ratio=percentage(t[key],t.orcado),value=labMoney(t[key]),wrapper=overview?labNode('div'):bars;
   const caption=typeof t[key]==='bigint'?value+' · '+ratio.text:'Indisponível';
   const row=labNode('div',undefined,'pbar-row');row.append(labNode('span',name),labNode('span',caption));
   const unavailable=typeof t[key]!=='bigint'||typeof t.orcado!=='bigint'||t.orcado<=0n;
   const track=labNode('div',undefined,'pbar'+(unavailable?' lab-current-unavailable':''));
   track.setAttribute('role','img');track.setAttribute('aria-label',name+': '+value+'; '+ratio.text+(unavailable?'. Faixa sem base disponível.':''));
   const fill=labNode('div',undefined,'pbar-fill '+color+(ratio.over?' over':''));fill.style.width=ratio.width+'%';track.append(fill);wrapper.append(row,track);
   if(overview)bars.append(wrapper);
  }
  if(overview)target.append(bars);
 }
 function appendBalances(target,t){
  const balances=labNode('div',undefined,'cc-saldos');
  for(const[key,name]of BALANCES){const box=labNode('div',undefined,'cc-saldo-box');box.append(labNode('div',name,'cc-saldo-label'),labNode('div',labMoney(t[key]),'cc-saldo-value'));balances.append(box);}target.append(balances);
 }
 function appendPublishedValue(target,item){if(Object.hasOwn(item,'value'))target.append(labNode('p','Valor publicado pela fonte de centros: '+labMoney(amount(item,'value')),'source-note lab-current-published'));}
 function accountRow(account,withGenericValue=false){
  const row=labNode('div',undefined,'conta-row'),head=labNode('div',undefined,'conta-row-head');head.append(labNode('span',accountName(account),'conta-nome'));
  const t=totals([account]);row.append(head,budgetLine(t));appendBars(row,t);appendBalances(row,t);if(withGenericValue)appendPublishedValue(row,account);return row;
 }
 function selectedCenters(){
  const query=normalizeSearch(search.value.trim());
  return (position?.centers||[]).filter(c=>{
   if(center.value&&String(c.id)!==center.value)return false;if(category.value&&categoryOf(c)!==category.value)return false;
   if(query&&!normalizeSearch(centerName(c)).includes(query)&&!normalizeSearch(c.name).includes(query))return false;
   const balance=amount(c,'saldoOrc');
   if(balanceScope.value==='all')return true;if(balanceScope.value==='unavailable')return balance===null;
   return typeof balance==='bigint'&&(balanceScope.value==='positive'?balance>0n:balanceScope.value==='negative'?balance<0n:balance===0n);
  }).sort((a,b)=>{
   const av=amount(a,'saldoOrc'),bv=amount(b,'saldoOrc');
   if(order.value!=='name'){
    if(av===null&&bv!==null)return 1;if(av!==null&&bv===null)return -1;
    if(typeof av==='bigint'&&typeof bv==='bigint'&&av!==bv)return order.value==='asc'?(av<bv?-1:1):(av>bv?-1:1);
   }return compareNames(centerName(a),centerName(b));
  });
 }
 function provenance(){
  const details=labNode('details',undefined,'card lab-current-sources');details.append(labNode('summary','Fontes e referências da consulta'),labSourceTable(position));
  for(const message of new Set((position.issues||[]).map(issue=>issue.message).filter(Boolean)))details.append(labNode('p',message,'source-note'));
  return details;
 }
 function globalAccounts(){
  const details=labNode('details',undefined,'card lab-current-global');details.append(labNode('summary','Ver contas da API · visão global'));
  const accounts=(position.accounts||[]).slice().sort((a,b)=>compareNames(accountName(a),accountName(b)));
  const body=labNode('div',undefined,'lab-current-global-body');let drawn=false;
  details.addEventListener('toggle',()=>{if(!ensureAccess()||!details.open||drawn)return;drawn=true;
   body.append(labNode('p','Valores globais por conta, sem distribuição entre centros de custo.','source-note'),metricGrid(totals(accounts),true));
   if(!accounts.length)body.append(labNode('p','A fonte global por conta não retornou registros utilizáveis nesta referência.','muted'));
   for(const account of accounts)body.append(accountRow(account));
  });details.append(body);return details;
 }
 function renderDetail(){
  const selected=(position.centers||[]).find(item=>String(item.id)===detailId);
  if(!selected){detailId=null;render();return;}
  controls.hidden=true;
  const back=labButton('← Voltar',()=>{if(!ensureAccess())return;detailId=null;render();const item=[...content.querySelectorAll('[data-lab-center]')].find(node=>node.dataset.labCenter===lastCardId);item?.focus();},'btn lab-current-back');
  const title=labNode('h2',centerName(selected));
  const reference=labNode('p','Referência mensal '+position.month.split('-').reverse().join('/')+' · limite solicitado: '+labDate(position.date),'muted lab-current-detail-date');
  const card=labNode('section',undefined,'card');card.append(metricGrid(totals([selected]),true));
  const accounts=(selected.accounts||[]).slice().sort((a,b)=>compareNames(accountName(a),accountName(b)));
  if(STAGES.some(([key])=>typeof amount(selected,key)!=='bigint'))card.append(labNode('p','A API informa execução por centro, mas não separa os três estágios. As faixas sem valor estão identificadas como indisponíveis.','source-note'));
  appendPublishedValue(card,selected);
  if(!accounts.length)card.append(labNode('p','A API não retornou contas utilizáveis para este centro nesta referência.','muted'));
  for(const account of accounts)card.append(accountRow(account,true));
  content.append(back,title,reference,card,provenance());
 }
 function render(){
  if(!ensureAccess())return;updateContext();content.replaceChildren();controls.hidden=detailId!==null;
  if(!position)return;if(detailId!==null){renderDetail();return;}
  const allCenters=position.centers||[],centers=selectedCenters();
  const scoped=!!center.value||!!category.value||!!search.value.trim()||balanceScope.value!=='all';
  const summaryItems=scoped?centers:position.accounts||[],t=totals(summaryItems);
  const card=labNode('section',undefined,'card');
  card.append(labNode('p','Referência mensal '+position.month.split('-').reverse().join('/')+' · '+centers.length+' de '+allCenters.length+' centros exibidos','muted lab-current-reference'));
  card.append(labNode('p',scoped?'Totais dos centros selecionados, conforme os estágios disponíveis na API.':'Totais globais por conta. Os cartões abaixo mostram a fonte de centros de custo separadamente.','source-note'));
  card.append(metricGrid(t));
  const general=labNode('div',undefined,'cc-geral');
  general.append(labNode('div','Visão geral','cc-name'),labNode('div',scoped?[(category.value||'Todas as categorias'),search.value.trim()?'Busca: '+search.value.trim():'',centers.length+' centro(s) de custo'].filter(Boolean).join(' · '):'Posição global por conta · '+centers.length+' centros listados abaixo','cc-cat'),budgetLine(t));
  appendBars(general,t,true);appendBalances(general,t);card.append(general);
  if(!centers.length)card.append(labNode('p',allCenters.length?'Nenhum centro de custo corresponde aos filtros atuais.':'A fonte de centros de custo não retornou registros utilizáveis nesta referência.','muted'));
  if(centers.some(c=>STAGES.some(([key])=>typeof amount(c,key)!=='bigint')))card.append(labNode('p','A API informa execução por centro, mas não separa os três estágios. Os valores não publicados permanecem indisponíveis.','source-note'));
  const grid=labNode('div',undefined,'cc-grid');
  for(const c of centers){
   const item=labNode('article',undefined,'cc-card clickable');item.dataset.labCenter=String(c.id);item.setAttribute('role','button');item.tabIndex=0;
   item.setAttribute('aria-label','Ver contas contábeis de '+centerName(c));item.title='Ver contas contábeis deste centro de custo';
   const color=categoryColor(c);if(color)item.style.backgroundColor=color;
   const metrics=totals([c]);item.append(labNode('div',centerName(c),'cc-name'),labNode('div',categoryOf(c),'cc-cat'),budgetLine(metrics));appendBars(item,metrics);appendBalances(item,metrics);appendPublishedValue(item,c);
   const open=()=>{if(!ensureAccess())return;detailId=String(c.id);lastCardId=detailId;render();content.querySelector('.lab-current-back')?.focus();};
   item.addEventListener('click',open);item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});grid.append(item);
  }
  card.append(grid);content.append(labNode('h2','Situação atual'),card,globalAccounts(),provenance());
 }
 date.addEventListener('input',invalidateDate);date.addEventListener('change',invalidateDate);
 for(const control of [center,category,order,balanceScope])control.addEventListener('change',()=>{if(ensureAccess()){detailId=null;render();}});
 search.addEventListener('input',()=>{if(ensureAccess()){detailId=null;render();}});
 query();
 return {
  refresh(){if(!ensureAccess())return;populate();render();},
  getFilters,
  getPosition(){if(!ensureAccess())return null;return position;},
  resetToToday(){if(!ensureAccess())return;date.max=todaySaoPaulo();date.value=date.max;invalidateDate();query();},
  destroy(){alive=false;revision++;request?.abort();request=null;position=null;detailId=null;root.replaceChildren();}
 };
}
