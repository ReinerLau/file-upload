import fse from "fs-extra";
import http from "http";
import multiparty from "multiparty";
import path from "path";

const server = http.createServer();

/**
 * 切片和合并文件所在路径
 */
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
      const chunkHash = fields.chunkHash[0];
      const fileHash = fields.fileHash[0];
      const chunkDir = path.resolve(UPLOAD_DIR, "chunkDir_" + fileHash);

      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir);
      }

      await fse.move(chunk.path, `${chunkDir}/${chunkHash}`);
      res.end("receive file chunk");
    }
  });

  if (req.url === "/merge") {
    const data = await resolvePost(req);
    const extension = extractExt(data.filename);
    const filePath = path.resolve(UPLOAD_DIR, `${data.fileHash}${extension}`);
    await mergeFileChunk(filePath, data.fileHash, data.chunkSize);
    res.end(JSON.stringify({ code: 0, message: "file merged success" }));
  } else if (req.url === "/verify") {
    const data = await resolvePost(req);
    const { fileHash, fileName } = data;
    const extension = extractExt(fileName);
    const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${extension}`);
    if (fse.existsSync(filePath)) {
      res.end(JSON.stringify({ shouldUpload: false }));
    } else {
      res.end(
        JSON.stringify({
          shouldUpload: true,
          uploadedList: await createUploadedList(fileHash),
        })
      );
    }
  }
});

const createUploadedList = async (fileHash: string) => {
  const chunkPath = path.resolve(UPLOAD_DIR, `chunkDir_${fileHash}`);
  return fse.existsSync(chunkPath) ? await fse.readdir(chunkPath) : [];
};

/**
 * 提取文件拓展名
 * @param fileName 文件名
 * @returns 拓展名
 */
const extractExt = (fileName: string) =>
  fileName.slice(fileName.lastIndexOf("."), fileName.length);

/**
 * 解析合并请求信息
 * @param req 请求对象
 * @returns promise
 */
const resolvePost = (
  req: http.IncomingMessage
): Promise<Record<string, any>> => {
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

/**
 * 合并切片
 */
const mergeFileChunk = async (
  filePath: string,
  fileHash: string,
  chunkSize: number
) => {
  const chunkDir = path.resolve(UPLOAD_DIR, "chunkDir_" + fileHash);
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

/**
 * 读取切片数据写入到最终的合并文件中
 * @param chunkPath 每个切片的路径
 * @param fileWriteStream 合并文件的可写流
 * @returns
 */
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
