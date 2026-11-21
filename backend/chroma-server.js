import http from "http";

const PORT = 8000;

// In-memory collection storage
const collections = new Map();

function getOrCreateCollection(name, tenant = "default_tenant", database = "default_database") {
  const key = `${tenant}:${database}:${name}`;
  if (!collections.has(key)) {
    collections.set(key, {
      id: "col-" + Buffer.from(key).toString("hex").slice(0, 12),
      name,
      tenant,
      database,
      configuration_json: { embedding_function: null },
      metadata: null,
      schema: null,
      records: [] // { id, embedding, document, metadata }
    });
  }
  return collections.get(key);
}

function findCollectionById(id) {
  for (const col of collections.values()) {
    if (col.id === id) return col;
  }
  return null;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const json = body ? JSON.parse(body) : {};

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    res.setHeader("Content-Type", "application/json");

    // Heartbeat
    if (pathname.includes("/heartbeat")) {
      res.writeHead(200);
      return res.end(JSON.stringify({ "nanosecond heartbeat": Date.now() * 1000000 }));
    }

    // Pre-flight checks
    if (pathname.includes("/pre-flight-checks")) {
      res.writeHead(200);
      return res.end(JSON.stringify({ max_batch_size: 10000, supports_base64_encoding: false }));
    }

    // Create / get collection
    // POST /api/v2/tenants/{tenant}/databases/{database}/collections
    if (pathname.endsWith("/collections") && req.method === "POST") {
      const parts = pathname.split("/");
      const tenant = parts[4] || "default_tenant";
      const database = parts[6] || "default_database";
      const col = getOrCreateCollection(json.name, tenant, database);
      res.writeHead(200);
      return res.end(JSON.stringify(col));
    }

    // Get collection by name
    // GET /api/v2/tenants/{tenant}/databases/{database}/collections/{name}
    if (pathname.includes("/collections/") && !pathname.includes("/add") && !pathname.includes("/query") && req.method === "GET") {
      const parts = pathname.split("/");
      const name = decodeURIComponent(parts[parts.length - 1]);
      const tenant = parts[4] || "default_tenant";
      const database = parts[6] || "default_database";
      const col = getOrCreateCollection(name, tenant, database);
      res.writeHead(200);
      return res.end(JSON.stringify(col));
    }

    // Add records to collection
    // POST /api/v2/tenants/{tenant}/databases/{database}/collections/{id}/add
    if (pathname.includes("/collections/") && pathname.endsWith("/add") && req.method === "POST") {
      const parts = pathname.split("/");
      const colId = parts[parts.length - 2];
      const col = findCollectionById(colId) || collections.values().next().value;
      if (!col) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: "Collection not found" }));
      }

      const ids = json.ids || [];
      const embeddings = json.embeddings || [];
      const documents = json.documents || [];
      const metadatas = json.metadatas || [];

      for (let i = 0; i < ids.length; i++) {
        col.records.push({
          id: ids[i],
          embedding: embeddings[i],
          document: documents[i],
          metadata: metadatas[i] || {}
        });
      }

      res.writeHead(200);
      return res.end(JSON.stringify(true));
    }

    // Query collection
    // POST /api/v2/tenants/{tenant}/databases/{database}/collections/{id}/query
    if (pathname.includes("/collections/") && pathname.endsWith("/query") && req.method === "POST") {
      const parts = pathname.split("/");
      const colId = parts[parts.length - 2];
      const col = findCollectionById(colId) || collections.values().next().value;
      if (!col) {
        res.writeHead(404);
        return res.end(JSON.stringify({ error: "Collection not found" }));
      }

      const queryEmbeddings = json.query_embeddings || [];
      const nResults = json.n_results || 5;

      const allIds = [];
      const allDocs = [];
      const allMetas = [];
      const allDists = [];

      for (const qEmb of queryEmbeddings) {
        // Calculate cosine similarity for all records
        const scored = col.records.map((r) => {
          const sim = cosineSimilarity(qEmb, r.embedding);
          return { ...r, distance: 1 - sim };
        });

        // Sort by distance ascending
        scored.sort((a, b) => a.distance - b.distance);
        const top = scored.slice(0, nResults);

        allIds.push(top.map((t) => t.id));
        allDocs.push(top.map((t) => t.document));
        allMetas.push(top.map((t) => t.metadata));
        allDists.push(top.map((t) => t.distance));
      }

      res.writeHead(200);
      return res.end(
        JSON.stringify({
          ids: allIds,
          documents: allDocs,
          metadatas: allMetas,
          distances: allDists
        })
      );
    }

    // Fallback
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));
  });
});

server.listen(PORT, () => {
  console.log(`ChromaDB local server running on http://localhost:${PORT}`);
});
