"use strict";

const express = require('express');
const { urlencoded, json } = require('body-parser');
require('dotenv').config();

const config = require('./services/config');
const webhookRoutes = require('./routes/webhook.routes'); // Import des routes
const memoryRoutes = require('./routes/memory.routes');

const app = express();

// Vérification des variables d'environnement
config.checkEnvVariables();

// Configuration des middlewares globaux
app.use(urlencoded({ extended: true }));

// Note : La vérification de signature est déplacée dans le routeur 
// pour être spécifique au webhook WhatsApp.
app.use(json()); 

// Utilisation des routes
app.use('/', webhookRoutes);
app.use('/memory', memoryRoutes);

// app.get('/', (req, res) => {
//   res.json({ status: "running", service: "WhatsApp Webhook" });
// });
const listener = app.listen(config.port || 3000, () => {
  console.log(`🚀 Serveur lancé sur le port ${listener.address().port}`);
});