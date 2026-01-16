import { ChatOpenAI } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";

import Redis from "ioredis";


if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is not defined");
}
const redis = new Redis(process.env.REDIS_URL);



export class AIService {
  static async getSmartResponse(userPhone: string, userMessage: string) {
    /* ============================
       1. Récupérer l'historique depuis Redis
    ============================ */
    let history: { role: string; content: string }[] = [];

    const stored = await redis.get(`chat_history:${userPhone}`);
    if (stored) {
      history = JSON.parse(stored);
    }

    // Ajouter le nouveau message à l'historique
    history.push({ role: "user", content: userMessage });

    /* ============================
       2. Pinecone + Embeddings
    ============================ */
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
    const index = pc.Index(process.env.PINECONE_INDEX!);

    const embeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HUGGINGFACEHUB_API_KEY,
      model: "sentence-transformers/all-MiniLM-L6-v2",
    });

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
    });

    const retriever = vectorStore.asRetriever({ k: 4 });

    /* ============================
       3. Prompt + Réécriture de la question
    ============================ */
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `Tu es un assistant WhatsApp business.
Réponds clairement et professionnellement.
Si l'information n'est pas dans le contexte, dis-le explicitement.
Ne depasse jamais plus de 200 caractere dans tes reponses.`,
      ],
      [
        "human",
        `Historique:
{history}

Nouvelle question:
{input}

Contexte Pinecone:
{context}`,
      ],
    ]);

    /* ============================
       4. Chaîne RAG moderne
    ============================ */
    const model = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0.1 });

    const ragChain = RunnableSequence.from([
      async (input: string) => {
        const docs = await retriever.invoke(input);

        return {
          input,
          context: docs.map((doc) => doc.pageContent).join("\n\n"),
          history: history.map((h) => `${h.role}: ${h.content}`).join("\n"),
        };
      },
      prompt,
      model,
    ]);

    /* ============================
       5. Exécution
    ============================ */
    const response = await ragChain.invoke(userMessage);
    console.log("Réponse AI:", response);

    // Ajouter la réponse du bot à l'historique
    history.push({ role: "assistant", content: typeof response.content === "string" ? response.content : JSON.stringify(response.content) });

    // Sauvegarder l'historique mis à jour dans Redis
    await redis.set(
      `chat_history:${userPhone}`,
      JSON.stringify(history),
      "EX",
      60 * 60 * 24 // expire après 24h
    );

    return response.content;
  }
}
