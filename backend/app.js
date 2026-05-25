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

app.set("trust proxy", true);

const allowedOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }

    if (!origin) {
      return callback(null, true);
    }

    if (!allowedOrigins.length) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS 차단: ${origin}`));
  },
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

module.exports = { app };