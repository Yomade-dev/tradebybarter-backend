const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
avatarPublicId: { type: String, default: "" },
savedItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "Listing" }],
phone: { type: String, default: "" },
city: { type: String, default: "" },
bio: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true },
 {
  status: { type: String, enum: ["unverified", "pending", "verified", "rejected"], default: "unverified" },
  documentType: { type: String, default: "" },
  documentPublicId: { type: String, default: "" },
  selfiePublicId: { type: String, default: "" },
  submittedAt: Date,
  rejectionReason: { type: String, default: "" },
}
);

module.exports = mongoose.model("User", userSchema);