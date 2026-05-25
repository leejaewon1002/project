require("dotenv").config({ override: true });
// If some env vars are still present but empty (Windows user/system env),
// parse the backend/.env and set non-empty values explicitly.
try {
  const fs = require("fs");
  const p = require("path").join(__dirname, ".env");
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    const parsed = {};
    lines.forEach((ln) => {
      const m = ln.match(/^\s*([A-Z0-9_]+)=(.*)$/i);
      if (m) {
        const k = m[1];
        let v = m[2] || "";
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        parsed[k] = v;
        if (v && typeof v === "string") {
          process.env[k] = v;
        }
      }
    });
    console.log("Parsed .env keys sample:", {
      JWT_from_file: parsed.JWT_SECRET ? `<len=${parsed.JWT_SECRET.length}>` : "<empty>",
      SUPABASE_from_file: parsed.SUPABASE_URL ? "<set>" : "<empty>"
    });
  }
} catch (e) {
  // don't block startup on diagnostics
}
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

app.set("trust proxy", true);

const corsOptions = {
  origin: process.env.NODE_ENV !== "production" ? true : process.env.FRONTEND_URL,
  credentials: true
};

// 미들웨어
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..")));

// 데이터베이스 연결
connectDB();

// 기본 라우트
app.get("/", (req, res) => {
  res.json({
    message: "Meal Fit 백엔드 서버",
    version: "1.0.0",
    status: "running"
  });
});

// 헬스 체크
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString()
  });
});

// 라우트 등록
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

// 404 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "요청한 엔드포인트를 찾을 수 없습니다."
  });
});

// 에러 핸들링
app.use((err, req, res, next) => {
  console.error("서버 에러:", err);
  res.status(500).json({
    success: false,
    message: "서버 오류가 발생했습니다.",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// 서버 시작
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
