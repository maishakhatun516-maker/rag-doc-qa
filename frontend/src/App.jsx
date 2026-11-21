import { useState } from "react";
import axios from "axios";

const API = "http://localhost:3000/api";

function App() {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("document", file);
    setUploadStatus("আপলোড ও প্রসেসিং চলছে...");
    try {
      const res = await axios.post(`${API}/upload`, formData);
      setUploadStatus(
        `সফল! "${res.data.fileName}" — ${res.data.totalChunks} টি চাংক তৈরি হয়েছে।`
      );
    } catch (err) {
      setUploadStatus("ব্যর্থ: " + (err.response?.data?.error || err.message));
    }
  };

  const handleAsk = async () => {
    if (!question.trim() || loading) return;
    const userQ = question;
    setQuestion("");
    setLoading(true);
    setChatHistory((prev) => [...prev, { role: "user", text: userQ }]);

    try {
      const res = await axios.post(`${API}/chat`, { question: userQ });
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.data.answer,
          sources: res.data.sources,
        },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "ত্রুটি: " + (err.response?.data?.error || err.message),
          sources: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "40px auto",
        fontFamily: "sans-serif",
        padding: 16,
      }}
    >
      <h1>📄 ডকুমেন্ট Q&A (RAG)</h1>

      <div
        style={{
          border: "1px solid #ccc",
          padding: 20,
          marginBottom: 20,
          borderRadius: 8,
        }}
      >
        <h2>১. ডকুমেন্ট আপলোড</h2>
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button onClick={handleUpload} style={{ marginLeft: 10 }}>
          আপলোড ও ইনডেক্স
        </button>
        {uploadStatus && <p>{uploadStatus}</p>}
      </div>

      <div style={{ border: "1px solid #ccc", padding: 20, borderRadius: 8 }}>
        <h2>২. প্রশ্ন করুন</h2>
        <div style={{ minHeight: 200, marginBottom: 10 }}>
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: 12,
                textAlign: msg.role === "user" ? "right" : "left",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  background: msg.role === "user" ? "#d1e7ff" : "#f1f1f1",
                  padding: "8px 12px",
                  borderRadius: 8,
                  maxWidth: "80%",
                  whiteSpace: "pre-wrap",
                  textAlign: "left",
                }}
              >
                {msg.text}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    সোর্স: {msg.sources.join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <p>উত্তর তৈরি হচ্ছে...</p>}
        </div>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="ডকুমেন্ট সম্পর্কে প্রশ্ন লিখুন..."
          style={{ width: "78%", padding: 8 }}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
        />
        <button onClick={handleAsk} style={{ marginLeft: 10 }} disabled={loading}>
          পাঠান
        </button>
      </div>
    </div>
  );
}

export default App;