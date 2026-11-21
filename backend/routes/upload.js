import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import { ChromaClient } from "chromadb";
import fs from "fs";
import { PDFParse } from "pdf-parse";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Chroma ক্লায়েন্ট — host/port স্পষ্টভাবে দেওয়া
const chroma = new ChromaClient({
    host: "localhost",
    port: 8000,
    ssl: false,
});

// টেক্সট চাংকিং ফাংশন (ওভারল্যাপসহ)
function chunkText(text, chunkSize = 800, overlap = 150) {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + chunkSize));
        i += chunkSize - overlap;
    }
    return chunks;
}

// Gemini Embedding API কল
async function getEmbedding(text) {
    const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
    });
    return response.embeddings[0].values;
}

// ফাইল আপলোড ও ইনডেক্সিং রুট
router.post("/", upload.single("document"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "কোনো ফাইল পাওয়া যায়নি" });
        }

        let text = "";
        const filePath = req.file.path;
        const originalName = req.file.originalname;

        // PDF বা TXT থেকে টেক্সট বের করা
        if (originalName.toLowerCase().endsWith(".pdf")) {
            const buffer = fs.readFileSync(filePath);
            const parser = new PDFParse({ data: buffer });
            const result = await parser.getText();
            text = result.text;
            await parser.destroy();
        } else {
            text = fs.readFileSync(filePath, "utf-8");
        }

        if (!text.trim()) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: "ফাইলে কোনো টেক্সট পাওয়া যায়নি" });
        }

        // চাংকিং
        const chunks = chunkText(text);

        // Chroma কালেকশন
        const collection = await chroma.getOrCreateCollection({ name: "documents" });

        // প্রতিটি চাংকের এমবেডিং তৈরি ও Chroma-তে সেভ
        for (let i = 0; i < chunks.length; i++) {
            const embedding = await getEmbedding(chunks[i]);
            await collection.add({
                ids: [`${originalName}-chunk-${i}-${Date.now()}`],
                embeddings: [embedding],
                documents: [chunks[i]],
                metadatas: [{ source: originalName, chunkIndex: i }],
            });
        }

        // আপলোড করা টেম্প ফাইল মুছে ফেলা
        fs.unlinkSync(filePath);

        res.json({
            message: "সফলভাবে প্রসেস হয়েছে",
            fileName: originalName,
            totalChunks: chunks.length,
        });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;