const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    category: {
      type: String,
      enum: ["Phones & gadgets", "Fashion", "Home & kitchen", "Books & study", "Games & consoles", "Sports & bikes", "Other"],
      default: "Other",
    },
    condition: { type: String, enum: ["New", "Like new", "Good", "Fair"], default: "Good" },
    wants: { type: String, trim: true, default: "" },
    imageUrl: { type: String, required: true },       // Cloudinary link
    imagePublicId: { type: String, required: true },  // lets you delete the image later
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // filled in once login/JWT exists
  },
  { timestamps: true }
);

module.exports = mongoose.model("Listing", listingSchema);