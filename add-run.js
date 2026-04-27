const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDRxa14szfTtJTQsAFqNSNy-utyWSYVR1E",
  authDomain: "relationship-meme-finder.firebaseapp.com",
  projectId: "relationship-meme-finder",
  storageBucket: "relationship-meme-finder.firebasestorage.app",
  messagingSenderId: "473667344223",
  appId: "1:473667344223:web:02d51a75e8139f396ac8ea",
  measurementId: "G-5RJYWZDB0Z"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const shouldKeepPost = (item) => {
  if (!item) return false;
  const type = String(item.type || '').toLowerCase();
  const postType = String(item.postType || '').toLowerCase();
  const mediaType = String(item.mediaType || '').toLowerCase();
  const isVideo = item.isVideo === true
    || type.includes('video')
    || postType.includes('video')
    || mediaType.includes('video')
    || Boolean(item.videoUrl)
    || Boolean(item.videoUrls)
    || Boolean(item.hasOwnProperty('is_video') && item.is_video);
  if (isVideo) return false;
  const isCarousel = postType.includes('carousel');
  const isImage = postType.includes('image') || postType.includes('photo') || postType.includes('post');
  return isCarousel || isImage || Boolean(item.displayUrl) || Boolean(item.url);
};

const getItemKey = (item) => btoa(String(item.url || item.id || item._id || `${item.ownerUsername}-${item.timestamp}`));

async function addRunToHistory() {
  try {
    const secretDoc = await getDoc(doc(db, 'secrets', 'apify'));
    const token = secretDoc.data().token;
    const runId = '6S7I0Io5onwLhEIlf';

    const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    const runData = await runRes.json();
    const datasetId = runData.data.defaultDatasetId;

    const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
    const items = await res.json();

    const filtered = items.filter(shouldKeepPost).map(item => ({ ...item, vote: 'none' }));

    const historyRef = collection(db, 'artifacts', 'relationship-meme-finder', 'settings', 'config', 'history');
    const batch = [];
    for (const item of filtered) {
      const key = getItemKey(item);
      const itemRef = doc(historyRef, key);
      batch.push(setDoc(itemRef, item, { merge: true }));
    }
    await Promise.all(batch);
    console.log('Successfully added run data to history subcollection');
  } catch (error) {
    console.error('Error adding run to history:', error);
  }
}

addRunToHistory();