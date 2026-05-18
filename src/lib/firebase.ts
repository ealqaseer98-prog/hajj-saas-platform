// src/lib/firebase.ts
import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: "AIzaSyC_KbWP1xdCItOGVOJTYtCkaiqnNBw-ekc",
  authDomain: "alammar-707a4.firebaseapp.com",
  projectId: "alammar-707a4",
  storageBucket: "alammar-707a4.firebasestorage.app",
  messagingSenderId: "780687246472",
  appId: "1:780687246472:web:910ff2f2f9bfbecbca8b3d"
}

const VAPID_KEY = 'dM1ZOyL6HFb_EzzSMTn0hW11-MPlMxpAUMcNQ0DjY_4'

const app      = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

// Request permission and get FCM token
export async function requestNotificationPermission(): Promise<string | null> {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    return token
  } catch (err) {
    console.error('Error getting notification token:', err)
    return null
  }
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: any) => void) {
  return onMessage(messaging, callback)
}

export { messaging }
