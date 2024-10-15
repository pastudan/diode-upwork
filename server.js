import express from "express";
import ffmpeg from "fluent-ffmpeg";
import { readFile } from "fs/promises";

const LISTEN_PORT = 3000;

const app = express();

const cwd = process.cwd();

// serve files
app.use(express.static("public"));
app.get("/index.html", (req, res) => {
  res.sendFile(`${cwd}/index.html`);
});

async function parseCueKeyframes() {
  const cueContent = await readFile("cues.txt", "utf8");
  const lines = cueContent.split("\n");
  const ranges = [];

  for (const line of lines) {
    const match = line.match(/timestamp=([\d\:\.]+)/);
    if (match) {
      const [h, m, s] = match[1].split(":").map(parseFloat);
      ranges.push(h * 3600 + m * 60 + s);
    }
  }
  return ranges;
}

const keyframes = await parseCueKeyframes();
console.log("Keyframes:", keyframes);

const TESTING_AUDIO = true;

// hev1.2.4.L120.90,mp4a.40.2
// aac: mp4a.40.2,
app.get("/master.m3u8", async (req, res) => {
  const dan = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=538063,CODECS="hev1.2.4.L120.90${
    TESTING_AUDIO ? ",mp4a.40.2" : ""
  }",RESOLUTION=1920x1080
playlist.m3u8
`;
  // ,AUDIO="audio_0"
  // #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio_0",NAME="English",CODECS="mp4a.40.2",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="en",URI="audio.m3u8"
  // #EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1391346,RESOLUTION=1022x574,CODECS="avc1.4d001f,mp4a.40.5",AUDIO="aac"
  res.send(dan);
});

// Serve the M3U8 playlist
app.get("/playlist.m3u8", async (req, res) => {
  const header = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
`;
  // #EXT-X-PLAYLIST-TYPE:VOD
  // #EXT-X-MAP:URI="segment/init.ts"
  // #EXT-X-INDEPENDENT-SEGMENTS
  const m3u8Content = [];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const startTime = keyframes[i];
    const endTime = keyframes[i + 1];
    const duration = endTime - startTime; //+ 0.125
    m3u8Content.push(`#EXTINF:${duration.toFixed(3)}`);
    m3u8Content.push(`/segment/${i}.m4s`);
    // m3u8Content.push(`#EXT-X-DISCONTINUITY`)
  }
  m3u8Content.push("#EXT-X-ENDLIST");
  // res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
  res.send(header + m3u8Content.join("\n") + "\n");
});

app.get("/audio.m3u8", async (req, res) => {
  const header = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="audio-init.m4s"
`;
  const m3u8Content = [];
  for (let i = 0; i < 3; i++) {
    const startTime = keyframes[i];
    const endTime = keyframes[i + 1];
    const duration = endTime - startTime;
    m3u8Content.push(`#EXTINF:${duration.toFixed(3)}`);
    m3u8Content.push(`/audio/audio-${i}.m4s`);
  }
  res.send(header + m3u8Content.join("\n") + `\n#EXT-X-ENDLIST`);
});

app.get("/audio/audio-:segmentNum", (req, res) => {
  const [segmentNum, extension] = req.params.segmentNum.split(".");
  console.log(`Serving AUDIO segment ${segmentNum}`);
  ffmpeg(`dash-test/${segmentNum}.mkv`)
    .outputOptions(["-vn", "c:a", "aac", "-f", "mp4"])
    .on("start", (cmd) => {
      console.log("Spawned Ffmpeg with command: " + cmd);
      res.setHeader("Content-Type", "video/mp4");
    })
    .on("error", (err) => {
      console.log("Error:", err);
      console.log("Error code:", err.code);
      // res.sendStatus(500);
    })
    .pipe(res, { end: true });
});

app.get("/segment/:segmentNum", (req, res) => {
  // -f segment muxer: https://superuser.com/a/1810206
  // -f dash: https://stackoverflow.com/questions/56891221/generate-single-mpeg-dash-segment-with-ffmpeg
  const [segmentNum, extension] = req.params.segmentNum.split(".");
  let inputPath = `mkv-segments/${segmentNum}.mkv`;
  // let inputPath = process.env.MOVIE
  // default_base_moof and omit_tfhd_offset are very similar: https://ffmpeg.org/ffmpeg-formats.html#Options-6
  // -- default_base_moof: Similarly to the ‘omit_tfhd_offset’ flag, this flag avoids writing the absolute base_data_offset field in tfhd atoms, but does so by using the new default-base-is-moof flag instead. This flag is new from 14496-12:2012. This may make the fragments easier to parse in certain circumstances (avoiding basing track fragment location calculations on the implicit end of the previous track fragment).
  // -- omit_tfhd_offset: Do not write any absolute base_data_offset in tfhd atoms. This avoids tying fragments to absolute byte positions in the file/streams.

  let flags = [
    "-movflags",
    "default_base_moof+empty_moov+separate_moof",
    //
    // '-map_metadata',
    // '-1',
    // '-to',
    // '10.427000',
  ];
  let inputFlags = [];
  console.log("Generating segment", { segmentNum, extension });
  // if (segmentNum === 'init') {
  //   inputPath = `dash-test/0.mkv`
  //   inputFlags = ['-t', '0']
  //   flags = ['-movflags', 'separate_moof']
  // }
  if (TESTING_AUDIO) {
    // -use_timeline 1 -use_template 1 -f dash
    flags = [
      ...flags,
      // '-c:a',
      // // 'copy',
      // 'aac',
      // '-b:a',
      // '128k',
      // '-ac',
      // '2',
    ];
  } else {
    flags = [...flags, "-an"];
  }
  flags = [...flags, "-f", "mp4"];
  ffmpeg(inputPath)
    .inputOptions(inputFlags)
    .outputOptions(["-c:v", "copy", ...flags])
    .on("start", (cmd) => {
      console.log("Spawned Ffmpeg with command: " + cmd);
      res.setHeader("Content-Type", "video/mp4");
    })
    .on("error", (err) => {
      console.log("Error:", err);
      console.log("Error code:", err.code);
      // res.sendStatus(500);
    })
    .pipe(res, { end: true });
});

// listen for all routes and 404
app.use((req, res) => {
  console.log("404. URL: ", req.url);
  res.status(404).send("Not found");
});

app.listen(LISTEN_PORT, () => {
  console.log(`Example app listening on port ${LISTEN_PORT}`);
});

// NOTES:
// - check out Bento4
// - shaka packager https://github.com/shaka-project/shaka-packager
// - mp4ff https://github.com/Eyevinn/mp4ff
// - mp4box.js https://gpac.github.io/mp4box.js/#segmentation
