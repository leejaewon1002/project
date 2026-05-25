const { createClient } = require("@supabase/supabase-js");

let supabaseClient = null;

const isSupabaseConfigured = () => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
};

const connectDB = async () => {
  if (!isSupabaseConfigured()) {
    console.error("Supabase 환경 변수가 설정되지 않았습니다. SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인하세요.");
    return false;
  }

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
};

const getSupabaseClient = () => supabaseClient;

module.exports = {
  connectDB,
  getSupabaseClient,
  isSupabaseConfigured
};
