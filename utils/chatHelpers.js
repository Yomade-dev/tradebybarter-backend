// only these user fields are ever shared with the other person in a chat
const PUBLIC_USER_FIELDS = "fullName name username firstName lastName avatarUrl";

const nameOf = (u) =>
  u?.fullName ||
  u?.name ||
  u?.username ||
  [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
  "User";

// a conversation as one particular person sees it
const summaryFor = (conversation, userId) => {
  const me = String(userId);
  const other = conversation.participants.find((p) => String(p._id) !== me) || {};
  const unread =
    conversation.unread instanceof Map
      ? conversation.unread.get(me)
      : conversation.unread?.[me];

  return {
    _id: String(conversation._id),
    other: {
      _id: other._id ? String(other._id) : "",
      name: nameOf(other),
      avatarUrl: other.avatarUrl || "",
    },
    listingTitle: conversation.listingTitle,
    listingImage: conversation.listingImage,
    lastMessage: conversation.lastMessage,
    lastMessageAt: conversation.lastMessageAt,
    unread: unread || 0,
  };
};

module.exports = { PUBLIC_USER_FIELDS, nameOf, summaryFor };