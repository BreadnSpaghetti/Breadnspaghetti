const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const app = express();
const PORT = 3000;

const usersFile = path.join(__dirname, "users.json");
const tenantsFile = path.join(__dirname, "tenants.json");

app.use(bodyParser.json());
app.use(express.static(__dirname));

function loadData(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let data = fs.readFileSync(filePath);
  return JSON.parse(data);
}

function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

app.post("/signup", (req, res) => {
  const { name, email, password } = req.body;
  let users = loadData(usersFile);

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (users.some(u => u.email === email)) {
    return res.status(400).json({ message: "User already exists" });
  }

  users.push({ name, email, password });
  saveData(usersFile, users);

  res.json({ message: "Signup successful", user: { name, email } });
});

app.post("/signin", (req, res) => {
  const { email, password } = req.body;
  let users = loadData(usersFile);

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  res.json({ message: "Signin successful", user: { name: user.name, email: user.email } });
});

app.post("/addTenant", (req, res) => {
  const {
    name,
    address,
    rentPaid,
    leaseType,
    leaseStart,
    leaseEnd,
    rentPrice,
    securityDeposit,
    paymentDueDate,
    lateFee,
    utilitiesIncluded
  } = req.body;

  if (!name || !address || !leaseStart || !leaseEnd) {
    return res.status(400).json({ message: "Missing required tenant information." });
  }

  let tenants = loadData(tenantsFile);

  const newTenant = {
    name,
    address,
    rentPaid: !!rentPaid,
    leaseType,
    leaseStart,
    leaseEnd,
    rentPrice,
    securityDeposit,
    paymentDueDate,
    lateFee,
    utilitiesIncluded: Array.isArray(utilitiesIncluded) ? utilitiesIncluded : []
  };

  tenants.push(newTenant);
  saveData(tenantsFile, tenants);

  res.json({ message: "Tenant added successfully", tenant: newTenant });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
