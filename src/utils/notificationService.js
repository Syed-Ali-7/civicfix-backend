const { Expo } = require('expo-server-sdk');

const expo = new Expo();

async function sendPushNotification(pushToken, title, body, data = {}) {
  // EXPO PUSH NOTIFICATIONS
  // Notifications fire on: Escalated, Resolved only
  // Never fire for: Open status changes
  if (!pushToken) return;
  if (!Expo.isExpoPushToken(pushToken)) {
    console.log('[NOTIF] Invalid push token:', pushToken);
    return;
  }

  try {
    const message = {
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    console.log(`[NOTIF] Sent to ${pushToken}: ${title}`);
  } catch (error) {
    console.log('[NOTIF ERROR]', error.message);
    // Never crash main process due to notification failure
  }
}

module.exports = { sendPushNotification };
