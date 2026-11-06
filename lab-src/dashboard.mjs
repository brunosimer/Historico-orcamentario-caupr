import {loadApiPosition,todaySaoPaulo,sumPosition} from './api-position.mjs';
import {LAB_METRICS,labNode,labButton,labSelect,labLabel,labMoney,labDate,labSourceTable} from './lab-ui.mjs';

const STAGES=[['empenhado','Empenhado','empenho'],['liquidado','Liquidado','liquidado'],['pago','Pago','pago']];
const BALANCES=[['saldoOrc','Saldo do orçamento'],['saldoLiq','Saldo a liquidar'],['saldoPagar','Saldo a pagar']];
const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
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
 const order=labSelect([['desc','Maior valor publicado'],['asc','Menor valor publicado'],['name','Nome do centro']]);
 const balanceScope=labSelect([['all','Todos os valores'],['positive','Valor positivo'],['zero','Valor zerado'],['negative','Valor negativo']]);
 fields.append(labLabel('Data limite',dateRow),labLabel('Centro de custo',center),labLabel('Categoria',category),labLabel('Buscar centro de custo',search),labLabel('Ordenar por',order),labLabel('Valores exibidos',balanceScope));
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
 function getFilters(){return {date:date.value,centerId:center.value,category:category.value,search:search.value,searchTarget:'centro',group:'centros',order:order.value,balanceScope:balanceScope.value,valueScope:balanceScope.value};}
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
  const box=labNode('div',undefined,'metric'+(color?' '+color:''));box.append(labNode('div',label,'label'),labNode('div',value,'value'));return box;
 }
 function metricGrid(t,detail=false){
  const grid=labNode('div',undefined,'lab-current-metrics'+(detail?' lab-current-detail-metrics':''));
  const fields=detail?[['orcado','Orçado',''],['empenhado','Empenhado',''],['liquidado','Liquidado',''],['pago','Pago','orange']]:[['orcado','Orçado total',''],['pago','Pago até aqui',''],['saldoOrc','Saldo de orçamento','blue']];
  for(const[key,label,color]of fields)if(typeof t[key]==='bigint')grid.append(metric(label,labMoney(t[key]),color));
  if(!detail&&typeof t.pago==='bigint'&&typeof t.orcado==='bigint'&&t.orcado>0n)grid.append(metric('% executado',percentage(t.pago,t.orcado,2).text,'orange'));
  return grid;
 }
 function budgetLine(t){if(typeof t.orcado!=='bigint')return null;const line=labNode('div','Orçado: ','cc-orcado');line.append(labNode('strong',labMoney(t.orcado)));return line;}
 function appendBudget(target,t){const line=budgetLine(t);if(line)target.append(line);}
 function appendBars(target,t,overview=false){
  const bars=overview?labNode('div',undefined,'geral-bars'):target;
  for(const[key,name,color]of STAGES){
   if(typeof t[key]!=='bigint')continue;
   const ratio=percentage(t[key],t.orcado),value=labMoney(t[key]),wrapper=overview?labNode('div'):bars;
   const hasBase=typeof t.orcado==='bigint'&&t.orcado>0n;
   const caption=hasBase?value+' · '+ratio.text:value;
   const row=labNode('div',undefined,'pbar-row');row.append(labNode('span',name),labNode('span',caption));
   wrapper.append(row);
   if(hasBase){const track=labNode('div',undefined,'pbar');track.setAttribute('role','img');track.setAttribute('aria-label',name+': '+value+'; '+ratio.text);const fill=labNode('div',undefined,'pbar-fill '+color+(ratio.over?' over':''));fill.style.width=ratio.width+'%';track.append(fill);wrapper.append(track);}
   if(overview)bars.append(wrapper);
  }
  if(overview)target.append(bars);
 }
 function appendBalances(target,t){
  const balances=labNode('div',undefined,'cc-saldos');
  for(const[key,name]of BALANCES){if(typeof t[key]!=='bigint')continue;const box=labNode('div',undefined,'cc-saldo-box');box.append(labNode('div',name,'cc-saldo-label'),labNode('div',labMoney(t[key]),'cc-saldo-value'));balances.append(box);}if(balances.children.length)target.append(balances);
 }
 function publishedLine(value,label='Valor publicado pela API: '){const line=labNode('div',label,'cc-orcado lab-current-published-value');line.append(labNode('strong',labMoney(value)));return line;}
 function appendParticipation(target,value,total,label){
  if(typeof value!=='bigint'||typeof total!=='bigint'||value<0n||total<=0n)return;
  const ratio=percentage(value,total),row=labNode('div',undefined,'pbar-row lab-current-participation-label');row.append(labNode('span',label),labNode('span',ratio.text));
  const track=labNode('div',undefined,'pbar lab-current-participation');track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+ratio.text);
  const fill=labNode('div',undefined,'pbar-fill publicado');fill.style.width=ratio.width+'%';track.append(fill);target.append(row,track);
 }
 function monthlyEvolution(item){
  const limit=Number(position.month.slice(5,7)),months=[];
  for(let index=0;index<Math.min(12,limit);index++){const value=item.monthly?.[String(index+1).padStart(2,'0')];if(typeof value==='bigint')months.push({name:MONTHS[index],value});}
  if(!months.length)return null;
  const details=labNode('details',undefined,'lab-current-monthly');details.append(labNode('summary','Evolução mensal do valor publicado'));
  const graph=labNode('div',undefined,'lab-current-monthly-bars'),max=months.reduce((largest,item)=>{const absolute=item.value<0n?-item.value:item.value;return absolute>largest?absolute:largest;},0n);
  for(const month of months){const row=labNode('div',undefined,'pbar-row');row.append(labNode('span',month.name),labNode('span',labMoney(month.value)));const track=labNode('div',undefined,'pbar'),fill=labNode('div',undefined,'pbar-fill '+(month.value<0n?'over':'publicado'));const absolute=month.value<0n?-month.value:month.value;fill.style.width=max>0n?Number(absolute*10000n/max)/100+'%':'0%';track.setAttribute('role','img');track.setAttribute('aria-label',month.name+': '+labMoney(month.value));track.append(fill);graph.append(row,track);}details.append(graph);return details;
 }
 function publishedAccounts(center){return (center.accounts||[]).filter(account=>typeof amount(account,'value')==='bigint');}
 function publishedAccountRow(account,centerValue){
  const row=labNode('div',undefined,'conta-row lab-current-published-account'),head=labNode('div',undefined,'conta-row-head');head.append(labNode('span',accountName(account),'conta-nome'));row.append(head,publishedLine(amount(account,'value')));appendParticipation(row,amount(account,'value'),centerValue,'Participação neste centro');const monthly=monthlyEvolution(account);if(monthly)row.append(monthly);return row;
 }
 function accountRow(account){
  const row=labNode('div',undefined,'conta-row'),head=labNode('div',undefined,'conta-row-head');head.append(labNode('span',accountName(account),'conta-nome'));
  const t=totals([account]);row.append(head);appendBudget(row,t);appendBars(row,t);appendBalances(row,t);return row;
 }
 function selectedCenters(){
  const query=normalizeSearch(search.value.trim());
  return (position?.centers||[]).filter(c=>{
   if(center.value&&String(c.id)!==center.value)return false;if(category.value&&categoryOf(c)!==category.value)return false;
   if(query&&!normalizeSearch(centerName(c)).includes(query)&&!normalizeSearch(c.name).includes(query))return false;
   const balance=amount(c,'value');if(typeof balance!=='bigint')return false;
   if(balanceScope.value==='all')return true;
   return typeof balance==='bigint'&&(balanceScope.value==='positive'?balance>0n:balanceScope.value==='negative'?balance<0n:balance===0n);
  }).sort((a,b)=>{
   const av=amount(a,'value'),bv=amount(b,'value');
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
  const allAccounts=position.accounts||[];
  const accounts=allAccounts.filter(account=>LAB_METRICS.some(([key])=>typeof amount(account,key)==='bigint')).sort((a,b)=>compareNames(accountName(a),accountName(b)));
  const body=labNode('div',undefined,'lab-current-global-body');let drawn=false;
  details.addEventListener('toggle',()=>{if(!ensureAccess()||!details.open||drawn)return;drawn=true;
   body.append(labNode('p','Valores globais por conta, sem distribuição entre centros de custo. São exibidos somente os campos publicados pela API.','source-note'),metricGrid(totals(allAccounts),true));
   if(accounts.length<allAccounts.length)body.append(labNode('p',(allAccounts.length-accounts.length)+' contas sem valores publicados foram omitidas.','source-note'));
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
  const card=labNode('section',undefined,'card'),value=amount(selected,'value');
  const accounts=publishedAccounts(selected).sort((a,b)=>compareNames(accountName(a),accountName(b)));
  const summary=labNode('div',undefined,'lab-current-metrics lab-current-published-summary');
  if(typeof value==='bigint')summary.append(metric('Valor publicado pela API',labMoney(value)));
  summary.append(metric('Contas com valor publicado',String(accounts.length)));card.append(summary);
  const omitted=(selected.accounts||[]).length-accounts.length;
  if(omitted)card.append(labNode('p',omitted+' contas sem valor publicado foram omitidas. Os valores exibidos não completam os registros ausentes.','source-note'));
  const monthly=monthlyEvolution(selected);if(monthly)card.append(monthly);
  if(!accounts.length)card.append(labNode('p','Nenhuma conta com valor publicado nesta referência.','muted'));
  for(const account of accounts)card.append(publishedAccountRow(account,value));
  content.append(back,title,reference,card,provenance());
 }
 function render(){
  if(!ensureAccess())return;updateContext();content.replaceChildren();controls.hidden=detailId!==null;
  if(!position)return;if(detailId!==null){renderDetail();return;}
  const allCenters=position.centers||[],centers=selectedCenters();
  const scoped=!!center.value||!!category.value||!!search.value.trim()||balanceScope.value!=='all';
  const t=totals(position.accounts||[]),useGlobal=!scoped&&LAB_METRICS.some(([key])=>typeof t[key]==='bigint');
  const selectionValue=sumPosition(centers,'value'),allValue=sumPosition(allCenters,'value');
  const accountCount=new Set(centers.flatMap(c=>publishedAccounts(c).map(a=>a.code||a.id))).size;
  const card=labNode('section',undefined,'card');
  card.append(labNode('p','Referência mensal '+position.month.split('-').reverse().join('/')+' · '+centers.length+' de '+allCenters.length+' centros exibidos','muted lab-current-reference'));
  card.append(labNode('p',useGlobal?'Totais globais por conta. Os cartões abaixo mostram o valor publicado por centro de custo.':'Valores publicados pela API para os centros selecionados.','source-note'));
  if(useGlobal)card.append(metricGrid(t));
  else{const summary=labNode('div',undefined,'lab-current-metrics lab-current-published-summary');if(typeof selectionValue==='bigint')summary.append(metric('Valor publicado na seleção',labMoney(selectionValue)));summary.append(metric('Centros exibidos',String(centers.length)),metric('Contas no conjunto',String(accountCount)));card.append(summary);}
  const general=labNode('div',undefined,'cc-geral');
  general.append(labNode('div','Visão geral','cc-name'),labNode('div',useGlobal?'Posição global por conta · '+centers.length+' centros listados abaixo':[(category.value||'Todas as categorias'),search.value.trim()?'Busca: '+search.value.trim():'',centers.length+' centro(s) de custo'].filter(Boolean).join(' · '),'cc-cat'));
  if(useGlobal){appendBudget(general,t);appendBars(general,t,true);appendBalances(general,t);}
  else if(typeof selectionValue==='bigint'){general.append(publishedLine(selectionValue,'Valor publicado na seleção: '));appendParticipation(general,selectionValue,allValue,'Participação no total dos centros');}
  if(useGlobal||typeof selectionValue==='bigint')card.append(general);
  const omitted=allCenters.filter(c=>typeof amount(c,'value')!=='bigint').length;
  if(omitted)card.append(labNode('p',omitted+' centros sem valor publicado foram omitidos. Os totais exibidos abrangem apenas os registros disponíveis.','source-note'));
  if(!centers.length)card.append(labNode('p',allCenters.length?'Nenhum centro com valor publicado corresponde aos filtros atuais.':'A fonte de centros de custo não retornou registros nesta referência.','muted'));
  const grid=labNode('div',undefined,'cc-grid');
  for(const c of centers){
   const item=labNode('article',undefined,'cc-card clickable');item.dataset.labCenter=String(c.id);item.setAttribute('role','button');item.tabIndex=0;
   item.setAttribute('aria-label','Ver contas contábeis de '+centerName(c));item.title='Ver contas contábeis deste centro de custo';
   const color=categoryColor(c);if(color)item.style.backgroundColor=color;
   const value=amount(c,'value'),accounts=publishedAccounts(c);item.append(labNode('div',centerName(c),'cc-name'),labNode('div',categoryOf(c),'cc-cat'),publishedLine(value));appendParticipation(item,value,allValue,'Participação no total dos centros');item.append(labNode('p',accounts.length+' conta(s) com valor publicado','lab-current-count'));
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
