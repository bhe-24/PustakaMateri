import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Konfigurasi Firebase dengan API Key langsung (Hardcoded)
// Ini solusi tercepat agar tidak kena error "auth/invalid-api-key"
const firebaseConfig = { 
    apiKey: "AIzaSyDpUWUIzPXIZN6rrNtsIqcL6VfOE2RLVl0", 
    authDomain: "mading-cf676.firebaseapp.com", 
    projectId: "mading-cf676", 
    storageBucket: "mading-cf676.firebasestorage.app", 
    messagingSenderId: "72175203671", 
    appId: "1:72175203671:web:7a0676a55beb64bc96ba12" 
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
