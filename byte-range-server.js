import express from "express";
import fs from "fs";
import path from "path";
import mime from "mime";
import { fileURLToPath } from "url";

const PORT = process.env.PORT || 3313;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route to handle GET requests for video files
app.get("/videos/:filename", function (req, res) {
  const filePath = path.join(__dirname, "videos", req.params.filename);

  // Check if the file exists
  fs.stat(filePath, function (err, stats) {
    if (err) {
      if (err.code === "ENOENT") {
        // 404 Error if file not found
        return res.status(404).send("File not found");
      }
      return res.status(500).send(err);
    }

    const total = stats.size;
    const range = req.headers.range;
    const contentType = mime.getType(filePath) || "application/octet-stream";

    if (range) {
      // Parse the range header to get the start and end positions
      const positions = range.replace(/bytes=/, "").split("-");
      let start = parseInt(positions[0], 10);
      let end = positions[1] ? parseInt(positions[1], 10) : total - 1;

      // Check for invalid range
      if (start >= total || end >= total) {
        res
          .status(416)
          .set({
            "Content-Range": `bytes */${total}`,
          })
          .end();
        return;
      }

      const chunksize = end - start + 1;

      // Set the response headers for partial content
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      });

      // Create a read stream for the specified range and pipe it to the response
      const stream = fs
        .createReadStream(filePath, { start: start, end: end })
        .on("open", function () {
          stream.pipe(res);
        })
        .on("error", function (err) {
          res.end(err);
        });
    } else {
      // If no range header, send the entire file
      res.writeHead(200, {
        "Content-Length": total,
        "Content-Type": contentType,
      });

      const stream = fs
        .createReadStream(filePath)
        .on("open", function () {
          stream.pipe(res);
        })
        .on("error", function (err) {
          res.end(err);
        });
    }
  });
});

// Start the server on PORT
app.listen(PORT, function () {
  console.log(`Server is listening on port ${PORT}`);
});
