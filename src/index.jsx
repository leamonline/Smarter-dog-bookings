import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "smarter-dog-bookings.firebaseapp.com",
  projectId: "smarter-dog-bookings",
};

const app = initializeApp(firebaseConfig);

console.log("Firebase connected:", app);