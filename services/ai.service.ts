import { ChatOpenAI } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";

import Redis from "ioredis";

import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

import { SheetService } from "./sheet.service";

// On importe GraphApi pour envoyer le message à l'admin
const GraphApi = require('./graph-api'); 
const constants = require('./constants');

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is not defined");
}
const redis = new Redis(process.env.REDIS_URL);

// --- DÉFINITION DES OUTILS ---
const tools = [
  {
    name: "check_stock",
    description: "Vérifie le stock de lapins. Critère peut être un poids (ex: '2kg') ou 'all'.",
    schema: z.object({ criteria: z.string() }),
    func: async ({ criteria }) => await SheetService.checkStock(criteria),
  },
  {
    name: "finalize_order",
    description: "Valide la commande, l'enregistre dans le Sheet et notifie le patron.",
    schema: z.object({
      clientName: z.string(),
      rabbitId: z.string(),
      locationLink: z.string(),
    }),
    //Ajouter Quantité 
    func: async ({ clientName, rabbitId, locationLink }, userPhone: string) => {
      // 1. Enregistrer dans Google Sheet
      await SheetService.registerOrder({
        name: clientName,
        phone: userPhone,
        rabbitId: rabbitId,
        location: locationLink
      });

      // 2. NOTIFICATION ADMIN (Au lieu de l'appel Twilio)
      // On envoie un message sur TON numéro WhatsApp
      const adminMsg = `🚨 *NOUVELLE COMMANDE !* 🚨\n\n👤 Client: ${clientName}\n📞 Tel: ${userPhone}\n🐰 Lapin ID: ${rabbitId}\n📍 Map: ${locationLink}\n\n👉 *Vérifie le Sheet maintenant !*`;
      
      // Note: senderPhoneNumberId doit être passé ou récupéré de la config
      // Ici on suppose que tu as l'ID de ton numéro business dans process.env.PHONE_NUMBER_ID
      await GraphApi.sendTextMessage(
        process.env.PHONE_NUMBER_ID, 
        constants.ADMIN_PHONE_NUMBER, 
        adminMsg
      );

      return "Commande enregistrée avec succès. Le responsable a été notifié.";
    },
  },
];

export class AIService {
  static async getSmartResponse(userPhone: string, userMessage: string, locationData?: any) {
    /* ============================
       1. Récupérer l'historique depuis Redis
    ============================ */
    let history: { role: string; content: string }[] = [];

    const stored = await redis.get(`chat_history:${userPhone}`);
    if (stored) {
      history = JSON.parse(stored);
    }
    console.log("Historique récupéré:", history);

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


    // Gestion spéciale Localisation
    let currentInput = userMessage;
    if (locationData) {
      currentInput = `[SYSTEM] L'utilisateur a envoyé sa localisation: https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}`;
    }

    // 2. Initialiser le modèle avec les outils
    const model = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0 }).bindTools(tools);

    // 3. Construction des messages pour l'API
    const messages = [
      new SystemMessage(`Tu es l'assistant expert en vente de lapins de Lapiro Sarl.
      
      TES OBJECTIFS :
      1. Répondre aux questions théoriques sur l'élevage (tu peux utiliser tes connaissances générales).
      2. Vendre des lapins présents dans le STOCK (utilise l'outil check_rabbit_stock).
      3. Prendre la commande :
         - Si le client veut acheter, demande quel lapin (ID).
         - Demande ensuite sa LOCALISATION (dis-lui d'utiliser le bouton trombone > localisation de WhatsApp).
         - Une fois la localisation reçue, utilise l'outil 'finalize_order'.

      Règle : Ne jamais inventer de stock. Vérifie toujours avec l'outil.
      Ton ton est professionnel, chaleureux et direct.`),
      ...history.map(h => h.role === 'user' 
        ? new HumanMessage(h.content) 
        : new SystemMessage(h.content)), // Simplification mapping
      new HumanMessage(currentInput)
    ];

    // 4. Invocation du Modèle
    const aiMsg = await model.invoke(messages);

   // 5. Gestion des Appels d'Outils (Tool Calls)
    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      // L'IA veut utiliser un outil
      for (const toolCall of aiMsg.tool_calls) {
        const selectedTool = tools.find(t => t.name === toolCall.name);
        if (selectedTool) {
          console.log(`🛠️ Exécution outil: ${selectedTool.name}`);
          
          // Exécution de la fonction liée
          const toolResult = await selectedTool.func(toolCall.args as any, userPhone);
          
          // On renvoie le résultat de l'outil à l'IA pour qu'elle formule sa réponse finale
          messages.push(new SystemMessage({ content: aiMsg.content })); // Convert aiMsg to SystemMessage
          messages.push(new SystemMessage({
            content: JSON.stringify({
              tool_call_id: toolCall.id || "unknown_tool_call_id",
              result: toolResult
            })
          }));
        }
      }
      // Rappel du modèle avec le résultat de l'outil
      const finalResponse = await model.invoke(messages);
      
      // Sauvegarde histo
      await AIService.saveHistory(userPhone, history, currentInput, finalResponse.content as string);
      return finalResponse.content;

    } else {
      // Réponse textuelle simple
      await AIService.saveHistory(userPhone, history, currentInput, aiMsg.content as string);
      return aiMsg.content;
    }
  }

  private static async saveHistory(userPhone: string, currentHistory: any[], input: string, output: string) {
    currentHistory.push({ role: "user", content: input });
    currentHistory.push({ role: "assistant", content: output });
    await redis.set(`chat_history:${userPhone}`, JSON.stringify(currentHistory), "EX", 86400);
  }
}




//     // Gestion input Localisation
//     let currentInput = userMessage;
//     if (locationData) {
//       currentInput = `[SYSTEM] L'utilisateur a envoyé sa localisation GPS: https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}`;
//     }
//     const prompt = ChatPromptTemplate.fromMessages([
//       [
//         "system",
//         `Tu es un assistant WhatsApp business.
// Réponds clairement et professionnellement.
// Si l'information n'est pas dans le contexte, dis-le explicitement.
// Ne depasse jamais plus de 200 caractere dans tes reponses.`,
//       ],
//       [
//         "human",
//         `Historique:
// {history}

// Nouvelle question:
// {input}

// Contexte Pinecone:
// {context}`,
//       ],
//     ]);

//     /* ============================
//        4. Chaîne RAG moderne
//     ============================ */
//     const model = new ChatOpenAI({ modelName: "gpt-4o-mini", temperature: 0.1 });

//     const ragChain = RunnableSequence.from([
//       async (input: string) => {
//         const docs = await retriever.invoke(input);

//         return {
//           input,
//           context: docs.map((doc) => doc.pageContent).join("\n\n"),
//           history: history.map((h) => `${h.role}: ${h.content}`).join("\n"),
//         };
//       },
//       prompt,
//       model,
//     ]);

//     /* ============================
//        5. Exécution
//     ============================ */
//     const response = await ragChain.invoke(userMessage);
//     console.log("Réponse AI:", response);

//     // Ajouter la réponse du bot à l'historique
//     history.push({ role: "assistant", content: response.content });

//     // Sauvegarder l'historique mis à jour dans Redis
//     await redis.set(
//       `chat_history:${userPhone}`,
//       JSON.stringify(history),
//       "EX",
//       60 * 60 * 24 // expire après 24h
//     );

//     return response.content;
//   }
//}
