import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Configuración del nuevo proyecto Master CRM
const masterConfig = {
  apiKey: "AIzaSyBYyk46rga2kpsuYf6gAngRyIK7ryO7OrI",
  authDomain: "master-crm-jvarela.firebaseapp.com",
  projectId: "master-crm-jvarela",
  storageBucket: "master-crm-jvarela.firebasestorage.app",
  messagingSenderId: "558777018603",
  appId: "1:558777018603:web:0c03708e67c47315d676ae"
};

// Configuración del proyecto de tu Padre
const fatherConfig = {
  apiKey: "AIzaSyC6_3IMkH93iIc4f9Uo6kXq7fTYMFeDzoQ",
  authDomain: "solar-leads-juliovmartinez.firebaseapp.com",
  projectId: "solar-leads-juliovmartinez",
  storageBucket: "solar-leads-juliovmartinez.firebasestorage.app",
  messagingSenderId: "718683807078",
  appId: "1:718683807078:web:aa0a27d831de633e957ca7"
};

// Configuración del proyecto de Angel
const angelConfig = {
  apiKey: "AIzaSyCik17gy-L19LULCPnGICCyT605OEq8Fwo",
  authDomain: "angel-curbelo-sales-crm.firebaseapp.com",
  projectId: "angel-curbelo-sales-crm",
  storageBucket: "angel-curbelo-sales-crm.firebasestorage.app",
  messagingSenderId: "251971857439",
  appId: "1:251971857439:web:69b636afe03604e885f92a"
};

// Inicializar apps
const masterApp = initializeApp(masterConfig);
const fatherApp = initializeApp(fatherConfig, "father");
const angelApp = initializeApp(angelConfig, "angel");

export const dbMaster = getFirestore(masterApp); // Base de datos Master
export const dbFather = getFirestore(fatherApp); // Base de datos Padre
export const dbAngel = getFirestore(angelApp); // Base de datos Angel
export const functions = getFunctions(angelApp); // Cloud functions compartidas

