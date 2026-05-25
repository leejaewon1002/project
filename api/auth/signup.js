const { createUser, findUserByLogin, signToken, ensureSupabase, isSupabaseConfigured } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ success: false, message: "Supabase 환경 변수가 설정되지 않았습니다." });
  }

  try {
    ensureSupabase();

    const { id, email, password, passwordConfirm } = req.body || {};
    if (!id || !email || !password || password !== passwordConfirm) {
      return res.status(400).json({ success: false, message: "입력 데이터가 올바르지 않습니다." });
    }

    const existingUser = await findUserByLogin(id);
    if (existingUser) {
      return res.status(409).json({ success: false, message: "이미 사용 중인 아이디입니다." });
    }

    const existingEmailUser = await findUserByLogin(email);
    if (existingEmailUser) {
      return res.status(409).json({ success: false, message: "이미 가입된 이메일입니다." });
    }

    const newUser = await createUser({ username: id, email, password, name: id });
    const token = signToken({ userId: newUser.databaseId, email: newUser.email });

    return res.status(201).json({ success: true, message: "회원가입이 완료되었습니다.", token, user: newUser });
  } catch (error) {
    console.error("회원가입 오류:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "서버 오류가 발생했습니다." });
  }
};