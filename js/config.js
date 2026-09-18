// ============================================================
//  RUF Workspace — configuration
//  Firebase project: ruf-data-base   (keys already filled in)
// ============================================================

window.RUF_CONFIG = {

  // 1) Firebase web app config — copied from your Firebase console. Nothing to change here.
  firebase: {
    apiKey: "AIzaSyAN8-z3-NMdu3UHdroHTNwCCJOiY1Oac1M",
    authDomain: "ruf-data-base.firebaseapp.com",
    projectId: "ruf-data-base",
    storageBucket: "ruf-data-base.firebasestorage.app",
    messagingSenderId: "770620564599",
    appId: "1:770620564599:web:68d8a32615c9325a725272"
  },

  // 2) >>> THE ONLY LINE YOU NEED TO EDIT <<<
  //    The email address YOU will sign in with. This makes you the first Admin.
  //    Must match EXACTLY the email you put in firestore.rules (all lowercase).
  ownerEmail: "talthunayan64@gmail.com",

  // 3) Company name shown in the sidebar and on client pages.
  companyName: "RUF",

  // 4) Optional — n8n webhook for WhatsApp / email delivery. Leave empty for now.
  n8nWebhookUrl: "",

  // 5) Optional — public address of the app (used in client links). Leave empty to detect automatically.
  publicUrl: ""
};
