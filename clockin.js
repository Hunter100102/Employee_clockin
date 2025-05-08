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

// Helper: Call Square API
async function squareApiRequest(endpoint) {
  const url = `https://connect.squareup.com/v2/${endpoint}`;
  const response = await axios.get(url, {
    headers: {
      'Square-Version': '2024-04-18',
      'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data;
}

// ➤ Clock-in Endpoint
app.post('/clockin', async (req, res) => {
  if (!req.session.user_id) {
    return res.status(401).send('User not logged in.');
  }

  const userId = req.session.user_id;

  try {
    const response = await squareApiRequest('team-members');
    const activeEmployee = response.team_members.find(member => member.status === 'ACTIVE');

    if (activeEmployee) {
      const connection = await mysql.createConnection(dbConfig);
      await connection.execute(
        "INSERT INTO time_clock (users_id, time_in, date) VALUES (?, NOW(), CURDATE())",
        [userId]
      );
      await connection.end();

      res.send(`Clock-in successful for ${activeEmployee.given_name}`);
    } else {
      res.send("No active employee found.");
    }
  } catch (error) {
    console.error('❌ Clock-in error:', error.message);
    res.status(500).send("Error clocking in.");
  }
});

// ➤ Webhook: New Employee Added from Square
app.post('/webhook', async (req, res) => {
  const data = req.body;

  // Optional logging
  fs.appendFileSync('new_employee_webhook_log.txt', JSON.stringify(data, null, 2) + '\n');

  try {
    const teamMember = data?.data?.object?.team_member;

    if (teamMember) {
      const name = `${teamMember.given_name} ${teamMember.family_name}`;
      const email = teamMember.email_address || null;
      const squareId = teamMember.id;

      const connection = await mysql.createConnection(dbConfig);
      await connection.execute(
        "INSERT INTO users (name, email, square_id, user_type) VALUES (?, ?, ?, 1)",
        [name, email, squareId]
      );
      await connection.end();

      console.log(`✅ New employee inserted: ${name}`);
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
