const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Listing = require("../models/Listing");
const cloudinary = require("../config/cloudinary");

// never send the password or the private ID-photo references to the browser
const SAFE_SELECT = "-password -verification.documentPublicId -verification.selfiePublicId";

const DOC_TYPES = ["NIN slip", "Driver's license", "International passport", "Voter's card"];

const toDataUri = (file) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

const destroyPrivate = (ids) =>
  Promise.all(
    ids.filter(Boolean).map((id) =>
      cloudinary.uploader.destroy(id, { type: "authenticated" }).catch(() => {})
    )
  );

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(SAFE_SELECT);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Could not load profile" });
  }
};

/* ---------- Profile photo ---------- */

exports.updateAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please choose a photo" });

    const current = await User.findById(req.userId).select("avatarPublicId");
    if (!current) return res.status(404).json({ message: "User not found" });

    const uploaded = await cloudinary.uploader.upload(toDataUri(req.file), {
      folder: "tradebybarter/avatars",
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });

    const updated = await User.findByIdAndUpdate(
      req.userId,
      { avatarUrl: uploaded.secure_url, avatarPublicId: uploaded.public_id },
      { new: true }
    ).select("avatarUrl");

    // if the schema has no avatarUrl field, Mongoose skips it silently, so check
    if (!updated || updated.avatarUrl !== uploaded.secure_url) {
      await cloudinary.uploader.destroy(uploaded.public_id).catch(() => {});
      return res.status(500).json({
        message: "Photo could not be saved. Add avatarUrl and avatarPublicId to the User model.",
      });
    }

    if (current.avatarPublicId) {
      await cloudinary.uploader.destroy(current.avatarPublicId).catch(() => {});
    }
    res.json({ avatarUrl: updated.avatarUrl });
  } catch (error) {
    console.error("Avatar upload failed:", error.message);
    res.status(500).json({ message: "Could not update photo" });
  }
};

exports.removeAvatar = async (req, res) => {
  try {
    const current = await User.findById(req.userId).select("avatarPublicId");
    if (!current) return res.status(404).json({ message: "User not found" });

    if (current.avatarPublicId) {
      await cloudinary.uploader.destroy(current.avatarPublicId).catch(() => {});
    }
    await User.findByIdAndUpdate(req.userId, { avatarUrl: "", avatarPublicId: "" });
    res.json({ avatarUrl: "" });
  } catch (error) {
    res.status(500).json({ message: "Could not remove photo" });
  }
};

/* ---------- Settings ---------- */

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, city, bio } = req.body;
    const updates = {};

    if (typeof name === "string" && name.trim()) {
      if (name.trim().length > 60) {
        return res.status(400).json({ message: "Name can be up to 60 characters" });
      }
      // works whichever of these your User model uses
      const field = ["fullName", "name", "username"].find((f) => User.schema.path(f));
      if (!field) {
        return res.status(400).json({ message: "No name field found on the User model" });
      }
      updates[field] = name.trim();
    }

    if (typeof phone === "string") {
      const clean = phone.trim();
      if (clean && !/^(\+234|0)[789][01]\d{8}$/.test(clean)) {
        return res.status(400).json({ message: "Enter a valid Nigerian phone number" });
      }
      updates.phone = clean;
    }

    if (typeof city === "string") updates.city = city.trim().slice(0, 60);
    if (typeof bio === "string") updates.bio = bio.trim().slice(0, 300);

    const user = await User.findByIdAndUpdate(req.userId, updates, {
      new: true,
      runValidators: true,
    }).select(SAFE_SELECT);

    res.json(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That name is already taken" });
    }
    res.status(500).json({ message: "Could not save your details" });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({ message: "Enter your current and new password" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: "New password must be different" });
    }

    const user = await User.findById(req.userId).select("+password");
    if (!user || !user.password) return res.status(404).json({ message: "Account not found" });

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) return res.status(400).json({ message: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    // findByIdAndUpdate skips save hooks, so the password can't get hashed twice
    await User.findByIdAndUpdate(req.userId, { password: hash });

    res.json({ message: "Password changed" });
  } catch (error) {
    res.status(500).json({ message: "Could not change password" });
  }
};

/* ---------- Identity verification ---------- */

exports.submitVerification = async (req, res) => {
  const uploadedIds = [];
  try {
    const { documentType } = req.body;
    const idFile = req.files?.idDocument?.[0];
    const selfieFile = req.files?.selfie?.[0];

    if (!DOC_TYPES.includes(documentType)) {
      return res.status(400).json({ message: "Choose a valid ID type" });
    }
    if (!idFile || !selfieFile) {
      return res.status(400).json({ message: "Add both a photo of your ID and a selfie" });
    }

    const current = await User.findById(req.userId).select("verification");
    if (!current) return res.status(404).json({ message: "User not found" });

    const status = current.verification?.status || "unverified";
    if (status === "pending") {
      return res.status(409).json({ message: "Your documents are already being reviewed" });
    }
    if (status === "verified") {
      return res.status(409).json({ message: "You are already verified" });
    }

    // "authenticated" means these photos can't be opened by URL
    const upload = (file) =>
      cloudinary.uploader.upload(toDataUri(file), {
        folder: "tradebybarter/verification",
        type: "authenticated",
        resource_type: "image",
      });

    const idUpload = await upload(idFile);
    uploadedIds.push(idUpload.public_id);
    const selfieUpload = await upload(selfieFile);
    uploadedIds.push(selfieUpload.public_id);

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        verification: {
          status: "pending",
          documentType,
          documentPublicId: idUpload.public_id,
          selfiePublicId: selfieUpload.public_id,
          submittedAt: new Date(),
          rejectionReason: "",
        },
      },
      { new: true }
    ).select(SAFE_SELECT);

    if (user?.verification?.status !== "pending") {
      await destroyPrivate(uploadedIds);
      return res.status(500).json({ message: "Could not save. Add the verification fields to the User model." });
    }

    // a rejected user is resubmitting: delete their old photos
    await destroyPrivate([
      current.verification?.documentPublicId,
      current.verification?.selfiePublicId,
    ]);

    res.json(user.toObject().verification);
  } catch (error) {
    console.error("Verification submit failed:", error.message);
    await destroyPrivate(uploadedIds);
    res.status(500).json({ message: "Could not submit your documents" });
  }
};

/* ---------- Saved items ---------- */

exports.getSaved = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("savedItems")
      .populate({ path: "savedItems", options: { sort: { createdAt: -1 } } });
    res.json((user?.savedItems || []).filter(Boolean));
  } catch (error) {
    res.status(500).json({ message: "Could not load saved items" });
  }
};

exports.toggleSaved = async (req, res) => {
  try {
    const { listingId } = req.params;
    if (!mongoose.isValidObjectId(listingId)) {
      return res.status(400).json({ message: "Invalid listing" });
    }
    if (!(await Listing.exists({ _id: listingId }))) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const user = await User.findById(req.userId).select("savedItems");
    const isSaved = user.savedItems.some((id) => id.toString() === listingId);

    const updated = await User.findByIdAndUpdate(
      req.userId,
      isSaved ? { $pull: { savedItems: listingId } } : { $addToSet: { savedItems: listingId } },
      { new: true }
    ).select("savedItems");

    res.json({ saved: !isSaved, savedItems: updated.savedItems });
  } catch (error) {
    res.status(500).json({ message: "Could not update saved items" });
  }
};