const { authenticateUser, signToken, isSupabaseConfigured } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ success: false, message: "Supabase 환경 변수가 설정되지 않았습니다." });
  }

  try {
    const { id, password } = req.body || {};
    if (!id || !password) {
      return res.status(400).json({ success: false, message: "입력 데이터가 올바르지 않습니다." });
    }

    const user = await authenticateUser({ identifier: id, password });
    if (!user) {
      return res.status(401).json({ success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." });
    }

    const token = signToken({ userId: user.databaseId, email: user.email });
    return res.status(200).json({ success: true, message: "로그인이 완료되었습니다.", token, user });
  } catch (error) {
    console.error("로그인 오류:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "서버 오류가 발생했습니다." });
  }
};