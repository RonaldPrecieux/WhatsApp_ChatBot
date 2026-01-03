"use strict";

// Note : Si tu utilises les Quick Replies du template, tu devras adapter le code conversation.js 
//pour lire le payload des boutons du template, qui arrive parfois différemment des boutons interactifs simples).
const constants = require("./constants");
const GraphApi = require('./graph-api');
const Message = require('./message');
const Store = require('./store'); // Le fichier mémoire qu'on a créé
import {AIService} from "./ai.service.ts";

module.exports = class Conversation {
  constructor(phoneNumberId) {
    this.phoneNumberId = phoneNumberId;
  }

  static async handleMessage(senderPhoneNumberId, rawMessage) {
    const message = new Message(rawMessage);
    const userPhone = message.senderPhoneNumber;
    const messageBody = rawMessage.text?.body || ""; // Si c'est du texte
    
    // --- 1. GESTION DU HANDOVER (PRIORITÉ ABSOLUE) ---
    
    // Commande : @takeover (L'humain prend le contrôle)
    if (messageBody.toLowerCase().includes(constants.CMD_TAKEOVER)) {
      Store.setBotPaused(userPhone, true);
      await GraphApi.sendTextMessage(senderPhoneNumberId, userPhone, constants.MSG_HANDOVER_START);
      // Notifier l'admin (toi)
      await GraphApi.sendTextMessage(senderPhoneNumberId, constants.ADMIN_PHONE_NUMBER, `⚠️ TAKEOVER activé pour le client ${userPhone}`);
      return;
    }

    // Commande : @bot (Le bot reprend le contrôle)
    if (messageBody.toLowerCase().includes(constants.CMD_BOT)) {
      Store.setBotPaused(userPhone, false);
      await GraphApi.sendTextMessage(senderPhoneNumberId, userPhone, constants.MSG_HANDOVER_END);
      // On relance le menu principal pour réengager le client
      await this.sendWelcomeMenu(message.id, senderPhoneNumberId, userPhone);
      return;
    }

    // Si le bot est en pause, on arrête tout ici. Le client parle à l'humain.
    if (Store.isBotPaused(userPhone)) {
      console.log(`Bot en pause pour ${userPhone}, message ignoré par la logique auto.`);
      return;
    }

    // --- 2. LOGIQUE DU BOT DE VENTE ---

    // Intégration IA - RAG
    try {
      if (message.type === 'unknown' && rawMessage.type === 'text') {
        // 1. Récupérer le texte de l'utilisateur
        const userMessage = rawMessage.text.body;

        // 2. Appeler l'IA pour générer une réponse basée sur l'Excel (Pinecone)
        const aiResponse = await AIService.getSmartResponse(userPhone, userMessage);

        // 3. Envoyer la réponse intelligente au lieu du menu par défaut
        await GraphApi.sendTextMessage(senderPhoneNumberId, userPhone, aiResponse);
                
        //await this.sendWelcomeMenu(message.id, senderPhoneNumberId, userPhone);

      }
      else if (rawMessage.type === 'location') {
        const lat = rawMessage.location.latitude;
        const lng = rawMessage.location.longitude;
        
        // On crée un message "artificiel" pour l'IA
        const messagePourIA = `L'utilisateur a envoyé sa localisation : https://www.google.com/maps?q=${lat},${lng}`;
        
        // On envoie ça à l'IA comme si l'utilisateur l'avait écrit
        const aiResponse = await AIService.getSmartResponse(userPhone, messagePourIA);
        await GraphApi.sendTextMessage(senderPhoneNumberId, userPhone, aiResponse);

      }
      else {
        await this.routeButtonAction(message.id, senderPhoneNumberId, userPhone, message.type);
      }
      } catch (error) {
      console.error("Erreur dans le flux IA:", error);
      // En cas d'erreur IA, on peut quand même envoyer le menu par sécurité
      await this.sendWelcomeMenu(message.id, senderPhoneNumberId, userPhone);
      }
  }

  // --- ROUTEUR DES ACTIONS (Switch Case géant) ---
  static async routeButtonAction(msgId, senderId, recipientId, buttonId) {
    switch (buttonId) {
      
      // -- NAVIGATION GENERALE --
      case constants.BTN_BACK_HOME:
        await this.sendWelcomeMenu(msgId, senderId, recipientId);
        break;

      // -- BRANCHE PRODUITS --
      case constants.BTN_MENU_PRODUCTS:
      case constants.BTN_BACK_PRODUCTS:
        await this.sendProductCatalog(msgId, senderId, recipientId);
        break;

      // -- DETAIL PRODUIT (Exemple Caméra) --
      case constants.BTN_CAT_CAMERAS:
        await this.sendProductDetailCamera(msgId, senderId, recipientId);
        break;

      // -- ACTION D'ACHAT --
      case constants.BTN_BUY_CAM_PRO:
        await this.sendClosingDeal(msgId, senderId, recipientId, "Caméra Pro X1");
        break;

      // -- DEMANDE HUMAIN --
      case constants.BTN_TALK_HUMAN:
        // On ne met pas en pause tout de suite, on notifie juste l'admin
        await GraphApi.sendTextMessage(senderId, recipientId, "Un expert a été notifié. Posez votre question ici 👇");
        await GraphApi.sendTextMessage(senderId, constants.ADMIN_PHONE_NUMBER, `🚨 LEAD CHAUD : ${recipientId} demande un humain !`);
        break;

      default:
        // Par défaut, retour accueil
        await this.sendWelcomeMenu(msgId, senderId, recipientId);
    }
  }

  // --- FONCTIONS D'ENVOI (LES "STEPS") ---

  // STEP 1: Accueil
  static async sendWelcomeMenu(msgId, senderId, recipientId) {
    // Utilise un Template avec image pour faire pro
    // Si tu n'as pas le template, utilise messageWithInteractiveReply avec une phrase d'accroche
     await GraphApi.messageWithInteractiveReply(
      msgId, senderId, recipientId,
      "**Lapin Fermier Premium** 🐇\n\n✅ Élevage local\n✅ Chair tendre\n✅ Qualité supérieure\n\nPrix : 3 500 / kg\n🔥 Promo : 3 000 / kg (jusqu’au 15 janvier)\nStocks limités",
      [
        { id: constants.BTN_BUY_CAM_PRO, title: "Commander ✅" },
        { id: constants.BTN_BACK_PRODUCTS, title: "Retour Catalogue ↩️" },
        { id: constants.BTN_TALK_HUMAN, title: "Question ?" }
      ]
    );
    // );
    // await GraphApi.messageWithUtilityTemplate(msgId, senderId, recipientId, {
    //   templateName: constants.TPL_WELCOME, // "welcome_menu_v1"
    //   locale: "fr",
    //   imageLink: "https://via.placeholder.com/800x400?text=SecurHome", // Mets ton lien d'image ici
    //   parameters: ["Bienvenue"] // Variable {{1}}
    // });
    
    // On enchaîne immédiatement avec les boutons (car les templates n'ont que 2-3 boutons max parfois limités)
    // Ou mieux : Le template contient déjà les boutons Quick Reply (voir section Template ci-dessous)
  }

  // Alternative sans template pour démarrer tout de suite
  /* static async sendWelcomeMenu(msgId, senderId, recipientId) {
    await GraphApi.messageWithInteractiveReply(
      msgId, senderId, recipientId,
      "👋 Bienvenue chez SecurHome.\nNous sécurisons ce qui compte pour vous.\n\nQue souhaitez-vous faire ?",
      [
        { id: constants.BTN_MENU_PRODUCTS, title: "Voir les Produits 📦" },
        { id: constants.BTN_TALK_HUMAN, title: "Parler à un expert 📞" },
        { id: constants.BTN_MENU_SERVICES, title: "Nos Services 🛠️" }
      ]
    );
  }
  */

  // STEP 2: Catalogue
  static async sendProductCatalog(msgId, senderId, recipientId) {
    await GraphApi.messageWithInteractiveReply(
      msgId, senderId, recipientId,
      "🔍 Quelle catégorie de lapin vous intéresse ?",
      [
        { id: constants.BTN_CAT_CONSO, title: "Consomation" },
        { id: constants.BTN_CAT_REPRO, title: "Reproduction 🚨" },
        { id: constants.BTN_BACK_HOME, title: "Retour Accueil 🏠" }
      ]
    );
  }

  // STEP 3: Détail Produit (Vente)
  static async sendProductDetailCamera(msgId, senderId, recipientId) {
    // Ici, on envoie d'abord une belle image ou un carousel
    // Puis le texte de vente avec bouton Achat
    
    // Exemple simple Interactif
    await GraphApi.messageWithInteractiveReply(
      msgId, senderId, recipientId,
      "*Caméra Pro X1* 📸\n\n✅ Vision nocturne 4K\n✅ Détection IA\n✅ Batterie 1 an\n\nPrix: 199€ (Promo -20% ce soir)",
      [
        { id: constants.BTN_BUY_CAM_PRO, title: "Commander ✅" },
        { id: constants.BTN_BACK_PRODUCTS, title: "Retour Catalogue ↩️" },
        { id: constants.BTN_TALK_HUMAN, title: "Question ?" }
      ]
    );
  }

  // STEP 4: Closing / Capture de Lead
  static async sendClosingDeal(msgId, senderId, recipientId, productName) {
    // 1. Remerciement
    await GraphApi.sendTextMessage(senderId, recipientId, `Excellent choix pour la ${productName} ! 🚀`);
    
    // 2. Lien de paiement ou demande d'infos (Ici on simule un lien)
    await GraphApi.sendTextMessage(senderId, recipientId, "Cliquez ici pour finaliser votre commande sécurisée : https://mon-lien-stripe.com/p/xyz");
    
    // 3. Notification Admin
    await GraphApi.sendTextMessage(senderId, constants.ADMIN_PHONE_NUMBER, `💰 NOUVELLE COMMANDE EN COURS : ${recipientId} sur ${productName}`);
  }
};