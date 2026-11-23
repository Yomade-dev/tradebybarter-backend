const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const { PUBLIC_USER_FIELDS, nameOf } = require("../utils/chatHelpers");

const uploadToCloudinary = (file) =>
  cloudinary.uploader.upload(
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
    { folder: "tradebybarter/listings", resource_type: "image" }
  );

// the poster as other people see them (never email, phone or ID photos)
const publicOwner = (owner) =>
  owner && owner._id
    ? { _id: String(owner._id), name: nameOf(owner), avatarUrl: owner.avatarUrl || "" }
    : null;

exports.createListing = async (req, res) => {
  try {
    const { title, description, category, condition, wants } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Please add a photo of the item" });
    }

    const result = await uploadToCloudinary(req.file);

    const listing = await Listing.create({
      title,
      description,
      category,
      condition,
      wants,
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
      owner: req.userId,
    });

    res.status(201).json(listing);
  } catch (error) {
    console.error("Create listing failed:", error.message);
    res.status(500).json({ message: "Could not create listing" });
  }
};

exports.getListings = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (typeof search === "string" && search.trim()) {
      const safe = search.trim().slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      filter.$or = [{ title: regex }, { description: regex }, { category: regex }, { wants: regex }];
    }

    const listings = await Listing.find(filter)
      .sort({ createdAt: -1 })
      .limit(60)
      .populate("owner", PUBLIC_USER_FIELDS)
      .lean();

    res.json(listings.map((l) => ({ ...l, owner: publicOwner(l.owner) })));
  } catch (error) {
    res.status(500).json({ message: "Could not fetch listings" });
  }
};

exports.getListing = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid item" });
    }

    const listing = await Listing.findById(id)
      .populate("owner", `${PUBLIC_USER_FIELDS} city bio verification.status createdAt`)
      .lean();
    if (!listing) return res.status(404).json({ message: "Item not found" });

    let owner = null;
    if (listing.owner && listing.owner._id) {
      const o = listing.owner;
      owner = {
        ...publicOwner(o),
        city: o.city || "",
        bio: o.bio || "",
        verified: o.verification?.status === "verified",
        memberSince: o.createdAt || o._id.getTimestamp(),
        itemCount: await Listing.countDocuments({ owner: o._id }),
      };
    }

    res.json({ ...listing, owner });
  } catch (error) {
    res.status(500).json({ message: "Could not load this item" });
  }
};

exports.getMyListings = async (req, res) => {
  try {
    const listings = await Listing.find({ owner: req.userId }).sort({ createdAt: -1 });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ message: "Could not fetch your listings" });
  }
};

exports.deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    if (String(listing.owner) !== String(req.userId)) {
      return res.status(403).json({ message: "You can only delete your own listings" });
    }

    await cloudinary.uploader.destroy(listing.imagePublicId).catch(() => {});
    await listing.deleteOne();
    await User.updateMany({ savedItems: listing._id }, { $pull: { savedItems: listing._id } });

    res.json({ message: "Listing deleted" });
  } catch (error) {
    res.status(500).json({ message: "Could not delete listing" });
  }
};