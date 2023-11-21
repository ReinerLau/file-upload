import http from "http";

const server = http.createServer();

// server.on("request", async (req, res) => {
//   res.setHeader("Access-Control-Allow-Origin", "*");
//   res.setHeader("Access-Control-Allow-Headers", "*");
//   if (req.method === "OPTIONS") {
//     res.statusCode = 200;
//     res.end();
//     return;
//   }
// });

server.listen(3000, () => console.log("listening port 3000"));
