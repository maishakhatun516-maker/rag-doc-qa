import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// প্রথমে .env লোড করুন
dotenv.config();
console.log("API Key loaded:", Boolean(process.env.GEMINI_API_KEY));

// .env লোড হওয়ার পরেই routes ইমপোর্ট করুন
const { default: uploadRoute } = await import("./routes/upload.js");
const { default: chatRoute } = await import("./routes/chat.js");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/upload", uploadRoute);
app.use("/api/chat", chatRoute);

app.get("/", (req, res) => res.send("RAG Doc Q&A Backend is running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));