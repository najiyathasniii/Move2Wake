const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// ========================================
// CONNECT TO MONGODB
// ========================================

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully!");
    console.log("Database:", mongoose.connection.name);
    console.log("Host:", mongoose.connection.host);
  })
  .catch((error) => {
    console.error("MongoDB Connection Error:", error);
  });

// ========================================
// ALARM SCHEMA
// ========================================

const alarmSchema = new mongoose.Schema({
  alarmTime: {
    type: String,
    required: true,
  },

  challenge: {
    type: String,
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ========================================
// ALARM MODEL
// ========================================

const Alarm = mongoose.model("Alarm", alarmSchema);

// ========================================
// TEST ROUTE
// ========================================

app.get("/", (req, res) => {
  res.json({
    message: "Move2Wake Backend is Running!",
  });
});

// ========================================
// SAVE ALARM
// ========================================

app.post("/api/alarms", async (req, res) => {
  try {
    const { alarmTime, challenge } = req.body;

    const newAlarm = new Alarm({
      alarmTime,
      challenge,
    });

    await newAlarm.save();

    console.log("Alarm saved:", newAlarm);

    res.json({
      message: "Alarm saved successfully!",
      alarm: newAlarm,
    });
  } catch (error) {
    console.error("Error saving alarm:", error);

    res.status(500).json({
      message: "Failed to save alarm",
    });
  }
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});