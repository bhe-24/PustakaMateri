import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Konfigurasi Firebase
const firebaseConfig = { 
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY, 
    authDomain: "mading-cf676.firebaseapp.com", 
    projectId: "mading-cf676", 
    storageBucket: "mading-cf676.firebasestorage.app", 
    messagingSenderId: "72175203671", 
    appId: "1:72175203671:web:7a0676a55beb64bc96ba12" 
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
