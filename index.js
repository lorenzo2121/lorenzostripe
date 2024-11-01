// Load environment variables
require('dotenv').config();

// Import dependencies
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Express app
const app = express();

// Initialize Firebase Admin SDK
const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();

// Stripe webhook secret
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// General middleware
app.use(cors());
app.use(express.json()); // Middleware for parsing JSON requests
app.use(express.raw({ type: 'application/json' })); // Middleware per il webhook di Stripe

// Endpoint to create a checkout session
app.post('/create-checkout-session', async (req, res) => {
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
app.post('/webhook', async (req, res) => {
  const event = req.body; // `req.body` è già un oggetto JSON
  console.log('Received webhook:', event); // Log del corpo per il debug

  // Gestisci l'evento
  switch (event.type) {
    case 'checkout.session.completed':
      const sessionId = event.data.object.id; // Ottieni l'ID della sessione
      const userEmail = new URLSearchParams(new URL(event.data.object.success_url).search).get('user_email');

      try {
        // Recupera i dettagli della sessione da Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['line_items'], // Espandi line_items per ottenere dettagli
        });

        // Controlla se line_items è presente e ha almeno un elemento
        if (session.line_items && session.line_items.data.length > 0) {
          const priceId = session.line_items.data[0].price.id; // Ottieni l'ID del prezzo

          let incrementValue = 0;

          // Determina l'incremento in base al priceId
          switch (priceId) {
            case 'price_1QGHpdJ1H5ZQ9QSPLyjuHqKg':
              incrementValue = 5;
              break;
            case 'price_1QGHq2J1H5ZQ9QSPvVzhBZ6D':
              incrementValue = 15;
              break;
            case 'price_1QGHqSJ1H5ZQ9QSPAd1CsLGG':
              incrementValue = 30;
              break;
            default:
              console.log('Unknown price ID');
          }

          // Aggiorna l'utente con l'incremento delle richieste
          const userQuerySnapshot = await db.collection('professionisti').where('email', '==', userEmail).get();

          if (userQuerySnapshot.empty) {
            console.log(`No user found with email ${userEmail}`);
            return;
          }

          userQuerySnapshot.forEach(async (doc) => {
            await doc.ref.update({
              richiesterimanentin: admin.firestore.FieldValue.increment(incrementValue),
            });
            console.log(`Updated user ${doc.id} with ${incrementValue} additional requests.`);
          });
        } else {
          console.log('No line items found in the session.');
        }
      } catch (error) {
        console.error(`Error retrieving session ${sessionId}:`, error);
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Start server on port 4242
const PORT = 4242;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://0.0.0.0:${PORT}`);
});

