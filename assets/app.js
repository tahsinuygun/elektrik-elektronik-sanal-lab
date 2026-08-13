
const state={catalog:null,department:"all",query:"",deferredPrompt:null};
const $=s=>document.querySelector(s);

const departmentsEl=$("#departmentFilters"),gridEl=$("#modelGrid"),emptyEl=$("#emptyState");

function platform(){
  const ua=navigator.userAgent||"";
  if(/iPad|iPhone|iPod/.test(ua)) return "ios";
  if(/Android/.test(ua)) return "android";
  return "desktop";
}
function platformText(){
  const p=platform(), forced=new URLSearchParams(location.search).get("platform");
  if(forced==="ios"||p==="ios") return "iPhone algılandı • GLB ile Quick Look AR";
  if(forced==="android"||p==="android") return "Android algılandı • GLB ile AR";
  return "Masaüstü 3B görüntüleme";
}
function departmentName(id){return state.catalog.departments.find(d=>d.id===id)?.name||id}
function normalize(t){return (t||"").toLocaleLowerCase("tr-TR")}

function renderFilters(){
  const all=[{id:"all",name:"Tümü",icon:"◈"},...state.catalog.departments];
  departmentsEl.innerHTML=all.map(d=>`<button class="filter-button ${state.department===d.id?"active":""}" data-department="${d.id}" role="tab">${d.icon||""} ${d.name}</button>`).join("");
  departmentsEl.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{state.department=b.dataset.department;renderFilters();renderModels()}));
}
function filteredModels(){
  return state.catalog.models.filter(m=>{
    const dep=state.department==="all"||m.department===state.department;
    const hay=[m.title,m.description,departmentName(m.department),...(m.tags||[])].map(normalize).join(" ");
    return dep&&hay.includes(normalize(state.query));
  });
}
function card(m){
  return `<article class="model-card" data-id="${m.id}" tabindex="0">
    <div class="model-preview">
      <model-viewer src="${m.glb}" alt="${m.title}" camera-orbit="45deg 70deg 2.6m"
        tone-mapping="neutral" exposure="1.25" shadow-intensity="0"
        loading="lazy" interaction-prompt="none"></model-viewer>
      <div class="card-platforms"><span>${m.usdz ? "GLB + USDZ • AR" : "GLB • iOS/Android AR"}</span></div>
    </div>
    <div class="model-content">
      <small>${departmentName(m.department)}</small><h3>${m.title}</h3><p>${m.description}</p>
      <div class="card-bottom"><span>${(m.tags||[]).slice(0,2).join(" • ")}</span><b class="open-circle">↗</b></div>
    </div>
  </article>`;
}
function renderModels(){
  const list=filteredModels();
  gridEl.innerHTML=list.map(card).join("");
  emptyEl.hidden=list.length!==0;

  if(list.length===0){
    const hasQuery=Boolean(state.query.trim());
    const selected=state.department==="all" ? "" : departmentName(state.department);
    $("#emptyTitle").textContent=hasQuery
      ? "Aramanızla eşleşen model bulunamadı"
      : (selected ? `${selected} için henüz model yüklenmedi` : "Henüz model yüklenmedi");
    $("#emptyText").textContent=hasQuery
      ? "Arama kelimesini veya anabilim dalı seçimini değiştirin."
      : "GLB dosyasını ilgili anabilim dalı klasörüne yüklediğinizde GitHub işlemi tamamlanır ve model otomatik olarak burada görünür.";
  }

  gridEl.querySelectorAll(".model-card").forEach(c=>{
    c.addEventListener("click",()=>openModel(c.dataset.id));
    c.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")openModel(c.dataset.id)});
  });
}
function openModel(id){
  const m=state.catalog.models.find(x=>x.id===id); if(!m)return;
  const v=$("#mainViewer");
  const arButton=v.querySelector('[slot="ar-button"]');
  const notice=$("#arNotice");

  v.setAttribute("src",m.glb);

  if(m.usdz){
    v.setAttribute("ios-src",m.usdz);
  }else{
    v.removeAttribute("ios-src");
  }

  // USDZ zorunlu değildir. ios-src yoksa <model-viewer>, Quick Look için
  // gerekli USDZ içeriğini GLB modelinden çalışma anında üretir.
  if(arButton) arButton.hidden=false;
  if(notice) notice.hidden=true;

  $("#viewerDialog").showModal();
  history.replaceState(null,"",`${location.pathname}?model=${encodeURIComponent(id)}${platform()==="desktop"?"":`&platform=${platform()}`}`);
}
function closeViewer(){
  $("#viewerDialog").close();
  const v=$("#mainViewer");
  setTimeout(()=>{
    v.removeAttribute("src");
    v.removeAttribute("ios-src");
  },150);
  history.replaceState(null,"",location.pathname);
}
async function init(){
  const res=await fetch("data/catalog.json",{cache:"no-store"}); state.catalog=await res.json();
  $("#platformBadge").textContent=platformText();
  renderFilters();renderModels();
  const id=new URLSearchParams(location.search).get("model"); if(id)setTimeout(()=>openModel(id),250);
}
$("#searchInput").addEventListener("input",e=>{state.query=e.target.value;renderModels()});
$("#dialogClose").addEventListener("click",closeViewer);
$("#viewerDialog").addEventListener("click",e=>{if(e.target===$("#viewerDialog"))closeViewer()});
$("#howButton").addEventListener("click",()=>$("#howDialog").showModal());
$("#howClose").addEventListener("click",()=>$("#howDialog").close());
$("#resetViewButton").addEventListener("click",()=>{$("#mainViewer").cameraOrbit="0deg 75deg auto";$("#mainViewer").fieldOfView="auto"});
$("#toggleRotateButton").addEventListener("click",e=>{const v=$("#mainViewer");v.autoRotate=!v.autoRotate;e.currentTarget.textContent=`Otomatik döndür: ${v.autoRotate?"açık":"kapalı"}`});
$("#themeButton").addEventListener("click",()=>{const r=document.documentElement;const next=r.dataset.theme==="light"?"dark":"light";r.dataset.theme=next;localStorage.setItem("theme",next)});
const savedTheme=localStorage.getItem("theme");if(savedTheme)document.documentElement.dataset.theme=savedTheme;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredPrompt=e;$("#installButton").hidden=false});
$("#installButton").addEventListener("click",async()=>{if(!state.deferredPrompt)return;state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null;$("#installButton").hidden=true});
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
init().catch(err=>{console.error(err);gridEl.innerHTML='<div class="empty-state"><h3>Katalog yüklenemedi</h3><p>Dosyaları bir web sunucusu üzerinden açın.</p></div>'});
