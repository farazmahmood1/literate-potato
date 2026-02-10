import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { initSocket } from "./src/config/socket.js";

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io ready`);
});
