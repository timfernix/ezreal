import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "assets", "ezreal", "skins");
const OUT = path.join(ROOT, "data", "manifest.json");

const IMAGE_EXT = new Set([".png",".jpg",".jpeg",".webp",".gif"]);
const VIDEO_EXT = new Set([".mp4",".webm",".mov",".m4v"]);

async function main(){
  const skins = [];
  const skinDirs = await readDirsOnly(ASSETS_DIR);

  for(const id of skinDirs){
    const skinPath = path.join(ASSETS_DIR, id);
    const skin = { id, name: toTitleCase(id.replace(/-/g," ")), release_year: null, media: [] };

    for(const type of ["splash","icon","promo","concept","video"]){
      const dir = path.join(skinPath, type);
      const files = await readFilesOnly(dir);
      for(const f of files){
        const p = path.join("assets","ezreal","skins",id,type,f).replaceAll("\\","/");
        const ext = path.extname(f).toLowerCase();
        if(type === "video" && VIDEO_EXT.has(ext)){
          skin.media.push({ type:"video", title: fileBaseTitle(f), path: p });
        } else if(type !== "video" && IMAGE_EXT.has(ext)){
          skin.media.push({ type, title: fileBaseTitle(f), path: p });
        }
      }
    }

    const ytTxt = path.join(skinPath, "youtube.txt");
    if(await exists(ytTxt)){
      const txt = await fs.readFile(ytTxt, "utf8");
      for(const line of txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
        const id = extractYouTubeId(line);
        if(id) skin.media.push({ type:"youtube", title: "YouTube", youtubeId: id });
      }
    }

    skins.push(skin);
  }

  const manifest = {
    meta: { champion: "Ezreal", generated: new Date().toISOString().slice(0,10) },
    skins
  };

  await fs.mkdir(path.dirname(OUT), { recursive:true });
  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2), "utf8");
  console.log("Wrote", OUT);
}

function fileBaseTitle(filename){ return filename.replace(/\.[a-z0-9]+$/i,"").replace(/[-_]/g," ").trim(); }
function toTitleCase(s){ return s.replace(/\b\w/g, m=>m.toUpperCase()); }
async function readDirsOnly(dir){
  try{ const e = await fs.readdir(dir, { withFileTypes:true }); return e.filter(x=>x.isDirectory()).map(x=>x.name); }
  catch{ return []; }
}
async function readFilesOnly(dir){
  try{ const e = await fs.readdir(dir, { withFileTypes:true }); return e.filter(x=>x.isFile()).map(x=>x.name); }
  catch{ return []; }
}
async function exists(p){ try{ await fs.access(p); return true; } catch{ return false; } }
function extractYouTubeId(url){
  const m1 = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  const m2 = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  return m1?.[1] || m2?.[1] || null;
}

main().catch(err => { console.error(err); process.exit(1); });
