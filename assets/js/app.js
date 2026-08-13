const state={
  catalog:null,
  department:"all",
  query:"",
  deferredPrompt:null,
  activeModelId:null,
  viewerBusy:false,
  previewObserver:null,
  activePreviewIds:new Set()
};

const $=s=>document.querySelector(s);
const departmentsEl=$("#departmentFilters"),gridEl=$("#modelGrid"),emptyEl=$("#emptyState");

function platform(){
  const ua=navigator.userAgent||"";
  if(/iPad|iPhone|iPod/.test(ua)) return "ios";
  if(/Android/.test(ua)) return "android";
  return "desktop";
}

function isMobile(){
  const p=platform();
  return p==="ios" || p==="android";
}

function platformText(){
  const p=platform(), forced=new URLSearchParams(location.search).get("platform");
  if(forced==="ios"||p==="ios") return "iPhone algılandı • GLB ile Quick Look AR";
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

/*
  Kartların içinde model-viewer görünür durumda kalır, fakat src başlangıçta verilmez.
  GLB yalnızca kart ekranda gerçekten görünür olduğunda yüklenir.
  iOS/Android'de aynı anda yalnızca 1 kart önizlemesi tutulur.
  Kart ekrandan çıkınca src kaldırılır ve GPU/WebGL belleği serbest bırakılır.
*/
function card(m){
  return `<article class="model-card" data-id="${m.id}" tabindex="0">
    <div class="model-preview">
      <model-viewer
        class="card-viewer"
        data-model-id="${m.id}"
        alt="${escapeHtml(m.title)}"
        camera-orbit="45deg 70deg 2.6m"
        environment-image="neutral"
        tone-mapping="neutral"
        exposure="1.15"
        shadow-intensity="0"
        interaction-prompt="none"
        loading="eager"
        reveal="auto"
        style="width:100%;height:100%;background:transparent;">
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

function clearCardViewer(viewer){
  if(!viewer) return;
  try{
    if(typeof viewer.pause==="function") viewer.pause();
  }catch(_){}
  viewer.removeAttribute("src");
  const id=viewer.dataset.modelId;
  if(id) state.activePreviewIds.delete(id);
}

function clearAllCardPreviews(){
  gridEl.querySelectorAll(".card-viewer").forEach(clearCardViewer);
  state.activePreviewIds.clear();
}

function loadCardPreview(viewer){
  if(!viewer || viewer.hasAttribute("src")) return;
  const id=viewer.dataset.modelId;
  const m=state.catalog.models.find(x=>x.id===id);
  if(!m) return;

  // Telefonda sadece tek canlı kart önizlemesi tut.
  if(isMobile()){
    gridEl.querySelectorAll(".card-viewer").forEach(v=>{
      if(v!==viewer) clearCardViewer(v);
    });
  }

  viewer.setAttribute("src",m.glb);
  state.activePreviewIds.add(id);
}

function setupPreviewObserver(){
  if(state.previewObserver) state.previewObserver.disconnect();

  state.previewObserver=new IntersectionObserver(entries=>{
    // Mobilde ekranda en görünür kartı seç.
    if(isMobile()){
      const visible=entries
        .filter(e=>e.isIntersecting && e.intersectionRatio>0.08)
        .sort((a,b)=>b.intersectionRatio-a.intersectionRatio);

      if(visible.length){
        const viewer=visible[0].target.querySelector(".card-viewer");
        loadCardPreview(viewer);
      }

      entries.filter(e=>!e.isIntersecting).forEach(e=>{
        clearCardViewer(e.target.querySelector(".card-viewer"));
      });
      return;
    }

    // Masaüstünde yalnızca ekranda olan kartlar yüklü kalır.
    entries.forEach(entry=>{
      const viewer=entry.target.querySelector(".card-viewer");
      if(entry.isIntersecting && entry.intersectionRatio>0.05){
        loadCardPreview(viewer);
      }else{
        clearCardViewer(viewer);
      }
    });
  },{
    root:null,
    rootMargin:isMobile() ? "80px 0px" : "120px 0px",
    threshold:[0,0.05,0.1,0.25,0.5,0.75]
  });

  gridEl.querySelectorAll(".model-card").forEach(card=>state.previewObserver.observe(card));
}

function renderModels(){
  clearAllCardPreviews();

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
    c.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        openModel(c.dataset.id);
      }
    });
  });

  setupPreviewObserver();
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

  // Ana modeli açmadan önce kart önizlemelerinin tamamını boşalt.
  clearAllCardPreviews();

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

  setTimeout(()=>{
    releaseViewer();
    setupPreviewObserver();
  },100);

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
  renderModels();
});

$("#dialogClose").addEventListener("click",closeViewer);
$("#viewerDialog").addEventListener("click",e=>{
  if(e.target===$("#viewerDialog")) closeViewer();
});
$("#viewerDialog").addEventListener("close",()=>{
  if(state.activeModelId){
    setTimeout(()=>{
      releaseViewer();
      setupPreviewObserver();
    },100);
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
    navigator.serviceWorker.register("sw.js?v=12").then(reg=>reg.update()).catch(console.error);
  });
}

window.addEventListener("pagehide",()=>{
  clearAllCardPreviews();
  releaseViewer();
});

init().catch(err=>{
  console.error(err);
  gridEl.innerHTML='<div class="empty-state"><h3>Katalog yüklenemedi</h3><p>Sayfayı yeniden yükleyin veya bağlantınızı kontrol edin.</p></div>';
});
