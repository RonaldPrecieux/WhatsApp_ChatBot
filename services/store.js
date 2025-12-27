"use strict";

// Ceci simule une base de données en mémoire
const userSessions = {};

module.exports = {
  isBotPaused: (userId) => {
    return userSessions[userId]?.paused || false;
  },
  setBotPaused: (userId, status) => {
    if (!userSessions[userId]) userSessions[userId] = {};
    userSessions[userId].paused = status;
  }
};