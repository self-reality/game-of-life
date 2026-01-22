const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const INPUT_DIR = "/Volumes/Smartbuy P5/Media Production/Production Videos/Long/";
const OUTPUT_FILENAME = "game-of-life.mp4";

function findSuperchunks(dir) {
  const entries = fs.readdirSync(dir);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:9',message:'dir entries loaded',data:{dir,entriesCount:entries.length,startsWithDotUnderscore:entries.filter((e)=>e.startsWith("._")).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
  // #endregion agent log
  const files = [];
  for (const entry of entries) {
    if (entry.startsWith("._")) continue;
    const match = entry.match(/\.superchunk_(\d+)\.mp4$/);
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isFinite(index)) continue;
    files.push({ index, name: entry });
  }
  files.sort((a, b) => a.index - b.index);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:19',message:'matched superchunks',data:{matchedCount:files.length,firstFive:files.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
  // #endregion agent log
  return files.map((item) => item.name);
}

function writeConcatList(dir, files) {
  const listPath = path.join(dir, "concat.txt");
  const lines = files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:25',message:'concat list prepared',data:{listPath,linesCount:lines.length,firstLine:lines[0],lastLine:lines[lines.length-1]},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'B'})}).catch(()=>{});
  // #endregion agent log
  fs.writeFileSync(listPath, lines.join("\n"));
  return listPath;
}

function concatWithFfmpeg(dir, listPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath];
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:31',message:'ffmpeg spawn',data:{args,dir,listPath,outputPath},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
    // #endregion agent log
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"], cwd: dir });
    proc.on("close", (code) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:34',message:'ffmpeg close',data:{code},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", (err) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:38',message:'ffmpeg error',data:{message:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion agent log
      reject(err);
    });
  });
}

async function run() {
  const dir = path.resolve(INPUT_DIR);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:43',message:'run start',data:{inputDir:INPUT_DIR,resolvedDir:dir},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion agent log
  if (!fs.existsSync(dir)) {
    throw new Error(`Folder does not exist: ${dir}`);
  }

  const files = findSuperchunks(dir);
  if (!files.length) {
    throw new Error(`No *.superchunk_*.mp4 files found in ${dir}`);
  }

  const listPath = writeConcatList(dir, files);
  const outputPath = path.join(dir, OUTPUT_FILENAME);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/eb9b93db-cc0f-4938-8d22-0946ac9b8a30',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'tools/concat_superchunks.js:56',message:'concat start',data:{outputPath},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'C'})}).catch(()=>{});
  // #endregion agent log

  try {
    await concatWithFfmpeg(dir, listPath, outputPath);
  } finally {
    if (fs.existsSync(listPath)) {
      fs.unlinkSync(listPath);
    }
  }

  console.log(`Wrote ${outputPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
