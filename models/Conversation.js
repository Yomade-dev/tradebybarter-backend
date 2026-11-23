const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    pairKey: { type: String, required: true, unique: true }, // the two users + the item
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing" },
    listingTitle: { type: String, default: "" },  // saved copies, so the chat still
    listingImage: { type: String, default: "" },  // makes sense if the item is deleted
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    unread: { type: Map, of: Number, default: {} }, // { userId: how many they haven't read }
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);