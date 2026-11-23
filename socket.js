const { Server } = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const requireAuth = require("./middleware/requireAuth");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");
const { summaryFor, PUBLIC_USER_FIELDS } = require("./utils/chatHelpers");

const MAX_LENGTH = 1000;

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || "http://localhost:5173" },
  });

  // only people with a valid login token can connect
  io.use((socket, next) => {
    try {
      const decoded = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      const userId = requireAuth.getUserId(decoded);
      if (!userId) return next(new Error("Unauthorized"));
      socket.userId = String(userId);
      next();
    } catch (error) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const me = socket.userId;
    socket.join(`user:${me}`); // every tab or phone of this user listens here

    let recentSends = []; // simple spam guard

    socket.on("message:send", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const conversationId = payload?.conversationId;
        const text = typeof payload?.text === "string" ? payload.text.trim() : "";

        if (!mongoose.isValidObjectId(conversationId)) {
          return reply({ ok: false, message: "Invalid conversation" });
        }
        if (!text || text.length > MAX_LENGTH) {
          return reply({ ok: false, message: `Message must be 1 to ${MAX_LENGTH} characters` });
        }

        const now = Date.now();
        recentSends = recentSends.filter((t) => now - t < 10000);
        if (recentSends.length >= 20) {
          return reply({ ok: false, message: "You're sending messages too fast" });
        }
        recentSends.push(now);

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: me,
        }).select("participants");
        if (!conversation) return reply({ ok: false, message: "Conversation not found" });

        const recipient = conversation.participants.map(String).find((id) => id !== me);

        const message = await Message.create({ conversation: conversation._id, sender: me, text });

        const updated = await Conversation.findByIdAndUpdate(
          conversation._id,
          {
            lastMessage: text.slice(0, 120),
            lastMessageAt: message.createdAt,
            $inc: { [`unread.${recipient}`]: 1 },
          },
          { new: true }
        ).populate("participants", PUBLIC_USER_FIELDS);

        const out = {
          _id: String(message._id),
          conversation: String(conversation._id),
          sender: me,
          text: message.text,
          createdAt: message.createdAt,
        };

        io.to(`user:${recipient}`).emit("message:new", {
          message: out,
          conversation: summaryFor(updated, recipient),
        });
        io.to(`user:${me}`).emit("message:new", {
          message: out,
          conversation: summaryFor(updated, me),
        });

        reply({ ok: true });
      } catch (error) {
        console.error("message:send failed:", error.message);
        reply({ ok: false, message: "Could not send message" });
      }
    });

    socket.on("conversation:read", async (payload) => {
      try {
        const conversationId = payload?.conversationId;
        if (!mongoose.isValidObjectId(conversationId)) return;
        await Conversation.updateOne(
          { _id: conversationId, participants: me },
          { $set: { [`unread.${me}`]: 0 } }
        );
      } catch (error) {
        console.error("conversation:read failed:", error.message);
      }
    });

    socket.on("typing", async (payload) => {
      try {
        const conversationId = payload?.conversationId;
        if (!mongoose.isValidObjectId(conversationId)) return;

        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: me,
        })
          .select("participants")
          .lean();
        if (!conversation) return;

        const other = conversation.participants.map(String).find((id) => id !== me);
        io.to(`user:${other}`).emit("typing", {
          conversationId,
          isTyping: Boolean(payload?.isTyping),
        });
      } catch (error) {
        /* ignore typing errors */
      }
    });
  });

  return io;
};

module.exports = { initSocket };