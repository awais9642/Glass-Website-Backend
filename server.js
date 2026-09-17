const express = require('express');
const cors = require('cors');
require('dotenv').config();

const admin = require('firebase-admin');

// Firebase configuration
const requiredFirebaseEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
];

const missingFirebaseEnv = requiredFirebaseEnv.filter(
  name => !process.env[name]
);

if (missingFirebaseEnv.length > 0) {
  throw new Error(
    `Missing Firebase environment variables: ${missingFirebaseEnv.join(', ')}`
  );
}

const serviceAccount = {
  type: process.env.FIREBASE_TYPE || 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url:
    process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url:
    process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log('✅ Firebase Admin initialized successfully');

const db = admin.firestore();
const app = express();

// ========================================
// CORS CONFIGURATION
// ========================================

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://faizannadeemts.com',
  'https://www.faizannadeemts.com',
];

const envOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : defaultOrigins;

const normalizeOrigin = origin => {
  try {
    const url = new URL(origin.trim());

    // CORS origins must be HTTP(S) origins. This also strips any path or
    // trailing slash accidentally included in the environment variable.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
};

const allowedOrigins = new Set(
  envOrigins.map(normalizeOrigin).filter(Boolean)
);
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';

console.log('Allowed CORS origins:', [...allowedOrigins]);

const isAllowedOrigin = origin => {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return false;
  }

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  if (!allowVercelPreviews) {
    return false;
  }

  return new URL(normalizedOrigin).hostname.endsWith('.vercel.app');
};

const corsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin header are non-browser or same-origin
    // requests and do not need CORS protection.
    if (!origin) {
      return callback(null, true);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    console.warn('CORS blocked origin:', origin);
    // Do not throw here: returning false omits CORS headers and lets the
    // browser safely block a cross-origin response without creating a 500.
    return callback(null, false);
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
// ========================================
// TEST ROUTE
// ========================================

app.get('/api/test', (req, res) => {
  res.json({
    message: 'Backend is working!',
    timestamp: new Date(),
  });
});

// ========================================
// GET ITEMS
// ========================================

app.get('/api/items', async (req, res) => {
  try {
    const snapshot = await db.collection('items').get();

    const items = [];

    snapshot.forEach(doc => {
      items.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// CREATE ITEM
// ========================================

app.post('/api/items', async (req, res) => {
  try {
    const docRef = await db.collection('items').add({
      ...req.body,
      createdAt: new Date(),
    });

    res.json({
      id: docRef.id,
      ...req.body,
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// CONTACT FORM
// ========================================

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, service, message } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Full Name is required' });
    }

    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (!phone || phone.trim() === '') {
      return res.status(400).json({ error: 'Phone Number is required' });
    }

    // FIXED: Safely placed hyphen at the end of the character set
    const phoneRegex = /^[\d\s+()-]+$/;

    if (
      !phoneRegex.test(phone) ||
      phone.replace(/\D/g, '').length < 10
    ) {
      return res.status(400).json({
        error: 'Please enter a valid phone number (at least 10 digits)',
      });
    }

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.trim().length < 5) {
      return res.status(400).json({
        error: 'Message must be at least 5 characters long',
      });
    }

    const contactData = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      message: message.trim(),
      createdAt: new Date(),
      ip: req.ip || req.headers['x-forwarded-for'] || '',
    };

    if (service && service.trim() !== '') {
      contactData.service = service.trim();
    }

    const docRef = await db.collection('contacts').add(contactData);

    console.log('✅ Contact saved:', docRef.id);

    return res.json({
      success: true,
      id: docRef.id,
      message: 'Thank you! We will contact you soon.',
    });
  } catch (error) {
    console.error('Error saving contact:', error);
    return res.status(500).json({ error: error.message });
  }
});
// ========================================
// START SERVER
// ========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
