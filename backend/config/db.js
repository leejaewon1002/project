const { createClient } = require("@supabase/supabase-js");
const mongoose = require("mongoose");

let supabaseClient = null;
let mongoConnected = false;

const isSupabaseConfigured = () => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
};

const isMongoConfigured = () => {
  return Boolean(process.env.MONGODB_URI);
};

const connectDB = async () => {
  // Prefer Supabase if configured
  if (isSupabaseConfigured()) {
    if (!supabaseClient) {
      supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    }

    console.log("Supabase 클라이언트가 초기화되었습니다.");
    return true;
  }

  // Fallback to MongoDB if Supabase not configured
  if (isMongoConfigured() && !mongoConnected) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      mongoConnected = true;
      console.log("MongoDB에 성공적으로 연결되었습니다.");
      return true;
    } catch (err) {
      console.error("MongoDB 연결 실패:", err.message || err);
      return false;
    }
  }

  console.error("Supabase나 MongoDB 환경 변수가 설정되지 않았습니다. SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 또는 MONGODB_URI를 확인하세요.");
  return false;
};

const getSupabaseClient = () => supabaseClient;

module.exports = {
  connectDB,
  getSupabaseClient,
  isSupabaseConfigured,
  isMongoConfigured
};
