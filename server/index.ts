import fse from "fs-extra";
import http from "http";
import multiparty from "multiparty";
import path from "path";

const server = http.createServer();

const UPLOAD_DIR = path.resolve(__dirname, "..", "target");

server.on("request", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const multipart = new multiparty.Form();

  multipart.parse(req, async (err, fields, files) => {
    if (!err) {
      const chunk = files.chunk[0];
      const hash = fields.hash[0];
      const filename = fields.filename[0];
      const chunkDir = path.resolve(UPLOAD_DIR, "chunkDir_" + filename);

      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir);
      }

      await fse.move(chunk.path, `${chunkDir}/${hash}`);
      res.end("receive file chunk");
    }
  });

  if (req.url === "/merge") {
    const data: any = await resolvePost(req);
    const filePath = path.resolve(UPLOAD_DIR, data.filename);
    await mergeFileChunk(filePath, data.filename, data.chunkSize);
    res.end(JSON.stringify({ code: 0, message: "file merged success" }));
  }
});

const resolvePost = (req: http.IncomingMessage) => {
  return new Promise((resolve) => {
    let chunk = "";
    req.on("data", (data) => {
      chunk += data;
    });
    req.on("end", () => {
      resolve(JSON.parse(chunk));
    });
  });
};

const mergeFileChunk = async (
  filePath: string,
  fileName: string,
  chunkSize: number
) => {
  const chunkDir = path.resolve(UPLOAD_DIR, "chunkDir_" + fileName);
  const chunkPaths = await fse.readdir(chunkDir);

  chunkPaths.sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));

  await Promise.all(
    chunkPaths.map((chunkPath, index) => {
      return pipeStream(
        path.resolve(chunkDir, chunkPath),
        fse.createWriteStream(filePath, { start: index * chunkSize })
      );
    })
  );

  fse.rmdirSync(chunkDir);
};

const pipeStream = (chunkPath: string, fileWriteStream: fse.WriteStream) => {
  return new Promise((resolve) => {
    const chunkReadStream = fse.createReadStream(chunkPath);
    chunkReadStream.on("end", () => {
      fse.unlinkSync(chunkPath);
      resolve(true);
    });
    chunkReadStream.pipe(fileWriteStream);
  });
};

server.listen(3000, () => console.log("listening port 3000"));
