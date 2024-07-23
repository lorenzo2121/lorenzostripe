const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const app = express();

// Configura Firebase Admin SDK
const serviceAccountPath = '/etc/secrets/cianfoni-51cc8-firebase-adminsdk-q8102-516fc87b17.json'; // Path del file segreto
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

// Questo è il segreto del webhook per il test
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Middleware per parsare il corpo della richiesta come JSON
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Endpoint per creare una sessione di checkout
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

// Gestisci gli eventi del webhook di Stripe
app.post('/webhook', express.raw({ type: 'application/json' }), async (request, response) => {
  const sig = request.headers['stripe-signature'];
  
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;

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

  response.json({ received: true });
});

// Avvia il server sulla porta 4242
app.listen(4242, () => console.log('Server is running on port 4242'));
