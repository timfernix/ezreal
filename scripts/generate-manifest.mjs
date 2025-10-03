import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const ASSETS_EZREAL = path.join(ROOT, "assets", "ezreal");
const CANDIDATES = [ path.join(ASSETS_EZREAL, "skins"), ASSETS_EZREAL ];
const OUT = path.join(ROOT, "data", "manifest.json");
const GLOBAL_META_PATH = path.join(ROOT, "data", "skins-meta.json"); // optional

const IMAGE_EXT = new Set([".png",".jpg",".jpeg",".webp",".gif"]);
const VIDEO_EXT = new Set([".mp4",".webm",".mov",".m4v"]);
const TYPES = ["splash","icon","promo","concept","video"];

async function pickFirstExisting(paths){
  for (const p of paths){ try{ const s = await fs.stat(p); if (s.isDirectory()) return p; } catch {} }
  return null;
}
const SKINS_ROOT = await pickFirstExisting(CANDIDATES);

async function main(){
  if(!SKINS_ROOT){
    console.error("No assets directory found under assets/ezreal[/skins].");
    await writeManifest({ metaOnly:true });
    return;
  }

  const globalMeta = await readJson(GLOBAL_META_PATH) ?? {};
  const skinDirs = await readDirsOnly(SKINS_ROOT);
  const skins = [];

  for(const skinId of skinDirs){
    const skinPath = path.join(SKINS_ROOT, skinId);

    // ---- read per-skin meta.json (preferred) ----
    const metaJson = await readJson(path.join(skinPath, "meta.json")) ?? {};
    const skin = {
      id: skinId,
      name: metaJson.name || toTitleCase(skinId.replace(/-/g," ")),
      release_year: Number.isInteger(metaJson.release_year) ? metaJson.release_year : null,
      media: []
    };

    // ---- scan media subfolders ----
    for(const type of TYPES){
      const dir = path.join(skinPath, type);
      const files = await readFilesOnly(dir);
      for(const f of files){
        const full = path.join(dir, f);
        const rel = toPosix(path.relative(ROOT, full));
        const ext = path.extname(f).toLowerCase();
        if(type === "video" && VIDEO_EXT.has(ext)){
          skin.media.push({ type:"video", title: fileBaseTitle(f), path: rel });
        } else if(type !== "video" && IMAGE_EXT.has(ext)){
          skin.media.push({ type, title: fileBaseTitle(f), path: rel });
        }
      }
    }

    // ---- youtube.txt support ----
    const ytTxt = path.join(skinPath, "youtube.txt");
    if(await exists(ytTxt)){
      const txt = await fs.readFile(ytTxt, "utf8");
      for(const line of txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
        const id = extractYouTubeId(line);
        if(id) skin.media.push({ type:"youtube", title:"YouTube", youtubeId:id });
      }
    }

    // ---- heuristic: try year from folder name ----
    if(skin.release_year == null){
      const yr = skinId.match(/\b(19|20)\d{2}\b/);
      if(yr) skin.release_year = Number(yr[0]);
    }

    if(skin.media.length) skins.push(skin);
  }

  await writeManifest({ skins });
}

async function writeManifest({ skins = [], metaOnly = false }){
  const manifest = {
    meta: { champion:"Ezreal", generated:new Date().toISOString().slice(0,10) },
    skins: metaOnly ? [] : skins
  };
  await fs.mkdir(path.dirname(OUT), { recursive:true });
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Wrote ${OUT} — ${skins.length} skins, ${skins.reduce((n,s)=>n+s.media.length,0)} items`);
}

function fileBaseTitle(filename){ return filename.replace(/\.[a-z0-9]+$/i,"").replace(/[-_]/g," ").trim(); }
function toTitleCase(s){ return s.replace(/\b\w/g, m=>m.toUpperCase()); }
function toPosix(p){ return p.split(path.sep).join("/"); }
async function readDirsOnly(dir){ try{ const e = await fs.readdir(dir,{withFileTypes:true}); return e.filter(x=>x.isDirectory()).map(x=>x.name);}catch{ return []; } }
async function readFilesOnly(dir){ try{ const e = await fs.readdir(dir,{withFileTypes:true}); return e.filter(x=>x.isFile()).map(x=>x.name);}catch{ return []; } }
async function readJson(p){ try{ const t = await fs.readFile(p,"utf8"); return JSON.parse(t); } catch { return null; } }
async function exists(p){ try{ await fs.access(p); return true; } catch{ return false; } }
function extractYouTubeId(url){ const m1=url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/); const m2=url.match(/[?&]v=([A-Za-z0-9_-]{6,})/); return m1?.[1]||m2?.[1]||null; }

main().catch(err => { console.error(err); process.exit(1); });
