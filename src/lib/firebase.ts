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

const VAPID_KEY = 'BNmYmfR94n7jGzrNFfzoLbAO3SNNj_Kt6Mry4XUNXxCYvVBp3h_13UIYOX3JEByg4YFs-5fGTjZing-NMzBTtB4'

const app       = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

export type NotificationPermissionFailureReason = 'unsupported' | 'denied' | 'error'

export type NotificationPermissionResult =
  | { ok: true; token: string }
  | { ok: false; reason: NotificationPermissionFailureReason; message?: string }

export function getFirebaseStatus() {
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  try {
    return {
      initialized: Boolean(app && messaging),
      hasServiceWorker,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { initialized: false, hasServiceWorker, error: message }
  }
}

// Request permission and get FCM token
export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission === 'denied') {
      return { ok: false, reason: 'denied' }
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied', message: 'لم يتم منح إذن الإشعارات' }
    }

    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    if (!token) {
      return { ok: false, reason: 'error', message: 'لم يتم الحصول على رمز FCM من Firebase' }
    }
    return { ok: true, token }
  } catch (err) {
    console.error('Error getting notification token:', err)
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'error', message }
  }
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: any) => void) {
  return onMessage(messaging, callback)
}

export { messaging }
