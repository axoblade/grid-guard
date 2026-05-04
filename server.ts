import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes for Nokia Proxy
  app.post("/api/nokia/location", async (req, res) => {
    const hostHeader = "network-as-code.nokia.rapidapi.com";
    const endpointHost = process.env.RAPIDAPI_HOST || "network-as-code.p-eu.rapidapi.com";
    const baseUrl = `https://${endpointHost}`;
    try {
      const { phoneNumber } = req.body;
      console.log(`Calling Nokia Location: ${baseUrl}/location-retrieval/v0/retrieve for ${phoneNumber}`);
      const response = await axios.post(
        `${baseUrl}/location-retrieval/v0/retrieve`,
        {
          device: { phoneNumber },
          maxAge: 60
        },
        {
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": hostHeader,
            "Content-Type": "application/json"
          }
        }
      );
      console.log(JSON.stringify(response.data));
      res.json(response.data);
    } catch (error: any) {
      const errDetail = JSON.stringify(error.response?.data || error.message);
      console.error(`Nokia Location Error: ${errDetail}`);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Location failed" });
    }
  });

  app.post("/api/nokia/verify-location", async (req, res) => {
    const hostHeader = "network-as-code.nokia.rapidapi.com";
    const endpointHost = process.env.RAPIDAPI_HOST || "network-as-code.p-eu.rapidapi.com";
    const baseUrl = `https://${endpointHost}`;
    try {
      const { phoneNumber, center, radius } = req.body;
      console.log(`Calling Nokia Verification: ${baseUrl}/location-verification/v1/verify for ${phoneNumber}`);
      const response = await axios.post(
        `${baseUrl}/location-verification/v1/verify`,
        {
          device: { phoneNumber },
          area: {
            areaType: "CIRCLE",
            center,
            radius
          }
        },
        {
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": hostHeader,
            "Content-Type": "application/json"
          }
        }
      );
      console.log(JSON.stringify(response.data));
      res.json(response.data);
    } catch (error: any) {
      const errDetail = JSON.stringify(error.response?.data || error.message);
      console.error(`Nokia Verification Error: ${errDetail}`);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Verification failed" });
    }
  });

  app.post("/api/nokia/sim-swap", async (req, res) => {
    const hostHeader = "network-as-code.nokia.rapidapi.com";
    const endpointHost = process.env.RAPIDAPI_HOST || "network-as-code.p-eu.rapidapi.com";
    const baseUrl = `https://${endpointHost}`;
    try {
      const { phoneNumber, maxAge = 240 } = req.body;
      // Many Nokia NAC deployments use v1 for SIM swap on RapidAPI
      const swapPath = "/passthrough/camara/v1/sim-swap/sim-swap/v0/check";
      console.log(`Calling Nokia SIM Swap: ${baseUrl}${swapPath} for ${phoneNumber}`);
      const response = await axios.post(
        `${baseUrl}${swapPath}`,
        { phoneNumber, maxAge },
        {
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": hostHeader,
            "Content-Type": "application/json"
          }
        }
      );
      console.log(JSON.stringify(response.data));
      res.json(response.data);
    } catch (error: any) {
      const errDetail = JSON.stringify(error.response?.data || error.message);
      console.error(`Nokia SIM Swap Error: ${errDetail} at ${error.config?.url}`);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "SIM Swap check failed" });
    }
  });

  app.post("/api/nokia/geofencing/subscribe", async (req, res) => {
    const hostHeader = "network-as-code.nokia.rapidapi.com";
    const endpointHost = process.env.RAPIDAPI_HOST || "network-as-code.p-eu.rapidapi.com";
    const baseUrl = `https://${endpointHost}`;
    try {
      const { phoneNumber, center, radius, sink } = req.body;
      console.log(`Creating Nokia Geofence Subscription: ${baseUrl}/geofencing-subscriptions/v0.3/subscriptions for ${phoneNumber}`);
      
      const response = await axios.post(
        `${baseUrl}/geofencing-subscriptions/v0.3/subscriptions`,
        {
          protocol: "HTTP",
          sink,
          types: ["org.camaraproject.geofencing-subscriptions.v0.area-left"],
          config: {
            subscriptionDetail: {
              device: { phoneNumber },
              area: {
                areaType: "CIRCLE",
                center,
                radius
              }
            },
            initialEvent: true,
            subscriptionMaxEvents: 100,
            subscriptionExpireTime: "2027-01-01T00:00:00Z"
          }
        },
        {
          headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": hostHeader,
            "Content-Type": "application/json"
          }
        }
      );
      console.log("Geofence Subscription Success:", JSON.stringify(response.data));
      res.json(response.data);
    } catch (error: any) {
      const errDetail = JSON.stringify(error.response?.data || error.message);
      console.error(`Nokia Geofence Error: ${errDetail}`);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Geofence subscription failed" });
    }
  });

  // Webhook receiver for Nokia Notifications
  app.post("/api/nokia/webhook", (req, res) => {
    console.log("RECEIVED NOKIA NOTIFICATION:", JSON.stringify(req.body));
    // Here we would typically trigger an alert to the connected clients or update DB
    res.status(204).send();
  });


  app.post("/api/sms/send", async (req, res) => {
    try {
      const { phone, msg } = req.body;
      const url = `https://instantsms.eurosatgroup.com/API/SMS_Sender.aspx?unm=${encodeURIComponent(process.env.SMS_USER || "")}&ps=${encodeURIComponent(process.env.SMS_PASS || "")}&message=${encodeURIComponent(msg)}&receipients=${encodeURIComponent(phone)}`;
      const response = await axios.get(url);
      res.json({ success: true, data: response.data });
    } catch (error: any) {
      console.error("SMS Send Error:", error.message);
      res.status(500).json({ error: "Failed to send SMS" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
