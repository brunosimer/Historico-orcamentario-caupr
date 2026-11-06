import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../lab-src/laboratory.mjs',import.meta.url),'utf8').split('\nexport function mountLaboratory(')[0].replace(/^import[^\n]+\n/gm,'')+'\nglobalThis.mount=mountLegacyLaboratory;';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const nodes=[];
 class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.handlers={};this.classList={add(){},toggle(){}};nodes.push(this);}set textContent(v){this.text=String(v);this.children=[];}get textContent(){return(this.text||'')+this.children.map(n=>n.textContent).join('');}append(...n){this.children.push(...n);if(this.tag==='select'&&this.value===undefined)this.value=this.children[0]?.value;}replaceChildren(...n){this.text='';this.children=n;}addEventListener(k,f){(this.handlers[k]||=[]).push(f);}setAttribute(){}click(){return Promise.all((this.handlers.click||[]).map(f=>f()));}}
 const pending=deferred(),report=deferred(),root=new Element('section');let authorized=true,dashboardContext,refreshes=0;
 const original={date:'2020-01-01',centros:{}};
 const sandbox={document:{createElement:t=>new Element(t)},Date,URL,Event,AbortController,setTimeout,mountIntegratedDashboard:c=>{dashboardContext=c;return{refresh(){refreshes++;},destroy(){}};}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 const instance=sandbox.mount({root,readAsset:id=>id==='comparisonSnapshot'?pending.promise:id==='comparisonReport'?report.promise:new Promise(()=>{}),isAuthorized:()=>authorized,getSnapshotDates:()=>[original.date],getSnapshot:d=>d===original.date?original:null,centerMap:{}});
 return{nodes,root,original,instance,pending,report,get context(){return dashboardContext;},get refreshes(){return refreshes;},signout(){authorized=false;instance.destroy();}};
}
const candidate={date:'2020-01-02',centros:{sample:{contas:{}}},origem:{formato:'pdf'}};
test('Private comparison is visible only through laboratory reads and never mutates the official snapshot',async()=>{
 const s=setup();assert.deepEqual(Array.from(s.context.getSnapshotDates()),['2020-01-01']);
 s.pending.resolve({content:JSON.stringify(candidate)});await tick();
 assert.deepEqual(Array.from(s.context.getSnapshotDates()),['2020-01-01','2020-01-02']);assert.equal(s.context.getSnapshot('2020-01-02').origem.labOnly,true);assert.equal(s.context.getSnapshot('2020-01-01'),s.original);assert.equal(s.original.origem,undefined);assert.equal(s.refreshes,1);
});
test('Malformed center arrays and impossible dates cannot become comparison snapshots',async()=>{
 for(const candidate of [{date:'2020-01-02',centros:[]},{date:'2020-02-30',centros:{}},{date:'2020-01-02',centros:{}},{date:'2020-01-02',centros:{sample:{contas:[]}}},{date:'2020-01-02',centros:{sample:{contas:{bad:null}}}},{date:'2020-01-02',centros:{sample:{contas:{bad:[]}}}}]){const s=setup();s.pending.resolve({content:JSON.stringify(candidate)});await tick();assert.deepEqual(Array.from(s.context.getSnapshotDates()),['2020-01-01']);assert.equal(s.refreshes,0);}
});
test('A comparison snapshot completing after signout cannot enter the dashboard',async()=>{
 const s=setup();s.signout();s.pending.resolve({content:JSON.stringify(candidate)});await tick();assert.equal(s.context.getSnapshot('2020-01-02'),null);assert.equal(s.root.children.length,0);assert.equal(s.refreshes,0);
});
test('A private report completing after signout cannot restore its content',async()=>{
 const s=setup();const loading=s.nodes.find(n=>n.tag==='button'&&n.textContent==='Conciliação do novo relatório').click();s.signout();s.report.resolve({content:'# Private report'});await loading;await tick();assert.equal(s.root.children.length,0);assert.equal(s.root.textContent,'');
});
test('Reports display comparison tables and emphasis while keeping HTML as literal text',async()=>{
 const s=setup();const loading=s.nodes.find(n=>n.tag==='button'&&n.textContent==='Conciliação do novo relatório').click();s.report.resolve({content:'# Report\n\n**Exact comparison**\n\n| Source | Amount |\n|---|---:|\n| PDF | R$ 1.234,56 |\n\n<script>alert(1)</script>'});await loading;await tick();
 assert.equal(s.nodes.filter(n=>n.tag==='table').length,1);assert.equal(s.nodes.filter(n=>n.tag==='th').length,2);assert.equal(s.nodes.filter(n=>n.tag==='td').length,2);assert.ok(s.nodes.some(n=>n.tag==='strong'&&n.textContent==='Exact comparison'));assert.equal(s.nodes.filter(n=>n.tag==='script').length,0);assert.ok(s.root.textContent.includes('<script>alert(1)</script>'));assert.ok(!s.root.textContent.includes('|---'));
});

