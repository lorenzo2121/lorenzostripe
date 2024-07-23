const stripe = require('stripe')('sk_test_51PaK4uJ1H5ZQ9QSPHXoMdNZCGNA3CrH439YaWbChIqh00Ko3y7GfWDpoDykulcdQS9ZvdSEONaiz475NK669upAj00kBkqrTcs'); // Inserisci la tua chiave segreta Stripe
const express = require('express');
const cors = require('cors'); // Importa il middleware cors
const admin = require('firebase-admin');
const app = express();

// Configura Firebase Admin SDK
const serviceAccount = require('./public/cianfoni-51cc8-firebase-adminsdk-q8102-516fc87b17.json'); // Inserisci il percorso del tuo file di servizio JSON

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://default.firebaseio.com' // Sostituisci con l'URL del tuo database Firebase
});

const db = admin.firestore();

// Questo è il segreto del webhook per il test
const endpointSecret = 'whsec_d80f8f3631d10afee8db08465702493191744584a040c1cc81e8593a3c76aad0';

// Middleware per parsare il corpo della richiesta come JSON
app.use(express.json());
app.use(cors()); // Abilita CORS per tutte le richieste
app.use(express.urlencoded({ extended: true }));

// Endpoint per creare una sessione di checkout
app.post('/create-checkout-session', async (req, res) => {
  const { priceId, userEmail } = req.body;

  try {
    // Crea una sessione di checkout
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
    // Stripe richiede che il body del webhook sia fornito come una stringa raw o un Buffer
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook error: ${err.message}`);
    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Gestisci l'evento
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;

      // Estrai l'ID dell'utente e altre informazioni dal campo success_url
      const urlParams = new URLSearchParams(new URL(session.success_url).search);
      const userEmail = urlParams.get('user_email');

      try {
        // Cerca l'utente usando l'email
        const userQuerySnapshot = await db.collection('professionisti').where('email', '==', userEmail).get();

        if (userQuerySnapshot.empty) {
          console.log(`No user found with email ${userEmail}`);
          return;
        }

        // Aggiorna il documento dell'utente trovato
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
    // ... gestisci altri tipi di eventi se necessario
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Rispondi a Stripe per confermare la ricezione dell'evento
  response.json({ received: true });
});

// Avvia il server sulla porta 4242
app.listen(4242, () => console.log('Server is running on port 4242'));
