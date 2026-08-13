const state={
  catalog:null,
  department:"all",
  query:"",
  deferredPrompt:null,
  activeModelId:null,
  viewerBusy:false,
  iosPage:0
};

const IOS_PAGE_SIZE=3;
const $=s=>document.querySelector(s);
const departmentsEl=$("#departmentFilters"),gridEl=$("#modelGrid"),emptyEl=$("#emptyState");

function platform(){
  const ua=navigator.userAgent||"";
  const ipadDesktop = navigator.platform==="MacIntel" && navigator.maxTouchPoints>1;
  if(/iPad|iPhone|iPod/.test(ua)||ipadDesktop) return "ios";
  if(/Android/.test(ua)) return "android";
  return "desktop";
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
    b.addEventListener("click",()=>{
      state.department=b.dataset.department;
      state.iosPage=0;
      renderFilters();
      renderModels();
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

function card(m){
  const poster=m.poster || "assets/images/icon.svg";
  return `<article class="model-card" data-id="${m.id}" tabindex="0">
    <div class="model-preview">
      <img
        src="${poster}"
        alt="${escapeHtml(m.title)} 3B model önizlemesi"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        onerror="this.onerror=null;this.src='assets/images/icon.svg';this.style.objectFit='scale-down';this.style.padding='18%';">
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

function ensurePager(){
  let pager=document.getElementById("iosPager");
  if(!pager){
    pager=document.createElement("div");
    pager.id="iosPager";
    pager.className="ios-pager";
    pager.innerHTML=`
      <button type="button" id="iosPrev">‹ Önceki</button>
      <span id="iosPageInfo">1 / 1</span>
      <button type="button" id="iosNext">Sonraki ›</button>
    `;
    gridEl.insertAdjacentElement("afterend",pager);

    pager.querySelector("#iosPrev").addEventListener("click",()=>{
      if(state.iosPage<=0) return;
      state.iosPage--;
      renderModels();
      scrollGridIntoView();
    });

    pager.querySelector("#iosNext").addEventListener("click",()=>{
      const total=filteredModels().length;
      const pages=Math.max(1,Math.ceil(total/IOS_PAGE_SIZE));
      if(state.iosPage>=pages-1) return;
      state.iosPage++;
      renderModels();
      scrollGridIntoView();
    });
  }
  return pager;
}

function scrollGridIntoView(){
  const y=gridEl.getBoundingClientRect().top+window.scrollY-90;
  window.scrollTo({top:Math.max(0,y),behavior:"smooth"});
}

function updatePager(total){
  const pager=ensurePager();
  if(platform()!=="ios"){
    pager.style.display="none";
    return;
  }

  pager.style.display="flex";
  const pages=Math.max(1,Math.ceil(total/IOS_PAGE_SIZE));
  state.iosPage=Math.min(state.iosPage,pages-1);

  pager.querySelector("#iosPageInfo").textContent=`${state.iosPage+1} / ${pages}`;
  pager.querySelector("#iosPrev").disabled=state.iosPage===0;
  pager.querySelector("#iosNext").disabled=state.iosPage>=pages-1;
}

function renderModels(){
  const all=filteredModels();
  let list=all;

  // iOS'ta DOM'da en fazla 3 büyük kart tutuyoruz.
  if(platform()==="ios"){
    const pages=Math.max(1,Math.ceil(all.length/IOS_PAGE_SIZE));
    if(state.iosPage>=pages) state.iosPage=pages-1;
    const start=state.iosPage*IOS_PAGE_SIZE;
    list=all.slice(start,start+IOS_PAGE_SIZE);
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

function openModel(id){
  const m=state.catalog.models.find(x=>x.id===id);
  if(!m) return;

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

function closeViewer(){
  const dialog=$("#viewerDialog");
  if(dialog.open) dialog.close();
  setTimeout(releaseViewer,80);
  history.replaceState(null,"",location.pathname);
}

async function init(){
  const res=await fetch("data/catalog.json",{cache:"no-store"});
  if(!res.ok) throw new Error(`catalog.json HTTP ${res.status}`);

  state.catalog=await res.json();
  $("#platformBadge").textContent=platformText();

  renderFilters();
  renderModels();

  const id=new URLSearchParams(location.search).get("model");
  if(id) setTimeout(()=>openModel(id),250);
}

$("#searchInput").addEventListener("input",e=>{
  state.query=e.target.value;
  state.iosPage=0;
  renderModels();
});

$("#dialogClose").addEventListener("click",closeViewer);
$("#viewerDialog").addEventListener("click",e=>{
  if(e.target===$("#viewerDialog")) closeViewer();
});
$("#viewerDialog").addEventListener("close",()=>{
  if(state.activeModelId) setTimeout(releaseViewer,80);
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
    navigator.serviceWorker.register("sw.js?v=14").then(reg=>reg.update()).catch(console.error);
  });
}

window.addEventListener("pagehide",releaseViewer);

init().catch(err=>{
  console.error(err);
  gridEl.innerHTML='<div class="empty-state"><h3>Katalog yüklenemedi</h3><p>Sayfayı yeniden yükleyin veya bağlantınızı kontrol edin.</p></div>';
});
