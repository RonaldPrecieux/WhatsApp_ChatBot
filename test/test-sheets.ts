// test-sheets.ts
import { SheetService } from '../services/sheet.service'; // Ajustez le chemin selon votre structure
import * as dotenv from 'dotenv';

// Charger les variables d'environnement (.env)
dotenv.config();

async function runTests() {
  console.log("🚀 Démarrage des tests de l'intégration Google Sheets...\n");

  try {
    // --- TEST 1 : Vérification du Stock ---
    console.log("📋 Test 1 : Lecture du stock (critère: 'all')...");
    const allStock = await SheetService.checkStock('all');
    console.log("Résultat du stock complet :");
    console.log(allStock);
    console.log("✅ Test 1 terminé.\n");

    // --- TEST 2 : Vérification du Stock avec filtre ---
    console.log("🔍 Test 2 : Filtrage du stock (critère: 'Géant')...");
    const filteredStock = await SheetService.checkStock('Géant');
    console.log("Résultat du stock filtré :");
    console.log(filteredStock);
    console.log("✅ Test 2 terminé.\n");

    // --- TEST 3 : Enregistrement d'une commande ---
    console.log("📝 Test 3 : Enregistrement d'une commande de test...");
    const dummyOrder = {
      name: "Jean Dupont (Test)",
      phone: "+221770000000",
      rabbitId: "101",
      location: "Dakar, Plateau"
    };

    const isOrderSaved = await SheetService.registerOrder(dummyOrder);
    
    if (isOrderSaved) {
      console.log("✅ Commande enregistrée avec succès dans l'onglet 'Commandes' !");
    } else {
      console.warn("⚠️ L'enregistrement a retourné 'false'.");
    }

  } catch (error: any) {
    console.error("❌ ERREUR DURANT LES TESTS :");
    
    // Aide au diagnostic des erreurs communes
    if (error.message.includes('403')) {
      console.error("Erreur 403 : Vérifiez que vous avez partagé le Sheet avec l'email du Service Account.");
    } else if (error.message.includes('404')) {
      console.error("Erreur 404 : Vérifiez le GOOGLE_SHEET_ID ou les noms d'onglets ('Stock', 'Commandes').");
    } else {
      console.error(error);
    }
  } finally {
    console.log("\n🏁 Fin de la session de test.");
  }
}

runTests();