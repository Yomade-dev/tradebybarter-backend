const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const http = require("http");
const { initSocket } = require("./socket");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/listings", require("./routes/listingRoutes"));
app.use("/api/profile", require("./routes/userRoutes"));

app.get("/", (req, res) => {
  res.json({ message: "TradeByBarter API is running" });
});


const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));