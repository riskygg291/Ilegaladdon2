import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, doc, collection, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbqPAK0d4GgDg4EfF6ifusk_YrbPTCXNM",
  authDomain: "ser1-b1edb.firebaseapp.com",
  projectId: "ser1-b1edb",
  messagingSenderId: "901611034842",
  appId: "1:901611034842:web:91fef03da52811e93dade3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { 
  db, 
  doc, collection, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp
};