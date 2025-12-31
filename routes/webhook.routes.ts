// routes/webhook.routes.js

"use strict";

const crypto = require('crypto');
const { json } = require('body-parser');
require('dotenv').config();
import express from 'express';

const config = require('../services/config');
const Conversation = require('../services/conversation');
const Message = require('../services/message');
const router = express.Router();




// Parse application/json. Verify that callback came from Facebook
router.use(json({ verify: verifyRequestSignature }));

// Handle webhook verification handshake

router.get("/webhook", function (req, res) {
  if (
    req.query["hub.mode"] != "subscribe" ||
    req.query["hub.verify_token"] != config.verifyToken
  ) {
    res.sendStatus(403);
    return;
  }

  res.send(req.query["hub.challenge"]);
});

// Handle incoming messages
router.post('/webhook', (req, res) => {
  console.log(req.body);

  if (req.body.object === "whatsapp_business_account") {
    req.body.entry.forEach((entry: { changes: any[]; }) => {
      entry.changes.forEach(change => {
        const value = change.value;
        if (value) {
          const senderPhoneNumberId = value.metadata.phone_number_id;

          // if (value.statuses) {
          //   value.statuses.forEach(status => {
          //     // Handle message status updates
          //     //Conversation.handleStatus(senderPhoneNumberId, status);
          //   });
          // }

          if (value.messages) {
            value.messages.forEach((rawMessage: any) => {
              // Respond to message
              Conversation.handleMessage(senderPhoneNumberId, rawMessage);
            });
          }
        }
      });
    });
  }

  res.status(200).send('EVENT_RECEIVED');
});

// Default route for health check
router.get('/', (req, res) => {
  res.json({
    message: 'Jasper\'s Market Server is running',
    endpoints: [
      'POST /webhook - WhatsApp webhook endpoint'
    ]
  });
});

// Check if all environment variables are set
config.checkEnvVariables();

// Verify that the callback came from Facebook.
// Middleware spécifique pour vérifier la signature Facebook
// On l'applique uniquement aux routes POST du webhook
function verifyRequestSignature(req: { headers: { [x: string]: any; }; }, res: any, buf: any) {
  let signature = req.headers["x-hub-signature-256"];

  if (!signature) {
    console.warn(`Couldn't find "x-hub-signature-256" in headers.`);
    console.warn("Signature absente.");
    return;
  } else {
    let elements = signature.split("=");
    let signatureHash = elements[1];
    let expectedHash = crypto
      .createHmac("sha256", config.appSecret)
      .update(buf)
      .digest("hex");
    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

module.exports = router;