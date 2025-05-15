require("dotenv").config();
const express = require("express");
const axios = require("axios");
const session = require("express-session");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(
  session({
    secret: "automateit_secret",
    resave: false,
    saveUninitialized: true,
  })
);

// ➤ Helper to format phone number
function formatPhoneNumber(phone) {
  if (phone.startsWith("+1") && phone.length === 12) {
    return `${phone.slice(2, 5)}-${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

// ➤ Webhook for clock-in via Square
app.post("/webhook", async (req, res) => {
  const data = req.body;
  fs.appendFileSync(
    "square_webhook_log.txt",
    JSON.stringify(data, null, 2) + "\n"
  );

  try {
    const eventType = data.type;
    const teamMemberId = data?.data?.object?.shift?.team_member_id;

    if (
      eventType === "labor.shift.created" ||
      eventType === "labor.shift.updated"
    ) {
      // ✅ Step 1: Check user existence on InfinityFree
      const checkRes = await axios.post(
        "https://hookahbar.unaux.com/check_user.php",
        {
          square_id: teamMemberId,
        }
      );

      if (checkRes.data.found) {
        const userId = checkRes.data.user_id;

        // ✅ Step 2: Insert clock-in remotely on InfinityFree
        const insertRes = await axios.post(
          "https://hookahbar.unaux.com/insert_clockin.php",
          {
            user_id: userId,
          }
        );

        if (insertRes.data.success) {
          console.log(`✅ Clock-in recorded for user_id ${userId}`);
        } else {
          console.log(`❌ Clock-in insert failed: ${insertRes.data.message}`);
        }
      } else {
        console.log(`⚠️ No user found with square_id ${teamMemberId}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// ➤ Webhook for new employee from Square
app.post("/webhook", async (req, res) => {
  const data = req.body;
  fs.appendFileSync(
    "new_employee_webhook_log.txt",
    JSON.stringify(data, null, 2) + "\n"
  );

  try {
    const teamMember = data?.data?.object?.team_member;

    if (teamMember) {
      const name = `${teamMember.given_name} ${teamMember.family_name}`;
      const email = teamMember.email_address || null;
      const phone = formatPhoneNumber(teamMember.phone_number || "");
      const squareId = teamMember.id;

      // This part inserts into the local Render DB (if still used)
      // You can keep this or remove if not needed
      console.log(`ℹ️ New employee received: ${name} (${squareId})`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    res.sendStatus(500);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
