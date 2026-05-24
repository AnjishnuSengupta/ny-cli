// Obfuscated Firebase configuration to prevent simple scraping
// The config is Base64 encoded.

export const getFirebaseConfig = () => {
  return {
    apiKey: Buffer.from('QUl6YVN5QWZ3T19jLV9CYmtpSTBOY2lwVHZHSXlhX1IxRVl5eVRJ', 'base64').toString('utf8'),
    authDomain: Buffer.from('bnlhbmltZS10ZWNoLmZpcmViYXNlYXBwLmNvbQ==', 'base64').toString('utf8'),
    projectId: Buffer.from('bnlhbmltZS10ZWNo', 'base64').toString('utf8'),
    storageBucket: Buffer.from('bnlhbmltZS10ZWNoLmZpcmViYXNlc3RvcmFnZS5hcHA=', 'base64').toString('utf8'),
    messagingSenderId: Buffer.from('Njc3NDA3MTg0OTU1', 'base64').toString('utf8'),
    appId: Buffer.from('MTo2Nzc0MDcxODQ5NTU6d2ViOmIzY2M1MDk1ZTgzOGM5MDE3ZTI0MWU=', 'base64').toString('utf8'),
    measurementId: Buffer.from('Ry1FR0ZGRldUOERL', 'base64').toString('utf8')
  };
};
