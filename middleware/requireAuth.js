const jwt = require("jsonwebtoken");

// If your login code puts the user id under a different key, add it here.
const getUserId = (decoded) =>
  decoded.id ||
  decoded.userId ||
  decoded._id ||
  (decoded.user && (decoded.user.id || decoded.user._id));

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Please log in first" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = getUserId(decoded);
    if (!userId) {
      console.error("Token has no user id. Keys found:", Object.keys(decoded));
      return res.status(401).json({ message: "Token has no user id" });
    }
    req.userId = userId;
    next();
  } catch (error) {
    res.status(401).json({ message: "Session expired. Please log in again" });
  }
};

requireAuth.getUserId = getUserId;
module.exports = requireAuth;