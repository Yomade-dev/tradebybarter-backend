const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const upload = require("../middleware/upload");
const c = require("../controllers/userController");

const uploadOne = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

const uploadVerification = (req, res, next) => {
  upload.fields([
    { name: "idDocument", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

router.use(requireAuth);

router.get("/me", c.getMe);
router.put("/me", c.updateProfile);
router.put("/me/password", c.changePassword);
router.put("/me/avatar", uploadOne, c.updateAvatar);
router.delete("/me/avatar", c.removeAvatar);
router.post("/me/verification", uploadVerification, c.submitVerification);
router.get("/saved", c.getSaved);
router.post("/saved/:listingId", c.toggleSaved);

module.exports = router;