import "dotenv/config";
import { createServer } from "http";
import app from "./app.js";
import { initSocket } from "./src/config/socket.js";
import { startJobPostExpiryTask } from "./src/controllers/job-post.controller.js";
import { cleanupStaleCalls } from "./src/controllers/call.controller.js";
import { cleanupStaleTrials } from "./src/services/notification.service.js";

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.io
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io ready`);

  // Start background tasks
  startJobPostExpiryTask();

  // Cleanup stale data from previous server instance
  cleanupStaleCalls();
  cleanupStaleTrials();
});
