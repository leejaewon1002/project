const express = require("express");
const { authMiddleware } = require("../middleware/auth");
const {
  isStorageReady,
  getUserById,
  updateUser,
  appendEntry
} = require("../services/userStore");

// support account deletion
const { deleteUser } = require("../services/userStore");

const router = express.Router();

router.get("/me", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 사용자 정보를 불러올 수 없습니다."
      });
    }

    const user = await getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("사용자 조회 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

router.patch("/me", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 사용자 정보를 수정할 수 없습니다."
      });
    }

    const { name, avatar, monthlyBudget, preferredCategories, preferredDietary } = req.body;
    const currentUser = await getUserById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }

    const updatedUser = await updateUser(req.userId, {
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
  } catch (error) {
    console.error("사용자 업데이트 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

router.get("/ingredients", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 재료 목록을 불러올 수 없습니다."
      });
    }

    const user = await getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    return res.status(200).json({ success: true, ingredients: user.ingredients || [] });
  } catch (error) {
    console.error("재료 목록 조회 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

router.post("/ingredients", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 재료를 추가할 수 없습니다."
      });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "재료명은 필수입니다." });
    }
    const user = await appendEntry(req.userId, "ingredients", name);
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    return res.status(201).json({ success: true, message: "재료가 추가되었습니다.", ingredients: user.ingredients });
  } catch (error) {
    console.error("재료 추가 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

router.get("/shopping", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 장보기 목록을 불러올 수 없습니다."
      });
    }

    const user = await getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    return res.status(200).json({ success: true, shopping: user.shopping || [] });
  } catch (error) {
    console.error("장보기 목록 조회 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

router.post("/shopping", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({
        success: false,
        message: "저장소가 준비되지 않아 장보기 항목을 추가할 수 없습니다."
      });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "장보기 항목 이름은 필수입니다." });
    }
    const user = await appendEntry(req.userId, "shopping", name);
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }
    return res.status(201).json({ success: true, message: "장보기 항목이 추가되었습니다.", shopping: user.shopping });
  } catch (error) {
    console.error("장보기 추가 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

// Delete account
router.delete("/me", authMiddleware, async (req, res) => {
  try {
    if (!isStorageReady()) {
      return res.status(503).json({ success: false, message: "저장소가 준비되지 않아 사용자를 삭제할 수 없습니다." });
    }

    const ok = await deleteUser(req.userId);
    if (!ok) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다." });
    }

    return res.status(200).json({ success: true, message: "사용자 계정이 삭제되었습니다." });
  } catch (error) {
    console.error("사용자 삭제 오류:", error);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

module.exports = router;

