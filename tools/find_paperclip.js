#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT =
  "/Volumes/Smartbuy P5/Media Production/Production Videos/Long/simulation.bin";
const DEFAULT_OUTPUT = path.resolve(__dirname, "paperclip_hits.csv");
const DEFAULT_RESUME = path.resolve(__dirname, "paperclip_hits.resume.json");

const PAPERCLIP_RLE = `
#N Paperclip
#C A 14-cell still life.
#C https://www.conwaylife.com/wiki/index.php?title=Paperclip
x = 5, y = 6, rule = B3/S23
2b2ob$bo2bo$bob2o$2obob$o2bob$b2o!
`;

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    out: DEFAULT_OUTPUT,
    resume: DEFAULT_RESUME,
    test: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--out" && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    } else if (arg === "--resume" && argv[i + 1]) {
      args.resume = argv[i + 1];
      i += 1;
    } else if (arg === "--test") {
      args.test = true;
    }
  }
  return args;
}

function readHeader(fd) {
  const headerLengthBuffer = Buffer.alloc(4);
  const readHeaderLength = fs.readSync(fd, headerLengthBuffer, 0, 4, 0);
  if (readHeaderLength !== 4) {
    throw new Error("Failed to read header length.");
  }
  const headerLength = headerLengthBuffer.readUInt32LE(0);
  const headerBuffer = Buffer.alloc(headerLength);
  const readHeaderBytes = fs.readSync(fd, headerBuffer, 0, headerLength, 4);
  if (readHeaderBytes !== headerLength) {
    throw new Error("Failed to read header data.");
  }
  const header = JSON.parse(headerBuffer.toString("utf8"));
  return { header, dataOffset: 4 + headerLength };
}

function decodeRle(rle) {
  const lines = rle
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const headerLine = lines.find((line) => line.startsWith("x"));
  if (!headerLine) {
    throw new Error("RLE header line missing.");
  }
  const match = headerLine.match(/x\s*=\s*(\d+),\s*y\s*=\s*(\d+)/);
  if (!match) {
    throw new Error("RLE header is malformed.");
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const data = lines.filter((line) => !line.startsWith("x")).join("");

  const grid = Array.from({ length: height }, () => Array(width).fill(0));
  let row = 0;
  let col = 0;
  let count = "";
  const flushCount = () => {
    if (!count) return 1;
    const value = Number(count);
    count = "";
    return value;
  };

  for (let i = 0; i < data.length; i += 1) {
    const ch = data[i];
    if (ch >= "0" && ch <= "9") {
      count += ch;
      continue;
    }
    if (ch === "b" || ch === "o") {
      const run = flushCount();
      const value = ch === "o" ? 1 : 0;
      for (let j = 0; j < run; j += 1) {
        if (row >= height || col >= width) {
          throw new Error("RLE data exceeds declared dimensions.");
        }
        grid[row][col] = value;
        col += 1;
      }
      continue;
    }
    if (ch === "$") {
      const run = flushCount();
      row += run;
      col = 0;
      continue;
    }
    if (ch === "!") {
      break;
    }
  }

  return { width, height, grid };
}

function rotateGrid(grid) {
  const height = grid.length;
  const width = grid[0].length;
  const rotated = Array.from({ length: width }, () => Array(height).fill(0));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rotated[x][height - 1 - y] = grid[y][x];
    }
  }
  return rotated;
}

function reflectGrid(grid) {
  const height = grid.length;
  const width = grid[0].length;
  const reflected = Array.from({ length: height }, () => Array(width).fill(0));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      reflected[y][width - 1 - x] = grid[y][x];
    }
  }
  return reflected;
}

function serializeGrid(grid) {
  return grid.map((row) => row.join("")).join("|");
}

function buildVariants(grid) {
  const variants = [];
  const seen = new Map();

  const build = (base, tagPrefix) => {
    let current = base;
    for (let i = 0; i < 4; i += 1) {
      const key = serializeGrid(current);
      if (!seen.has(key)) {
        seen.set(key, true);
        variants.push({
          name: `${tagPrefix}r${i * 90}`,
          width: current[0].length,
          height: current.length,
          grid: current,
        });
      }
      current = rotateGrid(current);
    }
  };

  build(grid, "");
  build(reflectGrid(grid), "m");
  return variants;
}

function ensureCsvHeader(outPath) {
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, "cycle,x,y,variant\n");
  }
}

function loadResume(resumePath) {
  if (!fs.existsSync(resumePath)) return null;
  const data = JSON.parse(fs.readFileSync(resumePath, "utf8"));
  return data;
}

function saveResume(resumePath, state) {
  fs.mkdirSync(path.dirname(resumePath), { recursive: true });
  fs.writeFileSync(resumePath, JSON.stringify(state, null, 2));
}

function validateResume(resume, header, inputPath) {
  if (!resume) return;
  if (resume.inputPath && resume.inputPath !== inputPath) {
    throw new Error("Resume file input path does not match current input.");
  }
  if (
    resume.gridWidth !== header.gridWidth ||
    resume.gridHeight !== header.gridHeight ||
    resume.totalCycles !== header.totalCycles
  ) {
    throw new Error("Resume file header does not match input header.");
  }
}

function matchVariant(buffer, gridWidth, startX, startY, variant) {
  const { width, height, grid } = variant;
  for (let y = 0; y < height; y += 1) {
    const row = grid[y];
    let offset = (startY + y) * gridWidth + startX;
    for (let x = 0; x < width; x += 1) {
      const alive = row[x] === 1;
      const cellAlive = buffer[offset + x] !== 0;
      if (alive !== cellAlive) return false;
    }
  }
  return true;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  const outPath = path.resolve(args.out);
  const resumePath = path.resolve(args.resume);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const fd = fs.openSync(inputPath, "r");
  const { header, dataOffset } = readHeader(fd);
  const gridWidth = Number(header.gridWidth);
  const gridHeight = Number(header.gridHeight);
  const totalCycles = Number(header.totalCycles);
  const gridSize = gridWidth * gridHeight;

  const resume = loadResume(resumePath);
  validateResume(resume, header, inputPath);
  const startCycle = resume && Number.isFinite(resume.lastCycle) ? resume.lastCycle + 1 : 0;

  const pattern = decodeRle(PAPERCLIP_RLE);
  const variants = buildVariants(pattern.grid);
  ensureCsvHeader(outPath);

  console.log(
    `Scanning ${inputPath} (${gridWidth}x${gridHeight}, ${totalCycles} cycles)`
  );
  console.log(`Variants: ${variants.map((variant) => variant.name).join(", ")}`);
  if (args.test) {
    console.log("Test mode: stopping after first match.");
  }
  if (startCycle > 0) {
    console.log(`Resuming at cycle ${startCycle}.`);
  }

  const buffer = Buffer.alloc(gridSize);
  let matchesFound = 0;
  for (let cycle = startCycle; cycle < totalCycles; cycle += 1) {
    const position = dataOffset + cycle * gridSize;
    const bytesRead = fs.readSync(fd, buffer, 0, gridSize, position);
    if (bytesRead !== gridSize) {
      throw new Error(`Failed to read cycle ${cycle} (${bytesRead}/${gridSize} bytes).`);
    }

    for (const variant of variants) {
      const maxX = gridWidth - variant.width;
      const maxY = gridHeight - variant.height;
      for (let y = 0; y <= maxY; y += 1) {
        for (let x = 0; x <= maxX; x += 1) {
          if (matchVariant(buffer, gridWidth, x, y, variant)) {
            const row = `${cycle},${x},${y},${variant.name}\n`;
            fs.appendFileSync(outPath, row);
            matchesFound += 1;
            if (args.test) {
              saveResume(resumePath, {
                inputPath,
                gridWidth,
                gridHeight,
                totalCycles,
                lastCycle: cycle,
                matchesFound,
              });
              console.log(`First match at cycle ${cycle} (x=${x}, y=${y}, ${variant.name}).`);
              fs.closeSync(fd);
              return;
            }
          }
        }
      }
    }

    saveResume(resumePath, {
      inputPath,
      gridWidth,
      gridHeight,
      totalCycles,
      lastCycle: cycle,
      matchesFound,
    });
  }

  fs.closeSync(fd);
  console.log(`Scan complete. Matches found: ${matchesFound}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
