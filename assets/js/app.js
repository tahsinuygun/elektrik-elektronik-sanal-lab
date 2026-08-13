const state={
  catalog:null,
  department:"all",
  query:"",
  deferredPrompt:null,
  activeModelId:null,
  viewerBusy:false,
  mobilePage:0,
  pageChanging:false
};

const MOBILE_PAGE_SIZE=3;
const $=s=>document.querySelector(s);
const departmentsEl=$("#departmentFilters"),gridEl=$("#modelGrid"),emptyEl=$("#emptyState");

function platform(){
  const ua=navigator.userAgent||"";
  const ipadDesktop = navigator.platform==="MacIntel" && navigator.maxTouchPoints>1;
  if(/iPad|iPhone|iPod/.test(ua)||ipadDesktop) return "ios";
  if(/Android/i.test(ua)) return "android";
  return "desktop";
}

function isMobile(){
  return platform()==="ios" || platform()==="android";
}

function platformText(){
  const p=platform(), forced=new URLSearchParams(location.search).get("platform");
  if(forced==="ios"||p==="ios") return "iPhone / iPad algılandı • Quick Look AR";
  if(forced==="android"||p==="android") return "Android algılandı • GLB ile AR";
  return "Masaüstü 3B görüntüleme";
}

function departmentName(id){
  return state.catalog.departments.find(d=>d.id===id)?.name||id;
}

function normalize(t){
  return (t||"").toLocaleLowerCase("tr-TR");
}

function escapeHtml(v){
  return String(v||"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}

function renderFilters(){
  const all=[{id:"all",name:"Tümü",icon:"◈"},...state.catalog.departments];

  departmentsEl.innerHTML=all.map(d=>
    `<button class="filter-button ${state.department===d.id?"active":""}" data-department="${d.id}" role="tab">${d.icon||""} ${d.name}</button>`
  ).join("");

  departmentsEl.querySelectorAll("button").forEach(b=>
    b.addEventListener("click",async()=>{
      if(state.pageChanging) return;
      releaseCardViewers();
      state.department=b.dataset.department;
      state.mobilePage=0;
      renderFilters();
      await renderModels(true);
    })
  );
}

function filteredModels(){
  return state.catalog.models.filter(m=>{
    const dep=state.department==="all"||m.department===state.department;
    const hay=[m.title,m.description,departmentName(m.department),...(m.tags||[])]
      .map(normalize).join(" ");
    return dep&&hay.includes(normalize(state.query));
  });
}

/*
  İstenen görünüm:
  Kartın içinde doğrudan gerçek GLB model-viewer bulunur.
  Poster, Mi logosu veya statik render kullanılmaz.

  Mobil kararlılık:
  iOS ve Android'de aynı anda yalnızca 3 kart DOM'dadır.
  Sonraki/Önceki geçişinde eski 3 model pause edilir, src kaldırılır,
  kısa bekleme sonrasında yeni 3 model yüklenir.
*/
function card(m){
  return `<article class="model-card" data-id="${m.id}" tabindex="0">
    <div class="model-preview">
      <model-viewer
        class="card-viewer"
        data-model-id="${m.id}"
        src="${m.glb}"
        alt="${escapeHtml(m.title)}"
        camera-orbit="45deg 70deg 2.6m"
        environment-image="neutral"
        tone-mapping="neutral"
        exposure="1.15"
        shadow-intensity="0"
        interaction-prompt="none"
        loading="eager"
        reveal="auto"
        disable-pan
        disable-zoom>
      </model-viewer>
      <div class="card-platforms"><span>${m.usdz ? "GLB + USDZ • AR" : "GLB • iOS/Android AR"}</span></div>
    </div>
    <div class="model-content">
      <small>${departmentName(m.department)}</small>
      <h3>${m.title}</h3>
      <p>${m.description}</p>
      <div class="card-bottom">
        <span>${(m.tags||[]).slice(0,2).join(" • ")}</span>
        <b class="open-circle">↗</b>
      </div>
    </div>
  </article>`;
}

function releaseCardViewers(){
  gridEl.querySelectorAll(".card-viewer").forEach(v=>{
    try{
      if(typeof v.pause==="function") v.pause();
    }catch(_){}
    v.removeAttribute("src");
    v.removeAttribute("ios-src");
  });
}

function ensurePager(){
  let pager=document.getElementById("mobilePager");

  if(!pager){
    pager=document.createElement("div");
    pager.id="mobilePager";
    pager.className="mobile-pager";
    pager.innerHTML=`
      <button type="button" id="mobilePrev">‹ Önceki</button>
      <span id="mobilePageInfo">1 / 1</span>
      <button type="button" id="mobileNext">Sonraki ›</button>
    `;
    gridEl.insertAdjacentElement("afterend",pager);

    pager.querySelector("#mobilePrev").addEventListener("click",()=>changeMobilePage(-1));
    pager.querySelector("#mobileNext").addEventListener("click",()=>changeMobilePage(1));
  }

  return pager;
}

async function changeMobilePage(delta){
  if(!isMobile() || state.pageChanging) return;

  const total=filteredModels().length;
  const pages=Math.max(1,Math.ceil(total/MOBILE_PAGE_SIZE));
  const next=state.mobilePage+delta;

  if(next<0 || next>=pages) return;

  state.pageChanging=true;
  updatePager(total);

  releaseCardViewers();
  gridEl.innerHTML="";

  // WebKit/Chromium'un eski WebGL kaynaklarını bırakması için kısa aralık.
  await wait(platform()==="ios" ? 320 : 180);

  state.mobilePage=next;
  await renderModels(false);
  scrollGridIntoView();

  // KRİTİK DÜZELTME:
  // v16'da renderModels() çalışırken pageChanging hâlâ true olduğu için
  // Önceki ve Sonraki butonları disabled kalıyordu.
  state.pageChanging=false;
  updatePager(total);
}

function scrollGridIntoView(){
  const y=gridEl.getBoundingClientRect().top+window.scrollY-90;
  window.scrollTo({top:Math.max(0,y),behavior:"smooth"});
}

function updatePager(total){
  const pager=ensurePager();

  if(!isMobile()){
    pager.style.display="none";
    return;
  }

  pager.style.display="flex";

  const pages=Math.max(1,Math.ceil(total/MOBILE_PAGE_SIZE));
  state.mobilePage=Math.min(Math.max(0,state.mobilePage),pages-1);

  pager.querySelector("#mobilePageInfo").textContent=`${state.mobilePage+1} / ${pages}`;
  pager.querySelector("#mobilePrev").disabled=(state.mobilePage===0) || state.pageChanging;
  pager.querySelector("#mobileNext").disabled=(state.mobilePage>=pages-1) || state.pageChanging;
}

async function renderModels(releaseFirst=false){
  if(releaseFirst){
    releaseCardViewers();
    gridEl.innerHTML="";
    await wait(platform()==="ios" ? 220 : 100);
  }

  const all=filteredModels();
  let list=all;

  if(isMobile()){
    const pages=Math.max(1,Math.ceil(all.length/MOBILE_PAGE_SIZE));
    if(state.mobilePage>=pages) state.mobilePage=pages-1;

    const start=state.mobilePage*MOBILE_PAGE_SIZE;
    list=all.slice(start,start+MOBILE_PAGE_SIZE);
  }

  gridEl.innerHTML=list.map(card).join("");
  emptyEl.hidden=all.length!==0;

  if(all.length===0){
    const hasQuery=Boolean(state.query.trim());
    const selected=state.department==="all" ? "" : departmentName(state.department);

    $("#emptyTitle").textContent=hasQuery
      ? "Aramanızla eşleşen model bulunamadı"
      : (selected ? `${selected} için henüz model yüklenmedi` : "Henüz model yüklenmedi");

    $("#emptyText").textContent=hasQuery
      ? "Arama kelimesini veya anabilim dalı seçimini değiştirin."
      : "GLB dosyasını ilgili anabilim dalı klasörüne yüklediğinizde model otomatik olarak burada görünür.";
  }

  gridEl.querySelectorAll(".model-card").forEach(c=>{
    c.addEventListener("click",()=>openModel(c.dataset.id));
    c.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        openModel(c.dataset.id);
      }
    });
  });

  updatePager(all.length);
}

function releaseViewer(){
  const v=$("#mainViewer");
  if(!v) return;

  try{
    if(typeof v.pause==="function") v.pause();
  }catch(_){}

  v.autoRotate=false;
  v.removeAttribute("src");
  v.removeAttribute("ios-src");

  state.activeModelId=null;
  state.viewerBusy=false;
}

async function openModel(id){
  if(state.viewerBusy) return;

  const m=state.catalog.models.find(x=>x.id===id);
  if(!m) return;

  // Ana model açılırken kartlardaki 3 GLB'yi GPU'dan çıkar.
  releaseCardViewers();
  await wait(platform()==="ios" ? 180 : 80);

  const v=$("#mainViewer");
  const arButton=v.querySelector('[slot="ar-button"]');
  const rotateButton=$("#toggleRotateButton");

  releaseViewer();
  state.viewerBusy=true;
  state.activeModelId=id;

  v.autoRotate=false;
  if(rotateButton) rotateButton.textContent="Otomatik döndür: kapalı";

  if(arButton){
    arButton.hidden=false;
    arButton.disabled=true;
    arButton.textContent="Model hazırlanıyor…";
  }

  const dialog=$("#viewerDialog");
  if(!dialog.open) dialog.showModal();

  const onLoad=()=>{
    state.viewerBusy=false;
    if(arButton){
      arButton.disabled=false;
      arButton.textContent="Gerçek ortamda görüntüle";
    }
  };

  const onError=()=>{
    state.viewerBusy=false;
    if(arButton){
      arButton.disabled=true;
      arButton.textContent="Model yüklenemedi";
    }
  };

  v.addEventListener("load",onLoad,{once:true});
  v.addEventListener("error",onError,{once:true});

  requestAnimationFrame(()=>{
    if(m.usdz){
      v.setAttribute("ios-src",m.usdz);
    }else{
      v.removeAttribute("ios-src");
    }
    v.setAttribute("src",m.glb);
  });

  history.replaceState(
    null,
    "",
    `${location.pathname}?model=${encodeURIComponent(id)}${platform()==="desktop"?"":`&platform=${platform()}`}`
  );
}

async function closeViewer(){
  const dialog=$("#viewerDialog");
  if(dialog.open) dialog.close();

  releaseViewer();
  await wait(platform()==="ios" ? 180 : 80);

  // Ana pencere kapanınca mevcut sayfanın 3 canlı önizlemesini geri getir.
  await renderModels(false);

  history.replaceState(null,"",location.pathname);
}

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function init(){
  console.info("EEM Sanal Lab build v20", {platform: platform()});
  const res=await fetch("data/catalog.json",{cache:"no-store"});
  if(!res.ok) throw new Error(`catalog.json HTTP ${res.status}`);

  state.catalog=await res.json();
  $("#platformBadge").textContent=platformText();

  renderFilters();
  await renderModels(false);

  const id=new URLSearchParams(location.search).get("model");
  if(id) setTimeout(()=>openModel(id),250);
}

let searchTimer=null;
$("#searchInput").addEventListener("input",e=>{
  state.query=e.target.value;
  state.mobilePage=0;

  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>renderModels(true),120);
});

$("#dialogClose").addEventListener("click",closeViewer);

$("#viewerDialog").addEventListener("click",e=>{
  if(e.target===$("#viewerDialog")) closeViewer();
});

$("#viewerDialog").addEventListener("close",()=>{
  if(state.activeModelId){
    releaseViewer();
  }
});

$("#howButton").addEventListener("click",()=>$("#howDialog").showModal());
$("#howClose").addEventListener("click",()=>$("#howDialog").close());

$("#resetViewButton").addEventListener("click",()=>{
  const v=$("#mainViewer");
  v.cameraOrbit="0deg 75deg auto";
  v.fieldOfView="auto";
});

$("#toggleRotateButton").addEventListener("click",e=>{
  const v=$("#mainViewer");
  v.autoRotate=!v.autoRotate;
  e.currentTarget.textContent=`Otomatik döndür: ${v.autoRotate?"açık":"kapalı"}`;
});

$("#themeButton").addEventListener("click",()=>{
  const r=document.documentElement;
  const next=r.dataset.theme==="light"?"dark":"light";
  r.dataset.theme=next;
  localStorage.setItem("theme",next);
});

const savedTheme=localStorage.getItem("theme");
if(savedTheme) document.documentElement.dataset.theme=savedTheme;

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  state.deferredPrompt=e;
  $("#installButton").hidden=false;
});

$("#installButton").addEventListener("click",async()=>{
  if(!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt=null;
  $("#installButton").hidden=true;
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("sw.js?v=20")
      .then(reg=>reg.update())
      .catch(console.error);
  });
}

window.addEventListener("pagehide",()=>{
  releaseCardViewers();
  releaseViewer();
});

init().catch(err=>{
  console.error(err);
  gridEl.innerHTML='<div class="empty-state"><h3>Katalog yüklenemedi</h3><p>Sayfayı yeniden yükleyin veya bağlantınızı kontrol edin.</p></div>';
});
