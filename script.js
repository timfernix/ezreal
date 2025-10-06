const STATE = {
  allItems: [],
  filtered: [],
  skin: "all",
  types: new Set([
    "splash",
    "icon",
    "promo",
    "concept",
    "loading",
    "model",
    "model-face",
    "chroma",
    "video",
    "youtube",
    "emote",
    "tenor",
    "other",
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
  model: "Model",
  "model-face": "Face",
  chroma: "Chroma",
  video: "Video",
  youtube: "YouTube",
  tenor: "Tenor",
  emote: "Emote",
  other: "Other",
};

const TAG_LABEL = {
  tft: "TFT",
  wr: "Wild Rift",
  lor: "Legends of Runeterra",
  chroma: "Chroma",
};

const TAG_HINT = {
  tft: "Asset from Teamfight Tactics",
  wr: "Asset from Wild Rift",
  lor: "Asset from Legends of Runeterra",
  chroma: "Chroma variant",
};

function renderBadgesHTML(item) {
  const yearTip = "Release year of the base skin";
  const parts = [
    `<span class="badge" title="Skin">${escapeHtml(item.skinName)}</span>`,
    `<span class="badge" title="Type">${escapeHtml(
      TYPE_LABEL[item.type] || item.type
    )}</span>`,
    item.year
      ? `<span class="badge" title="${escapeHtml(yearTip)}">${item.year}</span>`
      : "",
  ];
  const tags = (item.tags || []).map((t) => {
    const label = TAG_LABEL[t] || t;
    const tip = TAG_HINT[t] ? TAG_HINT[t] : `Tag: ${label}`;
    return `<span class="badge" title="${escapeHtml(tip)}">${escapeHtml(
      label
    )}</span>`;
  });
  return parts.concat(tags).join("");
}

const els = {
  skinFilter: document.getElementById("skinFilter"),
  typeChecks: () => [...document.querySelectorAll('input[name="type"]')],
  tagChecks: () => [...document.querySelectorAll('input[name="tag"]')],
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
  counts: document.getElementById("counts"),
};

init().catch(console.error);

async function init() {
  hydrateTheme();
  wireUI();

  if (!els.counts) {
    const mount = document.createElement("div");
    mount.id = "counts";
    mount.className = "counts";
    mount.setAttribute("aria-live", "polite");
    mount.setAttribute("aria-atomic", "true");
    document.querySelector(".controls")?.appendChild(mount);
    els.counts = mount;
  }

  await loadManifest();
  renderFilters();
  applyFilters();
}

function hydrateTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  els.themeMeta?.setAttribute(
    "content",
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "#0b0f14"
      : "#f6f9ff"
  );

  els.themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    els.themeMeta?.setAttribute(
      "content",
      next === "dark" ? "#0b0f14" : "#f6f9ff"
    );
  });
}

function wireUI() {
  els.skinFilter.addEventListener("change", (e) => {
    STATE.skin = e.target.value;
    applyFilters();
  });
  els.typeChecks().forEach((cb) =>
    cb.addEventListener("change", (ev) => {
      const c = ev.currentTarget;
      if (c.checked) STATE.types.add(c.value);
      else STATE.types.delete(c.value);
      applyFilters();
    })
  );
  els.tagChecks().forEach((cb) =>
    cb.addEventListener("change", (ev) => {
      const c = ev.currentTarget;
      if (c.checked) STATE.tags.add(c.value);
      else STATE.tags.delete(c.value);
      applyFilters();
    })
  );
  els.search.addEventListener("input", (e) => {
    STATE.search = e.target.value.trim().toLowerCase();
    applyFilters();
  });
  els.sortBy.addEventListener("change", (e) => {
    STATE.sortBy = e.target.value;
    applyFilters();
  });
  els.tabs().forEach((btn) => btn.addEventListener("click", onTab));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.viewer.open) els.viewer.close();
  });
}

function onTab(e) {
  const tab = e.currentTarget.dataset.tab;
  STATE.tab = tab;

  els.tabs().forEach((t) => {
    const is = t.dataset.tab === tab;
    t.classList.toggle("active", is);
    t.setAttribute("aria-selected", String(is));
  });

  const galleryActive = tab === "gallery";
  els.gallery.hidden = !galleryActive;
  els.files.hidden = galleryActive;
  if (!galleryActive) {
    renderFilesTree();
  }

  els.empty.hidden = !(galleryActive && STATE.filtered.length === 0);
  renderCounts();
}

async function loadManifest() {
  try {
    const res = await fetch("data/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const data = await res.json();

    const items = [];
    for (const skin of data.skins || []) {
      const skinId = skin.id;
      const skinName = skin.name || skinId;
      const year = skin.release_year || null;

      for (const m of skin.media || []) {
        const rawType = m.type;
        const type = rawType === "form" ? "other" : rawType; // legacy remap

        const tagsRaw = normalizeTags(m.tags || []);
        const tags = tagsRaw.filter((t) => t !== "form"); // purge legacy tag
        if (type === "chroma" && !tags.includes("chroma")) tags.push("chroma");

        const tenorId =
          type === "tenor"
            ? m.tenorId || extractTenorId(m.url || m.path || "")
            : null;
        const tenorUrl =
          type === "tenor"
            ? m.url || (tenorId ? `https://tenor.com/view/${tenorId}` : null)
            : null;

        items.push({
          skinId,
          skinName,
          year,
          type,
          title: cleanTitle(
            m.title ||
              inferTitleFromPath(m.path || m.url, m.youtubeId || tenorId)
          ),
          path: m.path || null,
          youtubeId: type === "youtube" ? m.youtubeId || null : null,
          tenorId,
          tenorUrl,
          thumb: m.thumb || null,
          tags,
        });
      }
    }
    STATE.allItems = items;
    renderCounts();
  } catch (err) {
    console.warn("Failed to load manifest:", err);
    STATE.allItems = [];
    renderCounts();
  }
}

function renderFilters() {
  const skins = Array.from(new Set(STATE.allItems.map((i) => i.skinId)))
    .map((id) => ({
      id,
      name: STATE.allItems.find((x) => x.skinId === id)?.skinName || id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const s of skins) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    els.skinFilter.appendChild(opt);
  }
}

function applyFilters() {
  let out = STATE.allItems.slice();

  if (STATE.skin !== "all") out = out.filter((i) => i.skinId === STATE.skin);
  out = out.filter((i) => STATE.types.has(i.type));

  if (STATE.tags.size > 0) {
    out = out.filter((i) => {
      const t = new Set(i.tags || []);
      for (const need of STATE.tags) if (!t.has(need)) return false;
      return true;
    });
  }

  if (STATE.search) {
    const q = STATE.search;
    out = out.filter(
      (i) =>
        (i.title || "").toLowerCase().includes(q) ||
        (i.skinName || "").toLowerCase().includes(q) ||
        (i.type || "").toLowerCase().includes(q) ||
        String(i.year || "").includes(q) ||
        (i.tags || []).join(" ").toLowerCase().includes(q)
    );
  }

  switch (STATE.sortBy) {
    case "title":
      out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      break;
    case "type":
      out.sort((a, b) =>
        (TYPE_LABEL[a.type] || a.type).localeCompare(
          TYPE_LABEL[b.type] || b.type
        )
      );
      break;
    case "year":
      out.sort(
        (a, b) =>
          (b.year || 0) - (a.year || 0) ||
          (a.title || "").localeCompare(b.title || "")
      );
      break;
    default:
      out.sort(
        (a, b) =>
          (a.skinName || "").localeCompare(b.skinName || "") ||
          (TYPE_LABEL[a.type] || a.type).localeCompare(
            TYPE_LABEL[b.type] || b.type
          ) ||
          (a.title || "").localeCompare(b.title || "")
      );
  }

  STATE.filtered = out;
  renderGallery();

  els.empty.hidden = !(STATE.tab === "gallery" && out.length === 0);
  renderCounts();
}

function renderGallery() {
  const g = els.gallery;
  g.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const item of STATE.filtered) {
    const card = document.createElement("article");
    card.className = "card";

    let mediaEl;

    if (item.type === "video" && item.path) {
      const v = document.createElement("video");
      v.className = "thumb";
      v.controls = true;
      v.preload = "metadata";
      v.playsInline = true;
      v.src = buildAbsoluteUrl(item.path);
      v.title = item.title;
      mediaEl = v;
    } else if (item.type === "youtube" && item.youtubeId) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.style.position = "relative";
      btn.style.cursor = "pointer";
      btn.setAttribute(
        "aria-label",
        `Play on YouTube: ${item.title || item.youtubeId}`
      );

      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = item.title || "YouTube";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = buildAbsoluteUrl(
        item.thumb || `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`
      );
      btn.appendChild(img);

      const play = document.createElement("div");
      play.style.position = "absolute";
      play.style.inset = "0";
      play.style.display = "grid";
      play.style.placeItems = "center";
      play.innerHTML =
        '<div style="width:68px;height:48px;background:rgba(0,0,0,.6);border-radius:10px;display:grid;place-items:center;">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        "</div>";
      btn.appendChild(play);

      btn.addEventListener("click", () => openViewer(item));
      mediaEl = btn;
    } else if (item.type === "tenor" && (item.tenorId || item.tenorUrl)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.style.position = "relative";
      btn.style.cursor = "pointer";
      btn.setAttribute(
        "aria-label",
        `Open Tenor: ${item.title || item.tenorId || ""}`
      );

      if (item.thumb) {
        const img = document.createElement("img");
        img.className = "thumb";
        img.alt = item.title || "Tenor GIF";
        img.loading = "lazy";
        img.decoding = "async";
        img.src = buildAbsoluteUrl(item.thumb);
        btn.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "thumb";
        ph.style.display = "grid";
        ph.style.placeItems = "center";
        ph.style.fontWeight = "700";
        ph.style.letterSpacing = "0.5px";
        ph.textContent = "TENOR GIF";
        btn.appendChild(ph);
      }

      const badge = document.createElement("div");
      badge.style.position = "absolute";
      badge.style.right = "10px";
      badge.style.bottom = "8px";
      badge.style.padding = ".25rem .5rem";
      badge.style.borderRadius = "999px";
      badge.style.background = "rgba(0,0,0,.55)";
      badge.style.color = "#fff";
      badge.style.fontSize = ".78rem";
      badge.textContent = "Open";
      btn.appendChild(badge);

      btn.addEventListener("click", () => openViewer(item));
      mediaEl = btn;
    } else {
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = item.title || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = buildAbsoluteUrl(item.thumb || item.path || "");
      img.addEventListener("click", () => openViewer(item));
      mediaEl = img;
    }

    if (!(mediaEl instanceof Node)) {
      console.warn("Skipping item with invalid media node:", item);
      continue;
    }
    card.appendChild(mediaEl);

    const meta = document.createElement("div");
    meta.className = "meta";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = item.title || "Untitled";
    left.appendChild(title);

    const badges = document.createElement("div");
    badges.className = "badges";
    badges.innerHTML = renderBadgesHTML(item);
    left.appendChild(badges);

    const actions = document.createElement("div");
    actions.className = "actions";

    if (item.path) {
      const rawLink = document.createElement("a");
      rawLink.className = "action";
      rawLink.href = buildAbsoluteUrl(item.path);
      rawLink.target = "_blank";
      rawLink.rel = "noopener";
      rawLink.textContent = "Open raw";
      actions.appendChild(rawLink);

      const copyBtn = document.createElement("button");
      copyBtn.className = "action js-copy";
      copyBtn.type = "button";
      copyBtn.textContent = "Copy path";
      copyBtn.addEventListener("click", async () => {
        const url = buildAbsoluteUrl(item.path);
        try {
          await navigator.clipboard.writeText(url);
        } catch {}
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
      });
      actions.appendChild(copyBtn);
    }

    if (item.youtubeId) {
      const y = document.createElement("a");
      y.className = "action";
      y.href = `https://www.youtube.com/watch?v=${item.youtubeId}`;
      y.target = "_blank";
      y.rel = "noopener";
      y.textContent = "YouTube";
      actions.appendChild(y);
    }

    if (item.type === "tenor" && (item.tenorId || item.tenorUrl)) {
      const link = document.createElement("a");
      link.className = "action";
      link.href = item.tenorUrl || `https://tenor.com/view/${item.tenorId}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Tenor";
      actions.appendChild(link);
    }

    meta.appendChild(left);
    meta.appendChild(actions);
    card.appendChild(meta);

    frag.appendChild(card);
  }

  g.appendChild(frag);
}

function openViewer(item) {
  const dlg = els.viewer;
  const wrap = dlg.querySelector(".viewer-content");
  wrap.innerHTML = "";

  let media;
  if (item.type === "video" && item.path) {
    media = document.createElement("video");
    media.className = "viewer-media";
    media.controls = true;
    media.autoplay = true;
    media.src = buildAbsoluteUrl(item.path);
    media.playsInline = true;
  } else if (item.type === "youtube" && item.youtubeId) {
    const frame = document.createElement("div");
    frame.className = "viewer-embed";
    const iframe = document.createElement("iframe");
    iframe.className = "viewer-iframe";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.src = `https://www.youtube.com/embed/${item.youtubeId}?autoplay=1`;
    frame.appendChild(iframe);
    media = frame;
  } else if (item.type === "tenor" && (item.tenorId || item.tenorUrl)) {
    const id = item.tenorId || extractTenorId(item.tenorUrl || "");
    const frame = document.createElement("div");
    frame.className = "viewer-embed";
    if (id) {
      const iframe = document.createElement("iframe");
      iframe.className = "viewer-iframe";
      iframe.allow =
        "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      iframe.src = `https://tenor.com/embed/${id}`;
      frame.appendChild(iframe);
    } else {
      const a = document.createElement("a");
      a.href = item.tenorUrl || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open on Tenor";
      a.className = "action";
      frame.appendChild(a);
    }
    media = frame;
  } else {
    media = document.createElement("img");
    media.className = "viewer-media";
    media.alt = item.title;
    media.src = buildAbsoluteUrl(item.path || item.thumb || "");
  }

  const rawAbs = item.path ? buildAbsoluteUrl(item.path) : null;

  const caption = document.createElement("div");
  caption.className = "viewer-caption";
  caption.innerHTML = `
    <div class="left">
      <strong>${escapeHtml(item.title || "")}</strong>
      ${renderBadgesHTML(item)}
    </div>
    <div class="right">
      ${
        rawAbs
          ? `<a class="action" target="_blank" rel="noopener" href="${rawAbs}">Open raw</a>`
          : ""
      }
      ${
        rawAbs
          ? `<button class="action js-copy" data-path="${rawAbs}" type="button">Copy path</button>`
          : ""
      }
      ${
        item.youtubeId
          ? `<a class="action" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${item.youtubeId}">YouTube</a>`
          : ""
      }
      ${
        item.type === "tenor" && (item.tenorId || item.tenorUrl)
          ? `<a class="action" target="_blank" rel="noopener" href="${
              item.tenorUrl || `https://tenor.com/view/${item.tenorId}`
            }">Tenor</a>`
          : ""
      }
    </div>
  `;

  wrap.appendChild(media);
  wrap.appendChild(caption);

  const copyBtn = caption.querySelector(".js-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const url = copyBtn.getAttribute("data-path") || "";
      try {
        await navigator.clipboard.writeText(url);
      } catch {}
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
    });
  }

  const closeBtn = dlg.querySelector(".viewer-close");
  closeBtn.onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
}

function renderFilesTree() {
  const bySkin = groupBy(STATE.allItems, (i) => i.skinName);
  const container = els.filesTree;
  container.innerHTML = "";

  for (const [skin, items] of bySkin) {
    const skinNode = mkNode(skin);
    const byType = groupBy(items, (i) => TYPE_LABEL[i.type] || i.type);
    for (const [type, arr] of byType) {
      const typeNode = mkNode(type);
      for (const it of arr) {
        const leaf = document.createElement("div");
        leaf.className = "node";
        const name = it.path
          ? it.path.split("/").slice(-1)[0]
          : it.youtubeId || it.tenorId || it.title;
        const abs = it.path ? buildAbsoluteUrl(it.path) : "";
        const tenorHref =
          it.type === "tenor"
            ? it.tenorUrl ||
              (it.tenorId ? `https://tenor.com/view/${it.tenorId}` : "")
            : "";

        leaf.innerHTML = `
          <span>${escapeHtml(name)}</span>
          <span class="file-actions">
            ${
              it.path
                ? `<a href="${abs}" target="_blank" rel="noopener">open</a>`
                : ""
            }
            ${
              it.youtubeId
                ? `<a href="https://www.youtube.com/watch?v=${it.youtubeId}" target="_blank" rel="noopener">youtube</a>`
                : ""
            }
            ${
              tenorHref
                ? `<a href="${tenorHref}" target="_blank" rel="noopener">tenor</a>`
                : ""
            }
            ${
              it.path
                ? `<button class="copy" data-text="${abs}">copy path</button>`
                : ""
            }
          </span>
        `;
        typeNode.appendChild(leaf);
      }
      skinNode.appendChild(typeNode);
    }
    container.appendChild(skinNode);
  }

  container.querySelectorAll("button.copy").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const url = e.currentTarget.getAttribute("data-text") || "";
      try {
        await navigator.clipboard.writeText(url);
        e.currentTarget.textContent = "copied";
        setTimeout(() => (e.currentTarget.textContent = "copy path"), 1200);
      } catch {}
    });
  });

  function mkNode(label) {
    const d = document.createElement("div");
    d.className = "node";
    d.innerHTML = `<strong>${escapeHtml(label)}</strong>`;
    return d;
  }
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

// --- title cleaning: strip tokens like [WR], (WR), __wr, etc.
const TAG_WORDS = new Set([
  "wr",
  "wild rift",
  "tft",
  "lor",
  "legends of runeterra",
  "runeterra",
  "chroma",
  "chromas",
]);

function isTagWord(s) {
  return TAG_WORDS.has(s.toLowerCase().replace(/[_-]+/g, " ").trim());
}

function cleanTitle(input) {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/\.[a-z0-9]+$/i, "");
  s = s.replace(/([\[\(\{])([^}\)\]]+)([\]\)\}])/g, (m, l, inner, r) =>
    isTagWord(inner) ? "" : m
  );
  s = s.replace(/__([a-z0-9._-]+)/gi, (m, t) => (isTagWord(t) ? "" : m));
  s = s
    .replace(/(^|[ _.-])(wr|tft|lor|chroma|chromas?)(?=($|[ _.-]))/gi, " ")
    .replace(/[-_]+/g, " ");
  s = s
    .replace(/\s{2,}/g, " ")
    .replace(/\s*([()\[\]\{\}])\s*/g, "$1")
    .trim();
  return s;
}

function inferTitleFromPath(p, yt) {
  if (yt) return `YouTube ${yt}`;
  if (!p) return "";
  const base = p.split("/").pop() || p;
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  return cleanTitle(noExt);
}

// Tenor helpers
function extractTenorId(url) {
  if (!url) return null;
  const m = String(url).match(
    /tenor\.com\/view\/[a-z0-9-]*-([0-9]+)(?:[^0-9]|$)/i
  );
  return m ? m[1] : null;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        m
      ])
  );
}

function normalizeTags(arr) {
  const set = new Set();
  for (const t of arr || []) {
    if (!t) continue;
    set.add(String(t).toLowerCase());
  }
  return [...set];
}

function renderCounts() {
  if (!els.counts) return;
  const total = STATE.allItems.length;
  const visible = STATE.filtered.length;
  els.counts.textContent = `Showing ${visible} of ${total}`;
}

/* ---------- URL helpers ---------- */
function buildAbsoluteUrl(p) {
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base = location.origin + location.pathname.replace(/index\.html?$/, "");
  return base + encodePathSegments(p);
}
function encodePathSegments(p) {
  const noDot = String(p).replace(/^\.\//, "");
  const parts = noDot.split("/");
  const enc = parts.map((seg) =>
    seg === "" ? "" : encodeURIComponent(safeDecode(seg))
  );
  return enc.join("/");
}
function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {}
  try {
    return decodeURI(s);
  } catch (_) {}
  return s;
}
