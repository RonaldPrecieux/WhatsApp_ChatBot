import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration de l'authentification (Sans navigateur, idéal pour serveur)
const auth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Gère les sauts de ligne du .env
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

export class SheetService {

  // Lire le stock
  static async checkStock(criteria: string) {
    try {

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Stock!A2:E', // Récupère de la colonne A à E
      });


      const rows = response.data.values;
      if (!rows || rows.length === 0) return "Stock vide.";

      // Filtrage manuel (Index 4 = Statut, Index 1 = Description)
      const available = rows.filter(row => 
        row[4] === 'Dispo' && 
        (criteria === 'all' || row[1].toLowerCase().includes(criteria.toLowerCase()))
      );

      if (available.length === 0) return "Aucun lapin disponible pour ce critère.";

      return available.map(row => 
        `🐰 *Lapin #${row[0]}*\n- Poids: ${row[2]}kg\n- Prix: ${row[3]} FCFA\n- Type: ${row[1]}`
      ).join('\n\n');

    } catch (error) {
      console.error('Erreur Sheets (Read):', error);
      throw error;
    }
  }

  // Enregistrer une commande
  static async registerOrder(order: any) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Commandes!A2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            new Date().toLocaleString(),
            order.name,
            order.phone,
            `Lapin ID ${order.rabbitId}`,
            order.location,
            'À Traiter'
          ]],
        },
      });
      return true;
    } catch (error) {
      console.error('Erreur Sheets (Write):', error);
      return false;
    }
  }
}