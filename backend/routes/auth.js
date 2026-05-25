const express = require("express");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { isSupabaseConfigured, isStorageReady, createUser, authenticateUser, findUserByLogin, createUserLocal, authenticateUserLocal, findUserLocal } = require("../services/userStore");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key_change_in_production_12345";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";

const generateToken = (userId, email, extraClaims = {}) => {
  return jwt.sign({ userId, email, ...extraClaims }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

router.post(
  "/signup",
  async (req, res) => {
    // simplified signup handler (bypass express-validator) to aid fallback testing
    console.log('HTTP /signup body:', req.body);
    if (!isStorageReady()) {
      return res.status(503).json({ success: false, message: "저장소가 준비되지 않아 회원가입을 사용할 수 없습니다." });
    }

    try {
      const { id, email, password, passwordConfirm } = req.body;
      if (!id || !email || !password || password !== passwordConfirm) {
        return res.status(400).json({ success: false, message: "입력 데이터가 올바르지 않습니다." });
      }

      const existingUser = await findUserByLogin(id);
      if (existingUser) return res.status(409).json({ success: false, message: "이미 사용 중인 아이디입니다." });

      const existingEmailUser = await findUserByLogin(email);
      if (existingEmailUser) return res.status(409).json({ success: false, message: "이미 가입된 이메일입니다." });

      const newUser = await createUser({ username: id, email, password, name: id });
      const token = generateToken(newUser.databaseId, newUser.email);
      return res.status(201).json({ success: true, message: "회원가입이 완료되었습니다.", token, user: newUser });
    } catch (error) {
      console.error("회원가입 오류:", error);
      return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다.", error: error && error.message ? error.message : error });
    }
  }
);

router.post(
  "/login",
  [
    body("id").trim().notEmpty().withMessage("아이디를 입력해주세요."),
    body("password").notEmpty().withMessage("비밀번호를 입력해주세요.")
  ],
  async (req, res) => {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 로그인을 사용할 수 없습니다."
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    try {
      const { id, password } = req.body;
      const user = await authenticateUser({ identifier: id, password });

      if (!user) {
        return res.status(401).json({ success: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." });
      }

      const token = generateToken(user.databaseId, user.email);
      return res.status(200).json({ success: true, message: "로그인이 완료되었습니다.", token, user });
    } catch (error) {
      console.error("로그인 오류:", error);
      return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다.", error: error && error.message ? error.message : error });
    }
  }
);

router.get("/status", (req, res) => {
  return res.status(200).json({
    success: true,
    databaseReady: isStorageReady(),
    supabase: isSupabaseConfigured(),
    loginMethods: ["password"]
  });
});

module.exports = router;

// Local-only endpoints (useful when Supabase/Mongo aren't available)
router.post("/local/signup", async (req, res) => {
  try {
    const { id, email, password, passwordConfirm } = req.body;
    if (!id || !email || !password || password !== passwordConfirm) {
      return res.status(400).json({ success: false, message: "입력 데이터가 올바르지 않습니다." });
    }
    const existingUser = await findUserLocal(id);
    if (existingUser) return res.status(409).json({ success: false, message: "이미 사용 중인 아이디입니다." });
    const existingEmailUser = await findUserLocal(email);
    if (existingEmailUser) return res.status(409).json({ success: false, message: "이미 가입된 이메일입니다." });
    const newUser = await createUserLocal({ username: id, email, password, name: id });
    const token = generateToken(newUser.databaseId, newUser.email);
    return res.status(201).json({ success: true, message: "로컬 회원가입 완료.", token, user: newUser });
  } catch (error) {
    console.error('local signup error', error);
    return res.status(500).json({ success: false, message: '서버 오류', error: error && error.message ? error.message : error });
  }
});

router.post("/local/login", async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ success: false, message: '입력 데이터가 올바르지 않습니다.' });
    const user = await authenticateUserLocal({ identifier: id, password });
    if (!user) return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    const token = generateToken(user.databaseId, user.email);
    return res.status(200).json({ success: true, message: '로컬 로그인 완료.', token, user });
  } catch (error) {
    console.error('local login error', error);
    return res.status(500).json({ success: false, message: '서버 오류', error: error && error.message ? error.message : error });
  }
});
