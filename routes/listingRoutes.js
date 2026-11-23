const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const requireAuth = require("../middleware/requireAuth");
const {
  createListing,
  getListings,
  getMyListings,
  deleteListing,
} = require("../controllers/listingController");

const uploadOne = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

router.get("/", getListings);
router.get("/mine", requireAuth, getMyListings);
router.post("/", requireAuth, uploadOne, createListing);
router.delete("/:id", requireAuth, deleteListing);

module.exports = router;