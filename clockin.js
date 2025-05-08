// Updated Node.js clock-in and webhook logic
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const session = require('express-session');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: 'automateit_secret',
  resave: false,
  saveUninitialized: true
}));

// MySQL connection config
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'hookahbar_db'
};

// ➤ Helper to format phone number
function formatPhoneNumber(phone) {
  if (phone.startsWith('+1') && phone.length === 12) {
    return `${phone.slice(2, 5)}-${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

// ➤ Clock-in Endpoint
app.post('/webhook', async (req, res) => {
  const data = req.body;
  fs.appendFileSync('square_webhook_log.txt', JSON.stringify(data, null, 2) + '\n');

  try {
    const eventType = data.type;
    const teamMemberId = data?.data?.object?.shift?.team_member_id;

    if (eventType === 'labor.shift.created' || eventType === 'labor.shift.updated') {
      const connection = await mysql.createConnection(dbConfig);

      // Look up the user by square_id
      const [rows] = await connection.execute(
        'SELECT id FROM users WHERE square_id = ?',
        [teamMemberId]
      );

      if (rows.length > 0) {
        const userId = rows[0].id;

        // Insert clock-in (if not already in today's schedule)
        await connection.execute(
          'INSERT INTO schedule (user_id, date, time_in) VALUES (?, CURDATE(), CURTIME())',
          [userId]
        );

        console.log(`✅ Clock-in recorded for user_id ${userId}`);
      } else {
        console.log(`⚠️ No user found with square_id ${teamMemberId}`);
      }

      await connection.end();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(500);
  }
});


// ➤ Webhook: New Employee Added from Square
app.post('/webhook', async (req, res) => {
  const data = req.body;
  fs.appendFileSync('new_employee_webhook_log.txt', JSON.stringify(data, null, 2) + '\n');

  try {
    const teamMember = data?.data?.object?.team_member;

    if (teamMember) {
      const name = `${teamMember.given_name} ${teamMember.family_name}`;
      const email = teamMember.email_address || null;
      const phone = formatPhoneNumber(teamMember.phone_number || '');
      const squareId = teamMember.id;

      const connection = await mysql.createConnection(dbConfig);

      // Check if user already exists
      const [existing] = await connection.execute(
        'SELECT id FROM users WHERE square_id = ?',
        [squareId]
      );

      if (existing.length === 0) {
        await connection.execute(
          'INSERT INTO users (name, email, phone_number, square_id, user_type) VALUES (?, ?, ?, ?, 1)',
          [name, email, phone, squareId]
        );
        console.log(`✅ New employee inserted: ${name}`);
      } else {
        console.log('ℹ️ Employee already exists.');
      }

      await connection.end();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    res.sendStatus(500);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
