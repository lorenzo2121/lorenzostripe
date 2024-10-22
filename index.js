const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();
require('dotenv').config();

// Initialize Firebase Admin SDK
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

// Stripe webhook secret
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// General middleware
app.use(cors());

// Endpoint to create a checkout session
app.post('/create-checkout-session', express.json(), async (req, res) => {
  const { priceId, userEmail } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `http://localhost:4242/success?user_email=${userEmail}`,
      cancel_url: 'http://localhost:4242/canceled',
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Stripe webhook endpoint
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log("webhook")
  const bodyString = req.body.toString('utf8');
  const event = JSON.parse(bodyString); // Parse the JSON string into an object

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      // Extract user email from success_url
      const urlParams = new URLSearchParams(new URL(session.success_url).search);
      const userEmail = urlParams.get('user_email');

      try {
        const userQuerySnapshot = await db.collection('professionisti').where('email', '==', userEmail).get();

        if (userQuerySnapshot.empty) {
          console.log(`No user found with email ${userEmail}`);
          return;
        }

        userQuerySnapshot.forEach(async (doc) => {
          await doc.ref.update({
            richiesterimanentin: admin.firestore.FieldValue.increment(10),
          });
          console.log(`Updated user ${doc.id} with 10 additional requests.`);
        });
      } catch (error) {
        console.error(`Error updating user with email ${userEmail}:`, error);
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Start server on port 4242
app.listen(4242, () => console.log('Server is running on port 4242'));
