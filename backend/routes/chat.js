import express from "express";
import { GoogleGenAI } from "@google/genai";
import { ChromaClient } from "chromadb";

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const chroma = new ChromaClient({
    host: "localhost",
    port: 8000,
    ssl: false,
});

async function getEmbedding(text) {
    const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
    });
    return response.embeddings[0].values;
}

router.post("/", async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) return res.status(400).json({ error: "প্রশ্ন দিন" });

        const queryEmbedding = await getEmbedding(question);

        const collection = await chroma.getCollection({ name: "documents" });
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: 5,
        });

        const retrievedChunks = results.documents[0] || [];
        const metadatas = results.metadatas[0] || [];

        if (retrievedChunks.length === 0) {
            return res.json({
                answer: "দুঃখিত, আপলোড করা ডকুমেন্টে এই প্রশ্নের উত্তর পাওয়া যায়নি।",
                sources: [],
            });
        }

        const context = retrievedChunks.join("\n\n---\n\n");
        const prompt = `তুমি একটি সহায়ক সহকারী। নিচের কনটেক্সট ব্যবহার করে প্রশ্নের উত্তর দাও। যদি কনটেক্সটে উত্তর না থাকে, তাহলে স্পষ্টভাবে বলো "তথ্য পাওয়া যায়নি"।

কনটেক্সট:
${context}

প্রশ্ন: ${question}

উত্তর:`;

        const candidateModels = [
            "gemini-3.1-flash-lite",
            "gemini-flash-lite-latest",
            "gemini-3.5-flash",
            "gemini-flash-latest"
        ];
        let geminiResponse;
        let lastErr;
        for (const model of candidateModels) {
            try {
                geminiResponse = await ai.models.generateContent({
                    model,
                    contents: prompt,
                });
                if (geminiResponse?.text) break;
            } catch (err) {
                lastErr = err;
            }
        }
        if (!geminiResponse) {
            throw lastErr || new Error("Failed to generate response from Gemini API");
        }

        const sources = [...new Set(metadatas.map((m) => m.source))];

        res.json({
            answer: geminiResponse.text,
            sources,
        });
    } catch (error) {
        console.error("Chat error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;