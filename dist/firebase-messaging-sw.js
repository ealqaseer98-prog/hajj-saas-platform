// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC_KbWP1xdCItOGVOJTYtCkaiqnNBw-ekc",
  authDomain: "alammar-707a4.firebaseapp.com",
  projectId: "alammar-707a4",
  storageBucket: "alammar-707a4.firebasestorage.app",
  messagingSenderId: "780687246472",
  appId: "1:780687246472:web:910ff2f2f9bfbecbca8b3d"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);
  const { title, body, icon } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'حملة العمار', {
    body: body ?? '',
    icon: icon ?? '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: payload.data,
  });
});
