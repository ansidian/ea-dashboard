import db from "../db/connection.js";
import { chunkBriefing } from "./chunker.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const CONTEXT_BRIEFING_LIMIT = 7;
const CONTEXT_TOP_K = 10;

// --- Embedding ---

export async function embedText(text) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embedding error (${res.status}): ${body}`);
  }

  const data = await res.json();
  return new Float32Array(data.data[0].embedding);
}

// --- Storage ---

export async function embedAndStore({ userId, briefingId, briefingJson, sourceDate }) {
  const chunks = chunkBriefing(briefingJson, briefingId, sourceDate);
  if (!chunks.length) {
    console.log("[EA] No chunks to embed for briefing", briefingId);
    return { chunks: 0 };
  }

  const startTime = Date.now();
  const embeddings = await Promise.all(
    chunks.map(c => embedText(c.chunk_text)),
  );

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await db.execute({
      sql: `INSERT INTO ea_embeddings (user_id, briefing_id, section_type, chunk_text, embedding, source_date, metadata)
            VALUES (?, ?, ?, ?, vector32(?), ?, ?)`,
      args: [
        userId,
        chunk.briefing_id,
        chunk.section_type,
        chunk.chunk_text,
        vectorToJson(embeddings[i]),
        chunk.source_date,
        chunk.metadata ? JSON.stringify(chunk.metadata) : null,
      ],
    });
  }

  const elapsed = Date.now() - startTime;
  console.log(`[EA] Embedded ${chunks.length} chunks for briefing ${briefingId} in ${elapsed}ms`);
  return { chunks: chunks.length, timeMs: elapsed };
}

// --- Search ---

export async function searchSimilar({ userId, queryEmbedding, topK = 10, sectionTypes, dateRange }) {
  let sql = `SELECT id, briefing_id, section_type, chunk_text, source_date, metadata,
                    vector_distance_cos(embedding, vector32(?)) AS distance
             FROM ea_embeddings
             WHERE user_id = ?`;
  const args = [vectorToJson(queryEmbedding), userId];

  if (sectionTypes?.length) {
    sql += ` AND section_type IN (${sectionTypes.map(() => "?").join(", ")})`;
    args.push(...sectionTypes);
  }
  if (dateRange?.from) {
    sql += ` AND source_date >= ?`;
    args.push(dateRange.from);
  }
  if (dateRange?.to) {
    sql += ` AND source_date <= ?`;
    args.push(dateRange.to);
  }

  sql += ` ORDER BY distance ASC LIMIT ?`;
  args.push(topK);

  const result = await db.execute({ sql, args });
  return result.rows.map(row => ({
    id: row.id,
    briefing_id: row.briefing_id,
    section_type: row.section_type,
    chunk_text: row.chunk_text,
    source_date: row.source_date,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    score: 1 - row.distance,
  }));
}

// --- Context for briefing generation ---

export async function getContextForBriefing(userId) {
  if (!OPENAI_API_KEY) {
    console.warn("[EA] OPENAI_API_KEY not set — skipping historical context retrieval");
    return null;
  }

  // Get the date range for the last N briefings
  const recentResult = await db.execute({
    sql: `SELECT DISTINCT source_date FROM ea_embeddings
          WHERE user_id = ?
          ORDER BY source_date DESC LIMIT ?`,
    args: [userId, CONTEXT_BRIEFING_LIMIT],
  });

  if (!recentResult.rows.length) return null;

  const oldestDate = recentResult.rows[recentResult.rows.length - 1].source_date;

  // Build a summary query from the most recent briefing to use as search anchor
  const latestChunks = await db.execute({
    sql: `SELECT chunk_text FROM ea_embeddings
          WHERE user_id = ? AND source_date = ?
          ORDER BY section_type`,
    args: [userId, recentResult.rows[0].source_date],
  });

  if (!latestChunks.rows.length) return null;

  // Use the combined latest chunks as the query to find relevant history
  const queryText = latestChunks.rows.map(r => r.chunk_text).join("\n").slice(0, 2000);

  try {
    const queryEmbedding = await embedText(queryText);
    const results = await searchSimilar({
      userId,
      queryEmbedding,
      topK: CONTEXT_TOP_K,
      dateRange: { from: oldestDate },
    });

    // Exclude chunks from the most recent briefing (we don't want to inject today's own data)
    const latestDate = recentResult.rows[0].source_date;
    const historical = results.filter(r => r.source_date !== latestDate);

    if (!historical.length) return null;

    // Format as text for Claude's prompt
    const lines = historical.map(r =>
      `[${r.source_date} · ${r.section_type}] ${r.chunk_text}`
    );
    return lines.join("\n\n");
  } catch (err) {
    console.warn("[EA] Historical context retrieval failed:", err.message);
    return null;
  }
}

// --- Utilities ---

function vectorToJson(float32Array) {
  return `[${Array.from(float32Array).join(",")}]`;
}

export function isEmbeddingAvailable() {
  return !!OPENAI_API_KEY;
}
