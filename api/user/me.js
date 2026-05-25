const { getUserById, requireAuth, updateUser, isSupabaseConfigured } = require("../../lib/auth");

module.exports = async function handler(req, res) {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ success: false, message: "Supabase 환경 변수가 설정되지 않았습니다." });
  }

  try {
    const auth = requireAuth(req);
    if (!auth) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다." });
    }

    if (req.method === "GET") {
      const user = await getUserById(auth.userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      }

      return res.status(200).json({ success: true, user });
    }

    if (req.method === "PATCH") {
      const { name, avatar, monthlyBudget, preferredCategories, preferredDietary } = req.body || {};
      const currentUser = await getUserById(auth.userId);
      if (!currentUser) {
        return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
      }

      const updatedUser = await updateUser(auth.userId, {
        name,
        avatar,
        settings: {
          ...currentUser.settings,
          monthlyBudget: monthlyBudget !== undefined ? monthlyBudget : currentUser.settings.monthlyBudget,
          preferredCategories: preferredCategories || currentUser.settings.preferredCategories,
          preferredDietary: preferredDietary || currentUser.settings.preferredDietary
        }
      });

      return res.status(200).json({ success: true, message: "사용자 정보가 업데이트되었습니다.", user: updatedUser });
    }

    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (error) {
    console.error("사용자 조회/수정 오류:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "서버 오류가 발생했습니다." });
  }
};