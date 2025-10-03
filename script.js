const STATE = {
  allItems: [],
  filtered: [],
  skin: "all",
  types: new Set([
    "splash","icon","promo","concept",
    "loading","model","model-face",
    "chroma","form","video","youtube"
  ]),
  tags: new Set(),
  search: "",
  sortBy: "skin",
  tab: "gallery",
};

const TYPE_LABEL = {
  splash: "Splash",
  icon: "Icon",
  promo: "Promo",
  concept: "Concept",
  loading: "Loading",
  model: "3D Model",
  "model-face": "3D Face",
  chroma: "Chroma",
  form: "Form",
  video: "Video",
  youtube: "YouTube",
};

const TAG_LABEL = {
  tft: "TFT",
  wr: "Wild Rift",
  lor: "Legends of Runeterra",
  chroma: "Chroma",
  form: "Form",
};

const els = {
  skinFilter: document.getElementById("skinFilter"),
  typeChecks: () => [...document.querySelectorAll('input[name="type"]')],
  tagChecks:  () => [...document.querySelectorAll('input[name="tag"]')],
  search: document.getElementById("search"),
  sortBy: document.getElementById("sortBy"),
  gallery: document.getElementById("gallery"),
  files: document.getElementById("files"),
  filesTree: document.getElementById("filesTree"),
  empty: document.getElementById("empty"),
  tabs: () => [...document.querySelectorAll(".tab")],
  themeToggle: document.getElementById("themeToggle"),
  viewer: document.getElementById("viewer"),
  themeMeta: document.getElementById("themeColorMeta"),
};

init().catch(console.error);

async function init(){
  hydrateTheme();
  wireUI();
  await loadManifest();
  renderFilters();
  applyFilters();
}

function hydrateTheme(){
  const saved = localStorage.getItem("theme");
  if(saved) document.documentElement.setAttribute("data-theme", saved);
  els.themeMeta?.setAttribute("content", (document.documentElement.getAttribute("data-theme")==="dark") ? "#0b0f14" : "#f6f9ff");

  els.themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    els.themeMeta?.setAttribute("content", next === "dark" ? "#0b0f14" : "#f6f9ff");
  });
}

function wireUI(){
  els.skinFilter.addEventListener("change", e => { STATE.skin = e.target.value; applyFilters(); });
  els.typeChecks().forEach(cb => cb.addEventListener("change", ev => {
    const c = ev.currentTarget;
    if(c.checked) STATE.types.add(c.value); else STATE.types.delete(c.value);
    applyFilters();
  }));
  els.tagChecks().forEach(cb => cb.addEventListener("change", ev => {
    const c = ev.currentTarget;
    if(c.checked) STATE.tags.add(c.value); else STATE.tags.delete(c.value);
    applyFilters();
  }));
  els.search.addEventListener("input", e => { STATE.search = e.target.value.trim().toLowerCase(); applyFilters(); });
  els.sortBy.addEventListener("change", e => { STATE.sortBy = e.target.value; applyFilters(); });
  els.tabs().forEach(btn => btn.addEventListener("click", onTab));
  document.addEventListener("keydown", e => { if(e.key === "Escape" && els.viewer.open) els.viewer.close(); });
}

function onTab(e){
  const tab = e.currentTarget.dataset.tab;
  STATE.tab = tab;

  els.tabs().forEach(t => {
    const is = t.dataset.tab === tab;
    t.classList.toggle("active", is);
    t.setAttribute("aria-selected", String(is));
  });

  const galleryActive = tab === "gallery";
  els.gallery.hidden = !galleryActive;
  els.files.hidden = galleryActive;
  if(!galleryActive){
    renderFilesTree();
  }

  els.empty.hidden = !(galleryActive && STATE.filtered.length === 0);
}

async function loadManifest(){
  try{
    const res = await fetch("data/manifest.json", { cache: "no-store" });
    if(!res.ok) throw new Error(`manifest ${res.status}`);
    const data = await res.json();

    const items = [];
    for(const skin of data.skins || []){
      const skinId = skin.id;
      const skinName = skin.name || skinId;
      const year = skin.release_year || null;

      for(const m of skin.media || []){
        const tags = normalizeTags(m.tags || []);
        if(m.type === "chroma" && !tags.includes("chroma")) tags.push("chroma");
        if(m.type === "form"   && !tags.includes("form"))   tags.push("form");

        items.push({
          skinId,
          skinName,
          year,
          type: m.type,
          title: m.title || inferTitleFromPath(m.path, m.youtubeId),
          path: m.path || null,
          youtubeId: m.youtubeId || null,
          thumb: m.thumb || null,
          tags
        });
      }
    }
    STATE.allItems = items;
  }catch(err){
    console.warn("Failed to load manifest:", err);
    STATE.allItems = [];
  }
}

function renderFilters(){
  const skins = Array.from(new Set(STATE.allItems.map(i => i.skinId)))
    .map(id => ({
      id,
      name: STATE.allItems.find(x => x.skinId === id)?.skinName || id
    }))
    .sort((a,b)=>a.name.localeCompare(b.name));
  for(const s of skins){
    const opt = document.createElement("option");
    opt.value = s.id; opt.textContent = s.name;
    els.skinFilter.appendChild(opt);
  }
}

function applyFilters(){
  let out = STATE.allItems.slice();

  if(STATE.skin !== "all") out = out.filter(i => i.skinId === STATE.skin);
  out = out.filter(i => STATE.types.has(i.type));

  if(STATE.tags.size > 0){
    out = out.filter(i => {
      const t = new Set(i.tags || []);
      for(const need of STATE.tags) if(!t.has(need)) return false;
      return true;
    });
  }

  if(STATE.search){
    const q = STATE.search;
    out = out.filter(i =>
      (i.title||"").toLowerCase().includes(q) ||
      (i.skinName||"").toLowerCase().includes(q) ||
      (i.type||"").toLowerCase().includes(q) ||
      String(i.year||"").includes(q) ||
      (i.tags||[]).join(" ").toLowerCase().includes(q)
    );
  }

  switch(STATE.sortBy){
    case "title": out.sort((a,b)=> (a.title||"").localeCompare(b.title||"")); break;
    case "type":  out.sort((a,b)=> (TYPE_LABEL[a.type]||a.type).localeCompare(TYPE_LABEL[b.type]||b.type)); break;
    case "year":  out.sort((a,b)=> (b.year||0)-(a.year||0) || (a.title||"").localeCompare(b.title||"")); break;
    default:
      out.sort((a,b)=> (a.skinName||"").localeCompare(b.skinName||"")
        || (TYPE_LABEL[a.type]||a.type).localeCompare(TYPE_LABEL[b.type]||b.type)
        || (a.title||"").localeCompare(b.title||""));
  }

  STATE.filtered = out;
  renderGallery();

  els.empty.hidden = !(STATE.tab === "gallery" && out.length === 0);
}

function renderGallery(){
  const g = els.gallery;
  g.innerHTML = "";
  const frag = document.createDocumentFragment();

  for(const item of STATE.filtered){
    const card = document.createElement("article");
    card.className = "card";

    let mediaEl;

    if(item.type === "video" && item.path){
      mediaEl = document.createElement("video");
      mediaEl.className = "thumb";
      mediaEl.controls = true;
      mediaEl.preload = "metadata";
      mediaEl.playsInline = true;
      mediaEl.src = item.path;
      mediaEl.setAttribute("title", item.title);
    } else if(item.type === "youtube" && item.youtubeId){
      const btn = document.createElement("button");
      btn.className = "thumb";
      btn.style.display = "block";
      btn.style.position = "relative";
      btn.style.cursor = "pointer";
      btn.setAttribute("aria-label", "Play YouTube video");
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = item.title;
      img.loading = "lazy";
      img.src = `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`;
      btn.appendChild(img);
      const play = document.createElement("div");
      play.style.position="absolute"; play.style.inset="0"; play.style.display="grid"; play.style.placeItems="center";
      play.innerHTML = '<div style="width:68px;height:48px;background:rgba(0,0,0,.6);border-radius:10px;display:grid;place-items:center;"><svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></div>';
      btn.appendChild(play);
      btn.addEventListener("click", () => openViewer(item));
      mediaEl = btn;
    } else {
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = item.title;
      img.loading = "lazy";
      img.decoding = "async";
      img.src = item.thumb || item.path || "";
      img.addEventListener("click", () => openViewer(item));
      mediaEl = img;
    }

    card.appendChild(mediaEl);

    const meta = document.createElement("div");
    meta.className = "meta";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title || "Untitled";
    left.appendChild(title);

    const badges = document.createElement("div"); badges.className = "badges";
    badges.innerHTML = `
      <span class="badge">${escapeHtml(item.skinName)}</span>
      <span class="badge">${escapeHtml(TYPE_LABEL[item.type] || item.type)}</span>
      ${item.year ? `<span class="badge">${item.year}</span>` : ""}
      ${(item.tags||[]).map(t => `<span class="badge">${escapeHtml(TAG_LABEL[t] || t)}</span>`).join("")}
    `;
    left.appendChild(badges);

    const actions = document.createElement("div"); actions.className = "actions";
    if(item.path){
      const rawLink = document.createElement("a");
      rawLink.className = "action";
      rawLink.href = item.path;
      rawLink.target = "_blank"; rawLink.rel = "noopener";
      rawLink.textContent = "Open raw";
      actions.appendChild(rawLink);
    }
    if(item.youtubeId){
      const y = document.createElement("a");
      y.className = "action";
      y.href = `https://www.youtube.com/watch?v=${item.youtubeId}`;
      y.target = "_blank"; y.rel = "noopener";
      y.textContent = "Open on YouTube";
      actions.appendChild(y);
    }

    meta.appendChild(left);
    meta.appendChild(actions);
    card.appendChild(meta);

    frag.appendChild(card);
  }

  g.appendChild(frag);
}

function openViewer(item){
  const dlg = els.viewer;
  const wrap = dlg.querySelector(".viewer-content");
  wrap.innerHTML = "";

  let media;
  if(item.type === "video" && item.path){
    media = document.createElement("video");
    media.className = "viewer-media";
    media.controls = true; media.autoplay = true; media.src = item.path; media.playsInline = true;
  } else if(item.type === "youtube" && item.youtubeId){
    const iframe = document.createElement("iframe");
    iframe.className = "viewer-media";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.src = `https://www.youtube.com/embed/${item.youtubeId}?autoplay=1`;
    media = iframe;
  } else {
    media = document.createElement("img");
    media.className = "viewer-media";
    media.alt = item.title;
    media.src = item.path || item.thumb || "";
  }

  const caption = document.createElement("div");
  caption.className = "viewer-caption";
  caption.innerHTML = `
    <div class="left">
      <strong>${escapeHtml(item.title || "")}</strong>
      <span class="badge">${escapeHtml(item.skinName)}</span>
      <span class="badge">${escapeHtml(TYPE_LABEL[item.type] || item.type)}</span>
      ${item.year ? `<span class="badge">${item.year}</span>` : ""}
      ${(item.tags||[]).map(t => `<span class="badge">${escapeHtml(TAG_LABEL[t] || t)}</span>`).join("")}
    </div>
    <div class="right">
      ${item.path ? `<a class="action" target="_blank" rel="noopener" href="${item.path}">Open raw</a>` : ""}
      ${item.youtubeId ? `<a class="action" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${item.youtubeId}">YouTube</a>` : ""}
    </div>
  `;

  wrap.appendChild(media);
  wrap.appendChild(caption);

  const closeBtn = dlg.querySelector(".viewer-close");
  closeBtn.onclick = () => dlg.close();
  if(!dlg.open) dlg.showModal();
}

function renderFilesTree(){
  const bySkin = groupBy(STATE.allItems, i => i.skinName);
  const container = els.filesTree;
  container.innerHTML = "";

  for(const [skin, items] of bySkin){
    const skinNode = mkNode(skin);
    const byType = groupBy(items, i => TYPE_LABEL[i.type] || i.type);
    for(const [type, arr] of byType){
      const typeNode = mkNode(type);
      for(const it of arr){
        const leaf = document.createElement("div");
        leaf.className = "node";
        const name = it.path ? it.path.split("/").slice(-1)[0] : (it.youtubeId || it.title);
        leaf.innerHTML = `
          <span>${escapeHtml(name)}</span>
          <span class="file-actions">
            ${it.path ? `<a href="${it.path}" target="_blank" rel="noopener">open</a>` : ""}
            ${it.youtubeId ? `<a href="https://www.youtube.com/watch?v=${it.youtubeId}" target="_blank" rel="noopener">youtube</a>` : ""}
            ${it.path ? `<button class="copy" data-text="${it.path}">copy path</button>` : ""}
          </span>
        `;
        typeNode.appendChild(leaf);
      }
      skinNode.appendChild(typeNode);
    }
    container.appendChild(skinNode);
  }

  container.querySelectorAll("button.copy").forEach(btn=>{
    btn.addEventListener("click", async e=>{
      const t = e.currentTarget.getAttribute("data-text");
      try{
        const base = location.origin + location.pathname.replace(/index\.html?$/,"");
        await navigator.clipboard.writeText(base + t.replace(/^\.\//,""));
        e.currentTarget.textContent="copied";
        setTimeout(()=>e.currentTarget.textContent="copy path",1200);
      }catch{}
    });
  });

  function mkNode(label){
    const d = document.createElement("div");
    d.className = "node";
    d.innerHTML = `<strong>${escapeHtml(label)}</strong>`;
    return d;
  }
}

function groupBy(arr, keyFn){
  const map = new Map();
  for(const item of arr){
    const key = keyFn(item);
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function inferTitleFromPath(p, yt){
  if(yt) return `YouTube ${yt}`;
  if(!p) return "";
  const base = p.split("/").pop() || p;
  return base.replace(/\.[a-z0-9]+$/i,"").replace(/[-_]/g," ");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function normalizeTags(arr){
  const set = new Set();
  for(const t of (arr||[])){
    if(!t) continue;
    set.add(String(t).toLowerCase());
  }
  return [...set];
}
