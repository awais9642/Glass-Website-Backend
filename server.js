const express = require('express');
const cors = require('cors');
require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load Firebase credentials from JSON file
const serviceAccountPath = path.join(__dirname, 'firebase-key.json');

console.log('Loading firebase-key.json from:', serviceAccountPath);

let serviceAccount;
try {
  const data = fs.readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(data);
  console.log('✅ Firebase credentials loaded');
} catch (error) {
  console.error('❌ Error loading firebase-key.json:', error.message);
  process.exit(1);
}

// Initialize Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is working!', timestamp: new Date() });
});

// Get items from Firestore
app.get('/api/items', async (req, res) => {
  try {
    const snapshot = await db.collection('items').get();
    const items = [];
    snapshot.forEach(doc => {
      items.push({ id: doc.id, ...doc.data() });
    });
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create item in Firestore
app.post('/api/items', async (req, res) => {
  try {
    const docRef = await db.collection('items').add({
      ...req.body,
      createdAt: new Date(),
    });
    res.json({ id: docRef.id, ...req.body });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Full Name is required' });
    }

    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (!phone || phone.trim() === '') {
      return res.status(400).json({ error: 'Phone Number is required' });
    }

    // Phone number validation (at least 10 digits)
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(phone) || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Please enter a valid phone number (at least 10 digits)' });
    }

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.trim().length < 5) {
      return res.status(400).json({ error: 'Message must be at least 5 characters long' });
    }

    // Build contact data with required fields
    const contactData = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      message: message.trim(),
      createdAt: new Date(),
      ip: req.ip,
    };

    // Add service ONLY if it has a value (optional field - no validation)
    if (service && service.trim() !== '') {
      contactData.service = service.trim();
    }

    // Save to Firestore
    const docRef = await db.collection('contacts').add(contactData);

    console.log('✅ Contact saved:', docRef.id);
    res.json({ 
      success: true, 
      id: docRef.id,
      message: 'Thank you! We will contact you soon.' 
    });
  } catch (error) {
    console.error('Error saving contact:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`Test: http://localhost:${PORT}/api/test`);
});