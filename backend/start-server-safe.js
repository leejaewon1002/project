const net = require("net");

const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || "0.0.0.0";

function isPortInUse(checkPort, checkHost = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: checkPort, host: checkHost });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.setTimeout(1200, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const inUse = await isPortInUse(port);
  if (inUse) {
    console.log(`[mealfit] Port ${port} is already in use. Backend is probably running.`);
    process.exit(0);
  }

  process.chdir(__dirname);
  process.env.PORT = String(port);
  process.env.HOST = host;
  require("./server");
})();
