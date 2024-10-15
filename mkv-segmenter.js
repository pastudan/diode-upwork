const fs = require("fs").promises;
const { exec } = require("child_process");
const util = require("util");
const path = require("path");

const execPromise = util.promisify(exec);

async function combineByteRanges(inputFile, range1, range2, outputFile) {
  try {
    const buffer1 = Buffer.alloc(range1.end - range1.start + 1);
    const buffer2 = Buffer.alloc(range2.end - range2.start + 1);

    const fd = await fs.open(inputFile, "r");

    await fd.read(buffer1, 0, buffer1.length, range1.start);
    await fd.read(buffer2, 0, buffer2.length, range2.start);
    await fd.close();

    const combinedBuffer = Buffer.concat([buffer1, buffer2]);
    await fs.writeFile(outputFile, combinedBuffer);

    console.log(`Byte ranges combined successfully into ${outputFile}!`);
  } catch (err) {
    console.error(err);
  }
}

async function extractCues(inputFile) {
  const cueFile = `cues.txt`;
  const command = `mkvextract ${inputFile} cues 0:${cueFile}`;

  try {
    await execPromise(command);
    const cueContent = await fs.readFile(cueFile, "utf8");
    return parseCues(cueContent);
  } catch (err) {
    console.error("Error extracting cues:", err);
    return [];
  }
}

function parseCues(cueContent) {
  const lines = cueContent.split("\n");
  const ranges = [];

  for (const line of lines) {
    const match = line.match(/cluster_position=(\d+)/);
    if (match) {
      ranges.push(parseInt(match[1], 10));
    }
  }

  return ranges;
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.log("Usage: node mkv-segmenter.js <INPUT-FILE>");
    process.exit();
  }
  const outputDir = `mkv-segments`;
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Extracting cue points from ${inputFile}`);

  const ranges = await extractCues(inputFile);
  if (ranges.length < 2) {
    console.error("Not enough cue points found.");
    return;
  }

  const range1 = { start: 0, end: ranges[0] - 1 };
  for (let i = 0; i < ranges.length - 1; i++) {
    const range2 = { start: ranges[i], end: ranges[i + 1] - 1 };
    const outputFile = path.join(outputDir, `${i}.mkv`);
    await combineByteRanges(inputFile, range1, range2, outputFile);
  }

  // Handle the last chunk
  const lastRange2 = {
    start: ranges[ranges.length - 1],
    end: (await fs.stat(inputFile)).size - 1,
  };
  const lastOutputFile = path.join(outputDir, `${ranges.length - 1}.mkv`);
  await combineByteRanges(inputFile, range1, lastRange2, lastOutputFile);
}

main().catch((err) => console.error("Error in main:", err));
