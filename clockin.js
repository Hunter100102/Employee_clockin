require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up session middleware
app.use(session({
  secret: 'automateit_secret',
  resave: false,
  saveUninitialized: true
}));

// Set up MySQL connection
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'hookahbar_db'
};

// Helper function to call Square API
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

// Clock-in endpoint
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
    console.error('Error:', error.message);
    res.status(500).send("Error clocking in.");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
