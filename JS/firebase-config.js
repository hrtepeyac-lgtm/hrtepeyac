import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc,
    updateDoc, 
    deleteDoc,
    onSnapshot, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBgfcS38ZMU3Ox8kemqcMuIneRjzBdqdZk",
    authDomain: "hrtepeyac-d7722.firebaseapp.com",
    projectId: "hrtepeyac-d7722",
    storageBucket: "hrtepeyac-d7722.firebasestorage.app",
    messagingSenderId: "176799419330",
    appId: "1:176799419330:web:d9c165c08cb1724dd3245b",
    measurementId: "G-PB236VRPLM"
};

// Inicialización de servicios
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Exportaciones para usar en tus demás scripts
export { 
    app,
    analytics,
    auth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    db, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc,
    updateDoc, 
    deleteDoc,
    onSnapshot, 
    query, 
    where 
};
