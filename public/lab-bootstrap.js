// O conteúdo do laboratório é obtido do servidor apenas para a conta autorizada.
const OWNER_UID='CP27dQkMVdUAE8CROxgJnmnkyP92';
const OWNER_EMAIL='bruno.simer@caupr.gov.br';
export function createLabController(context){
 const {nav,root,readAsset,getCurrentUser,getSnapshotDates,getSnapshot,centerMap,getCategories,getAccountAlias}=context;
 let mounted=null,loading=null,generation=0;
 const authorized=()=>{const u=getCurrentUser();return !!u&&u.uid===OWNER_UID&&u.email===OWNER_EMAIL;};
 function sync(){nav.hidden=!authorized();nav.style.display=authorized()?'':'none';if(!authorized()){generation++;mounted?.destroy();mounted=null;loading=null;root.replaceChildren();root.style.display='none';}}
 async function open(){if(!authorized())return;root.style.display='block';if(mounted){if(mounted.activate)mounted.activate();else mounted.refresh?.();return;}if(loading)return loading;const revision=generation;root.textContent='Carregando seu laboratório privado…';
  loading=(async()=>{try{const asset=await readAsset('module');if(!authorized()||generation!==revision)return;const bytes=new TextEncoder().encode(asset.content);const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(digest!==asset.sha256)throw new Error('Integridade do módulo inválida.');const url=URL.createObjectURL(new Blob([asset.content],{type:'text/javascript'}));let module;try{module=await import(url);}finally{URL.revokeObjectURL(url);}if(!authorized()||generation!==revision)return;const instance=await module.mountLaboratory({root,readAsset,isAuthorized:authorized,getSnapshotDates,getSnapshot,centerMap,getCategories,getAccountAlias});if(!authorized()||generation!==revision){instance.destroy();return;}mounted=instance;}catch(e){if(authorized()&&generation===revision){root.replaceChildren();const p=document.createElement('p');p.textContent='Não foi possível carregar o laboratório privado. Tente abrir novamente.';root.append(p);}}finally{if(generation===revision)loading=null;}})();return loading;
 }
 return {sync,open,refresh(){if(authorized())mounted?.refresh?.();}};
}
