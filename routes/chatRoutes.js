const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const { startConversation, listConversations, getMessages } = require("../controllers/chatController");

router.use(requireAuth);

router.get("/conversations", listConversations);
router.post("/conversations", startConversation);
router.get("/conversations/:id/messages", getMessages);

module.exports = router;