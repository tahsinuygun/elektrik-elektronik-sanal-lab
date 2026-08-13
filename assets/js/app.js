const state={
  catalog:null,
  department:"all",
  query:"",
  deferredPrompt:null,
  activeModelId:null,
  viewerBusy:false,
  thumbBusy:false,
  thumbQueue:[],
  thumbDone:new Set(),
  thumbObjectUrls:new Map()
};

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

function departmentName(id){
  return state.catalog.departments.find(d=>d.id===id)?.name||id;
}

function normalize(t){
  return (t||"").toLocaleLowerCase("tr-TR");
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
  Kartlarda sürekli çalışan 3B sahne yoktur.
  Önizleme gerektiğinde TEK bir gizli model-viewer, ilgili GLB'yi sırayla yükler,
  statik PNG görüntüsü üretir ve GLB kaynağını hemen bırakır.
  Böylece kullanıcı kartta gerçek model görünümünü görür; fakat sayfa kaydırılırken
  aynı anda çok sayıda WebGL sahnesi ve ağır doku GPU belleğinde tutulmaz.
*/
function card(m){
  return `<article class="model-card" data-id="${m.id}" tabindex="0">
    <div class="model-preview">
      <img class="model-thumb" data-thumb-id="${m.id}" alt="${escapeHtml(m.title)} önizlemesi"
        style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:none;background:transparent;">
      <div class="thumb-placeholder" data-placeholder-id="${m.id}"
        style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;opacity:.82">
        <img src="assets/images/icon.svg" alt="" aria-hidden="true" style="width:58px;height:58px;object-fit:contain;opacity:.75">
        <span style="font-size:.78rem;font-weight:800;letter-spacing:.02em;opacity:.7">ÖNİZLEME HAZIRLANIYOR</span>
      </div>
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

function escapeHtml(v){
  return String(v||"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}

let thumbObserver=null;

function setupThumbObserver(){
  if(thumbObserver) thumbObserver.disconnect();

  thumbObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting) continue;
      const card=entry.target;
      const id=card.dataset.id;
      if(!state.thumbDone.has(id)) enqueueThumb(id);
      thumbObserver.unobserve(card);
    }
  },{
    root:null,
    rootMargin:"350px 0px",
    threshold:0.01
  });

  gridEl.querySelectorAll(".model-card").forEach(card=>thumbObserver.observe(card));
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
    c.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        openModel(c.dataset.id);
      }
    });
  });

  // Daha önce bu oturumda üretilmiş önizlemeleri yeni filtre görünümüne geri uygula.
  for(const [id,url] of state.thumbObjectUrls.entries()){
    applyThumb(id,url);
  }

  setupThumbObserver();
}

function ensureThumbRenderer(){
  let r=document.getElementById("thumbRenderer");
  if(r) return r;

  r=document.createElement("model-viewer");
  r.id="thumbRenderer";
  r.setAttribute("environment-image","neutral");
  r.setAttribute("tone-mapping","neutral");
  r.setAttribute("exposure","1.15");
  r.setAttribute("shadow-intensity","0.15");
  r.setAttribute("interaction-prompt","none");
  r.setAttribute("camera-orbit","35deg 70deg auto");
  r.style.cssText=[
    "position:fixed",
    "left:-10000px",
    "top:0",
    "width:420px",
    "height:300px",
    "pointer-events:none",
    "opacity:0.001",
    "z-index:-1",
    "background:transparent"
  ].join(";");

  document.body.appendChild(r);
  return r;
}

function enqueueThumb(id){
  if(state.thumbDone.has(id)) return;
  if(state.thumbQueue.includes(id)) return;
  state.thumbQueue.push(id);
  processThumbQueue();
}

async function processThumbQueue(){
  if(state.thumbBusy) return;
  if(state.activeModelId || $("#viewerDialog").open) return;
  const id=state.thumbQueue.shift();
  if(!id) return;

  const m=state.catalog.models.find(x=>x.id===id);
  if(!m){
    processThumbQueue();
    return;
  }

  state.thumbBusy=true;
  const r=ensureThumbRenderer();

  try{
    // Önce önceki kaynağı tamamen bırak.
    try{ if(typeof r.pause==="function") r.pause(); }catch(_){}
    r.removeAttribute("src");
    r.removeAttribute("ios-src");

    await wait(70);

    const loaded=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Önizleme zaman aşımı")),22000);

      const ok=()=>{
        clearTimeout(timer);
        cleanup();
        resolve();
      };
      const bad=()=>{
        clearTimeout(timer);
        cleanup();
        reject(new Error("Önizleme modeli yüklenemedi"));
      };
      const cleanup=()=>{
        r.removeEventListener("load",ok);
        r.removeEventListener("error",bad);
      };

      r.addEventListener("load",ok,{once:true});
      r.addEventListener("error",bad,{once:true});
    });

    r.setAttribute("src",m.glb);
    await loaded;

    // Dokuların son render karesine yerleşmesi için kısa süre bekle.
    await wait(220);

    if(typeof r.toBlob!=="function") throw new Error("toBlob desteklenmiyor");

    const blob=await r.toBlob();

    if(blob){
      const old=state.thumbObjectUrls.get(id);
      if(old) URL.revokeObjectURL(old);

      const url=URL.createObjectURL(blob);
      state.thumbObjectUrls.set(id,url);
      state.thumbDone.add(id);
      applyThumb(id,url);
    }
  }catch(err){
    console.warn("Önizleme üretilemedi:",id,err);
    const ph=document.querySelector(`[data-placeholder-id="${cssEscape(id)}"] span`);
    if(ph) ph.textContent="3B MODELİ AÇ";
  }finally{
    try{ if(typeof r.pause==="function") r.pause(); }catch(_){}
    r.removeAttribute("src");
    r.removeAttribute("ios-src");
    state.thumbBusy=false;

    // iOS GPU/WebGL kaynağını bırakabilsin; sonraki modeli hemen yükleme.
    setTimeout(processThumbQueue,350);
  }
}

function applyThumb(id,url){
  const img=document.querySelector(`[data-thumb-id="${cssEscape(id)}"]`);
  const ph=document.querySelector(`[data-placeholder-id="${cssEscape(id)}"]`);
  if(!img) return;

  img.onload=()=>{
    img.style.display="block";
    if(ph) ph.style.display="none";
  };
  img.src=url;

  if(img.complete){
    img.style.display="block";
    if(ph) ph.style.display="none";
  }
}

function cssEscape(v){
  if(window.CSS && typeof CSS.escape==="function") return CSS.escape(String(v));
  return String(v).replace(/["\\]/g,"\\$&");
}

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

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

  // Önizleme üretimini durdur; aynı anda iki ağır 3B model yüklenmesin.
  state.thumbQueue=state.thumbQueue.filter(x=>x!==id);

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
    processThumbQueue();
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
      processThumbQueue();
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
    navigator.serviceWorker.register("sw.js?v=11").then(reg=>reg.update()).catch(console.error);
  });
}

window.addEventListener("pagehide",()=>{
  releaseViewer();
  const r=document.getElementById("thumbRenderer");
  if(r){
    try{ if(typeof r.pause==="function") r.pause(); }catch(_){}
    r.removeAttribute("src");
  }
  for(const url of state.thumbObjectUrls.values()) URL.revokeObjectURL(url);
});

init().catch(err=>{
  console.error(err);
  gridEl.innerHTML='<div class="empty-state"><h3>Katalog yüklenemedi</h3><p>Sayfayı yeniden yükleyin veya bağlantınızı kontrol edin.</p></div>';
});
