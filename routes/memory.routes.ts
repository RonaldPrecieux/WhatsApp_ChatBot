import express from 'express';
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { Pinecone } from "@pinecone-database/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";


const router = express.Router();
router.use(express.json());

router.post('/update-memory', async (req, res) => {
  try {
    const { spreadsheetId,sheetId,sheetName, data } = req.body; // Données reçues de Google Sheets (Array d'arrays)
    console.log("Données reçues pour mise à jour de la mémoire :", data,spreadsheetId,'\n',sheetId,sheetName);
    const dataId=`${spreadsheetId}-${sheetId}`;
    // 1. Transformation des lignes Sheets en texte exploitable
    const textContent = data.map((row: any[]) => row.join(" ")).join("\n");
    console.log("Contenu textuel généré :", textContent);
    // 2. Segmentation (Splitting)
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments([textContent],[{"source":"google-sheets","id":dataId}]);

    // 3. Initialisation Pinecone
    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
      throw new Error("PINECONE_API_KEY is not defined in the environment variables.");
    }
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pc.Index(process.env.PINECONE_INDEX);

    // 3. Suppression ciblée (Nettoyage sélectif)
    // On supprime uniquement les vecteurs qui appartiennent à ce sheetId
    try{
    const res = await index.deleteMany({
       filter: { id: { "$eq": dataId } }
    });}
    catch (error) {
      console.warn("Aucun vecteur existant à supprimer pour cet ID de données.");
    }

    const embeddings = new HuggingFaceInferenceEmbeddings({
      apiKey: process.env.HUGGINGFACEHUB_API_KEY, // Defaults to process.env.HUGGINGFACEHUB_API_KEY
      model: "sentence-transformers/all-MiniLM-L6-v2", // Defaults to `BAAI/bge-base-en-v1.5` if not provided
     // provider: "MODEL-PROVIDER", // Falls back to auto selection mechanism within Hugging Face's inference API if not provided
    });
    

    // 4. Insertion des nouveaux vecteurs
    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
    });

    res.status(200).send({ message: "Mémoire mise à jour avec succès !" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Erreur lors de la mise à jour" });
  }
});
module.exports = router;