const { app } = require("./app");
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

// 서버 시작
if (require.main === module) {
  app.listen(PORT, HOST, () => {
  const mask = (v) => {
    if (!v) return "(not set)";
    const s = String(v);
    if (s.length <= 6) return s.replace(/.(?=.{2})/g, "*");
    return s.slice(0, 4) + "…" + s.slice(-2);
  };

  const fs = require("fs");
  const envPath = require("path").join(process.cwd(), ".env");
  console.log("Server cwd:", process.cwd());
  console.log("Server __dirname:", __dirname);
  console.log(".env exists:", fs.existsSync(envPath), envPath);
  try {
    const envPreview = fs.readFileSync(envPath, "utf8").split("\n").slice(0, 20).join("\n");
    console.log(".env preview (first 20 lines):\n", envPreview.replace(/(JWT_SECRET=)(.*)/i, "$1<redacted>").replace(/(SUPABASE_SERVICE_ROLE_KEY=)(.*)/i, "$1<redacted>"));
  } catch (e) {
    console.log("Could not read .env file:", e.message);
  }
  console.log("process.env has keys:", {
    JWT_defined: Object.prototype.hasOwnProperty.call(process.env, "JWT_SECRET"),
    SUPABASE_defined: Object.prototype.hasOwnProperty.call(process.env, "SUPABASE_URL")
  });

  console.log(`
╔════════════════════════════════════════╗
║   🍲 Meal Fit 백엔드 서버               ║
╠════════════════════════════════════════╣
║  포트: ${PORT}                         ║
║  환경: ${process.env.NODE_ENV || "development"}               ║
║  URL: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}        ║
╚════════════════════════════════════════╝
  `);
  });
}

module.exports = { app };
