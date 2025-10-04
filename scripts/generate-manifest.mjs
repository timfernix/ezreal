import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const ASSETS_EZREAL = path.join(ROOT, "assets", "ezreal");
const CANDIDATES = [ path.join(ASSETS_EZREAL, "skins"), ASSETS_EZREAL ];
const OUT = path.join(ROOT, "data", "manifest.json");

const IMAGE_EXT = new Set([".png",".jpg",".jpeg",".webp",".gif"]);
const VIDEO_EXT = new Set([".mp4",".webm",".mov",".m4v"]);

// Canonical type -> alias folder names we accept
const TYPE_ALIASES = new Map([
  ["splash",      ["splash","splashes"]],
  ["icon",        ["icon","icons"]],
  ["promo",       ["promo","promoart","key-art","keyart"]],
  ["concept",     ["concept","concepts"]],
  ["loading",     ["loading","loadingscreen","loading-screen","loading_splash"]],
  ["model",       ["model","3d","3d-model","model3d"]],
  ["model-face",  ["model-face","3d-face","face"]],
  ["chroma",      ["chroma","chromas"]],
  ["form",        ["form","forms"]],
  ["video",       ["video","videos"]],
  ["emote",       ["emote","emotes","emoticon","emoticons","emote-icon","emote-icons"]],
]);

// tag slugs -> alias folder/file tokens we accept
const TAG_ALIASES = new Map([
  ["tft", ["tft","teamfighttactics","teamfight-tactics"]],
  ["wr",  ["wr","wildrift","wild-rift"]],
  ["lor", ["lor","runeterra","legends-of-runeterra","legends_of_runeterra"]],
  ["chroma", ["chroma","chromas"]],
  ["form",   ["form","forms"]]
]);

const SKINS_ROOT = await pickFirstExisting(CANDIDATES);

async function main(){
  if(!SKINS_ROOT){
    await writeManifest([]);
    return;
  }

  const skinDirs = await readDirsOnly(SKINS_ROOT);
  const skins = [];

  for(const skinId of skinDirs){
    const skinPath = path.join(SKINS_ROOT, skinId);
    const skin = {
      id: skinId,
      name: toTitleCase(skinId.replace(/-/g," ")),
      release_year: null,
      media: []
    };

    // Optional per-skin meta.json
    const meta = await readJson(path.join(skinPath, "meta.json"));
    if(meta){
      if(typeof meta.name === "string") skin.name = meta.name;
      if(Number.isInteger(meta.release_year)) skin.release_year = meta.release_year;
    }

    for(const [canonical, aliases] of TYPE_ALIASES.entries()){
      for(const alias of aliases){
        const typeDir = path.join(skinPath, alias);
        if(!(await isDir(typeDir))) continue;

        // optionale titles/tags-Overrides
        const titlesMap = (await readJson(path.join(typeDir, "titles.json"))) || {};
        const tagsMap   = (await readJson(path.join(typeDir, "tags.json")))   || {};

        await collectFiles(typeDir, f => {
          const rel = relPosix(path.join(typeDir, f));
          const ext = path.extname(f).toLowerCase();
          if(canonical === "video" ? VIDEO_EXT.has(ext) : IMAGE_EXT.has(ext)){
            const tags = normalizeTags([
              ...inferTagsFromFilename(f),
              ...(Array.isArray(tagsMap[f]) ? tagsMap[f] : [])
            ]);
            if(canonical === "chroma" && !tags.includes("chroma")) tags.push("chroma");
            if(canonical === "form"   && !tags.includes("form"))   tags.push("form");
            skin.media.push({
              type: canonical,
              title: titlesMap[f] || fileBaseTitle(f),
              path: rel,
              tags
            });
          }
        });

        const subdirs = await readDirsOnly(typeDir);
        for(const sub of subdirs){
          const subDir = path.join(typeDir, sub);
          const subTagSlugs = normalizeTags(inferTagsFromDirname(sub));
          await collectFiles(subDir, f => {
            const rel = relPosix(path.join(subDir, f));
            const ext = path.extname(f).toLowerCase();
            if(canonical === "video" ? VIDEO_EXT.has(ext) : IMAGE_EXT.has(ext)){
              const tags = normalizeTags([
                ...subTagSlugs,
                ...inferTagsFromFilename(f),
                ...(Array.isArray(tagsMap[path.join(sub, f)]) ? tagsMap[path.join(sub, f)] : [])
              ]);
              if(canonical === "chroma" && !tags.includes("chroma")) tags.push("chroma");
              if(canonical === "form"   && !tags.includes("form"))   tags.push("form");
              skin.media.push({
                type: canonical,
                title: titlesMap[path.join(sub, f)] || fileBaseTitle(f),
                path: rel,
                tags
              });
            }
          });
        }
      }
    }

const ytTxt = path.join(skinPath, "youtube.txt");
if (await exists(ytTxt)) {
  const txt = await fs.readFile(ytTxt, "utf8");
  for (const raw of txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    const { url, inlineTitle } = parseYoutubeLine(raw);
    const id = extractYouTubeId(url);
    if (!id) continue;

    const title = inlineTitle ? stripQuotes(inlineTitle).trim() : "YouTube";

    skin.media.push({
      type: "youtube",
      title,
      youtubeId: id,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      tags: []
    });
  }
}


    if(skin.media.length) skins.push(skin);
  }

  await writeManifest(skins);
}

async function writeManifest(skins){
  const manifest = {
    meta: { champion: "Ezreal", generated: new Date().toISOString().slice(0,10) },
    skins
  };
  await fs.mkdir(path.dirname(OUT), { recursive:true });
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Wrote ${OUT} — ${skins.length} skins, ${skins.reduce((n,s)=>n+s.media.length,0)} items`);
}

function fileBaseTitle(filename){ return filename.replace(/\.[a-z0-9]+$/i,"").replace(/[-_]/g," ").trim(); }
function toTitleCase(s){ return s.replace(/\b\w/g, m=>m.toUpperCase()); }
function relPosix(p){ return path.relative(ROOT, p).split(path.sep).join("/"); }

async function pickFirstExisting(paths){ for (const p of paths){ try{ const s = await fs.stat(p); if (s.isDirectory()) return p; } catch{} } return null; }
async function readDirsOnly(dir){ try{ const e=await fs.readdir(dir,{withFileTypes:true}); return e.filter(x=>x.isDirectory()).map(x=>x.name); } catch{ return []; } }
async function collectFiles(dir, fn){ try{ const e=await fs.readdir(dir,{withFileTypes:true}); for(const x of e){ if(x.isFile()) fn(x.name); } } catch{} }
async function exists(p){ try{ await fs.access(p); return true; } catch{ return false; } }
async function isDir(p){ try{ return (await fs.stat(p)).isDirectory(); } catch{ return false; } }
async function readJson(p){ try{ return JSON.parse(await fs.readFile(p,"utf8")); } catch{ return null; } }

function extractYouTubeId(url){
  const m1=url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  const m2=url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  return m1?.[1]||m2?.[1]||null;
}

/* ---- Tags ---- */
function normalizeTags(list){
  const out = new Set();
  for(const raw of list){
    const slug = toTagSlug(raw);
    if(slug) out.add(slug);
  }
  return [...out];
}
function toTagSlug(raw){
  if(!raw) return null;
  const s = String(raw).toLowerCase();
  for(const [slug, aliases] of TAG_ALIASES.entries()){
    if(aliases.includes(s)) return slug;
  }
  if (TAG_ALIASES.has(s)) return s;
  return null;
}
function inferTagsFromDirname(name){
  const token = name.toLowerCase().replace(/\s+/g,"-").replace(/_/g,"-");
  const parts = token.split(/[^a-z0-9]+/).filter(Boolean);
  const tags = [];
  for(const p of parts){
    for(const [slug, aliases] of TAG_ALIASES.entries()){
      if(aliases.includes(p)) tags.push(slug);
    }
  }
  return tags;
}
function inferTagsFromFilename(filename){
  const base = filename.toLowerCase();
  const tags = [];

  // Pattern: [tft], [wr], [lor]
  const bracket = [...base.matchAll(/\[([^\]]+)\]/g)].map(m=>m[1]);
  // or: __tft, __wr, __lor
  const underscores = [...base.matchAll(/__([a-z0-9-]+)/g)].map(m=>m[1]);

  for(const token of [...bracket, ...underscores]){
    const slug = toTagSlug(token);
    if(slug) tags.push(slug);
  }
  return tags;
}

main().catch(err => { console.error(err); process.exit(1); });

function parseYoutubeLine(line){
  const raw = (line || "").trim();
  if (!raw) return { url: "", inlineTitle: null };

  const parts = raw.split("|");
  const a0 = parts[0] !== undefined ? parts[0].trim() : "";
  const b0 = parts[1] !== undefined ? parts.slice(1).join("|").trim() : "";

  const a = stripQuotes(a0);
  const b = stripQuotes(b0);

  const isUrl = (s) => /^https?:\/\//i.test(s);

  if (a && b) {
    if (isUrl(a) && !isUrl(b)) return { url: a, inlineTitle: b };
    if (!isUrl(a) && isUrl(b)) return { url: b, inlineTitle: a };
    return { url: a, inlineTitle: b };
  }

  if (isUrl(a)) return { url: a, inlineTitle: null };
  if (isUrl(b)) return { url: b, inlineTitle: a || null };

  return { url: "", inlineTitle: a || b || null };
}

function stripQuotes(s){
  if (!s) return s;
  const t = s.trim();
  const q = t[0];
  if ((q === '"' || q === "'") && t.endsWith(q)) return t.slice(1, -1).trim();
  return t;
}
