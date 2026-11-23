const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Listing = require("../models/Listing");
const { summaryFor, PUBLIC_USER_FIELDS } = require("../utils/chatHelpers");

// Chat button on an item: find or create the conversation with its owner
exports.startConversation = async (req, res) => {
  try {
    const { listingId } = req.body;
    if (!mongoose.isValidObjectId(listingId)) {
      return res.status(400).json({ message: "Invalid item" });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ message: "Item not found" });
    if (!listing.owner) {
      return res.status(400).json({ message: "This item has no owner to chat with" });
    }

    const me = String(req.userId);
    const owner = String(listing.owner);
    if (me === owner) {
      return res.status(400).json({ message: "That's your own item" });
    }

    // one conversation per pair of people per item
    const pairKey = `${[me, owner].sort().join("_")}_${listing._id}`;

    const conversation = await Conversation.findOneAndUpdate(
      { pairKey },
      {
        $setOnInsert: {
          participants: [me, owner],
          listing: listing._id,
          listingTitle: listing.title,
          listingImage: listing.imageUrl,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("participants", PUBLIC_USER_FIELDS);

    res.json(summaryFor(conversation, me));
  } catch (error) {
    console.error("Start conversation failed:", error.message);
    res.status(500).json({ message: "Could not start the chat" });
  }
};

exports.listConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
      lastMessage: { $ne: "" }, // hide chats nobody has written in yet
    })
      .sort({ lastMessageAt: -1 })
      .populate("participants", PUBLIC_USER_FIELDS)
      .lean();

    res.json(conversations.map((c) => summaryFor(c, req.userId)));
  } catch (error) {
    res.status(500).json({ message: "Could not load conversations" });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid conversation" });
    }

    // only the two people in the chat may read it
    const conversation = await Conversation.findOne({ _id: id, participants: req.userId }).select("_id");
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    const messages = await Message.find({ conversation: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: "Could not load messages" });
  }
};