const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const INPUT_DIR = "/Volumes/Smartbuy P5/Media Production/Production Videos/Long/";
const OUTPUT_FILENAME = "game-of-life.mp4";

function findSuperchunks(dir) {
  const entries = fs.readdirSync(dir);
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
  return files.map((item) => item.name);
}

function writeConcatList(dir, files) {
  const listPath = path.join(dir, "concat.txt");
  const lines = files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(listPath, lines.join("\n"));
  return listPath;
}

function concatWithFfmpeg(dir, listPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath];
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"], cwd: dir });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function run() {
  const dir = path.resolve(INPUT_DIR);
  if (!fs.existsSync(dir)) {
    throw new Error(`Folder does not exist: ${dir}`);
  }

  const files = findSuperchunks(dir);
  if (!files.length) {
    throw new Error(`No *.superchunk_*.mp4 files found in ${dir}`);
  }

  const listPath = writeConcatList(dir, files);
  const outputPath = path.join(dir, OUTPUT_FILENAME);

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
