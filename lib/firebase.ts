"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

/**
 * Modular Firebase bootstrap. Every getter returns null when the project is not configured,
 * so the whole app keeps working in demo mode with empty env vars.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
const appCheckDebugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;
let appCheckState: "off" | "recaptcha-enterprise" | "debug" = "off";

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured || typeof window === "undefined") return null;
  if (app) return app;
  app = getApps()[0] ?? initializeApp(config);

  // App Check protects the Gemini quota behind Firebase AI Logic.
  if (recaptchaSiteKey) {
    if (appCheckDebugToken || process.env.NODE_ENV === "development") {
      // `true` makes the SDK print a debug token to the console; register it in the Firebase console.
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        appCheckDebugToken || true;
      appCheckState = "debug";
    } else {
      appCheckState = "recaptcha-enterprise";
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return app;
}

export function getAppCheckState() {
  getFirebaseApp();
  return { state: appCheckState, active: Boolean(appCheck) };
}

/** Firestore + anonymous auth are loaded lazily; only anonymised records are written. */
export async function getFirestoreSync() {
  const a = getFirebaseApp();
  if (!a) return null;
  const [{ getFirestore, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp }, { getAuth, signInAnonymously }] =
    await Promise.all([import("firebase/firestore"), import("firebase/auth")]);
  const auth = getAuth(a);
  if (!auth.currentUser) await signInAnonymously(auth);
  const db = getFirestore(a);
  return { db, uid: auth.currentUser!.uid, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp };
}
