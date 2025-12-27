"use strict";

module.exports = Object.freeze({
  // CONFIG
  ADMIN_PHONE_NUMBER: "33758796551", // REMPLACE PAR TON NUMÉRO (format international sans +)

  // COMMANDES SPECIALES
  CMD_TAKEOVER: "@takeover", // L'humain prend la main
  CMD_BOT: "@bot",           // Le bot reprend la main

  // MESSAGES TEXTE
  MSG_WELCOME: "Bienvenue chez SecurHome 🏠. Protégez ce qui compte le plus.",
  MSG_HANDOVER_START: "👨‍💻 Un conseiller va prendre le relais. Le bot est en pause.",
  MSG_HANDOVER_END: "🤖 Le bot est de retour en ligne.",
  MSG_FALLBACK: "Je n'ai pas compris. Voici ce que je peux faire :",

  // TEMPLATE NAMES (À créer sur Meta)
  TPL_WELCOME: "welcome_menu_v1",
  TPL_PRODUCT_DETAIL: "product_detail_v1",
  TPL_PROMO: "promo_alert_v1",

  // BUTTON IDs (La logique de navigation)
  // Format: ACTION_CONTEXTE
  BTN_MENU_PRODUCTS: "menu_products",
  BTN_MENU_SERVICES: "menu_services",
  BTN_TALK_HUMAN: "talk_human",
  
  BTN_CAT_CAMERAS: "cat_cameras",
  BTN_CAT_ALARMS: "cat_alarms",

  BTN_PROD_CAM_PRO: "prod_cam_pro",
  BTN_BUY_CAM_PRO: "buy_cam_pro",
  
  BTN_BACK_HOME: "nav_home",
  BTN_BACK_PRODUCTS: "nav_back_products"
});