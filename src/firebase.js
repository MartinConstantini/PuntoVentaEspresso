import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const fallbackFirebaseConfig = {
  apiKey: "AIzaSyD7nddNYWyIrxfQZNeLKUN1i2c49sTO3po",
  authDomain: "esspresoanch.firebaseapp.com",
  projectId: "esspresoanch",
  storageBucket: "esspresoanch.firebasestorage.app",
  messagingSenderId: "172136834596",
  appId: "1:172136834596:web:eaaa38e85d2a34c3235ab1",
  measurementId: "G-VR00WLZ9JS"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fallbackFirebaseConfig.measurementId
};

const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];

const missingKeys = requiredKeys
  .filter((key) => !firebaseConfig[key] || String(firebaseConfig[key]).startsWith("tu_"));

export const firebaseReady = missingKeys.length === 0;
export const missingFirebaseKeys = missingKeys;

let app = null;
let db = null;

if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { app, db, firebaseConfig };
