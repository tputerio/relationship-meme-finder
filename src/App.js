import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, doc, onSnapshot, getDoc, setDoc, updateDoc, 
  collection, query, limit, getDocs, deleteDoc, 
  where, writeBatch, serverTimestamp 
} from "firebase/firestore";
import { 
  Heart, RefreshCw, AlertCircle, Loader2, PlusCircle, 
  Trash2, Settings2, ChevronLeft, Instagram, Lock, 
  Unlock, Calendar, ThumbsUp, ThumbsDown, Search, 
  Layers, Filter, ExternalLink, Menu, X
} from 'lucide-react';

// --- CONFIGURATION ---
const firebaseConfig = { 
  apiKey: "AIzaSyDRxa14szfTtJTQsAFqNSNy-utyWSYVR1E", 
  authDomain: "relationship-meme-finder.firebaseapp.com", 
  projectId: "relationship-meme-finder", 
  storageBucket: "relationship-meme-finder.firebasestorage.app", 
  messagingSenderId: "473667344223", 
  appId: "1:473667344223:web:02d51a75e8139f396ac8ea", 
  measurementId: "G-5RJYWZDB0Z" 
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "relationship-meme-finder";

const COST_POST_SCAN = 1.70;
const COST_RELATED_SCAN = 4.00;

const App = () => {
  const [user, setUser] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [apifyToken, setApifyToken] = useState(null);
  const [activeSidebarTab, setActiveSidebarTab] = useState('scan'); 
  const [mainFilter, setMainFilter] = useState('unrated'); 
  const [activeMainTab, setActiveMainTab] = useState('current'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Data State
  const [allMemes, setAllMemes] = useState([]);
  const [currentScanData, setCurrentScanData] = useState([]);
  const [globalAccounts, setGlobalAccounts] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [selectedScanId, setSelectedScanId] = useState(null);
  const [currentScanDocId, setCurrentScanDocId] = useState(null);
  
  // Controls
  const [relatedTarget, setRelatedTarget] = useState("");
  const [relatedCount, setRelatedCount] = useState(20);
  const [lookbackValue, setLookbackValue] = useState(1);
  const [lookbackUnit, setLookbackUnit] = useState('months');
  const [postsPerAccount, setPostsPerAccount] = useState(10);
  const [activeUsernames, setActiveUsernames] = useState([]);
  const [relatedUsernameInput, setRelatedUsernameInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);

  // --- AUTH & INIT ---
  useEffect(() => {
    const initAuth = async () => {
      await signInAnonymously(auth);
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const storedToken = localStorage.getItem('rmf-apify-token');
        if (storedToken) {
          setApifyToken(storedToken);
          setIsUnlocked(true);
        }
      }
    });
  }, []);

  // --- FIRESTORE DATA (RULE 2: Simple Queries Only) ---
  useEffect(() => {
    if (!user) return;

    // Listen to Global Accounts
    const accsRef = collection(db, 'artifacts', appId, 'related_accounts');
    const unsubAccs = onSnapshot(accsRef, (snap) => {
      const accs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGlobalAccounts(accs.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0)));
    });

    // Listen to All Memes (History)
    const memesRef = collection(db, 'artifacts', appId, 'memes');
    const unsubMemes = onSnapshot(memesRef, (snap) => {
      const memes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllMemes(memes);
    }, (err) => {
      console.error("Firestore error:", err);
      setError("Failed to load history. Check permissions.");
    });

    const scansRef = collection(db, 'artifacts', appId, 'scan_history');
    const unsubScans = onSnapshot(scansRef, (snap) => {
      const scans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setScanHistory(scans.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (err) => {
      console.error("Firestore scan history error:", err);
    });

    return () => { unsubAccs(); unsubMemes(); unsubScans(); };
  }, [user]);

  // --- MEMORY FILTERING & SORTING ---
  const displayData = useMemo(() => {
    let filtered = [];
    
    // 1. Filter by Scope (Current Scan vs History)
    if (activeMainTab === 'current') {
      const currentIds = new Set(currentScanData.map(m => m.id));
      filtered = allMemes.filter(m => currentIds.has(m.id));
      // Fallback if latency delays Firestore sync
      if (filtered.length === 0 && currentScanData.length > 0) {
        filtered = [...currentScanData];
      }
    } else {
      filtered = [...allMemes];
    }

    // 2. Filter by Vote Status
    if (mainFilter === 'unrated') filtered = filtered.filter(m => m.vote === 'none');
    else if (mainFilter === 'liked') filtered = filtered.filter(m => m.vote === 'up');
    else if (mainFilter === 'disliked') filtered = filtered.filter(m => m.vote === 'down');

    // 3. Sort by likes descending
    return filtered.sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));
  }, [allMemes, mainFilter, activeMainTab, currentScanData]);

  const likedCountsByUsername = useMemo(() => {
    return allMemes.reduce((counts, meme) => {
      if (meme.vote === 'up') {
        const username = String(meme.ownerUsername || meme.username || '').trim();
        if (username) {
          counts[username] = (counts[username] || 0) + 1;
        }
      }
      return counts;
    }, {});
  }, [allMemes]);

  const sortedGlobalAccounts = useMemo(() => {
    return [...globalAccounts].sort((a, b) => {
      const aLiked = likedCountsByUsername[a.username] || 0;
      const bLiked = likedCountsByUsername[b.username] || 0;
      if (bLiked !== aLiked) return bLiked - aLiked;
      return (b.likesCount || 0) - (a.likesCount || 0);
    });
  }, [globalAccounts, likedCountsByUsername]);

  const relatedEstimate = useMemo(() => {
    return ((Number(relatedCount) || 0) / 1000) * COST_RELATED_SCAN;
  }, [relatedCount]);

  const scanEstimateResults = useMemo(() => {
    return activeUsernames.length * (Number(postsPerAccount) || 0);
  }, [activeUsernames, postsPerAccount]);

  const scanEstimatePrice = useMemo(() => {
    return (scanEstimateResults / 1000) * COST_POST_SCAN;
  }, [scanEstimateResults]);

  const toggleActiveUsername = (username) => {
    if (!username) return;
    setActiveUsernames(prev => prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]);
  };

  const addRelatedAccount = async () => {
    const username = String(relatedUsernameInput || '').trim().replace(/^@/, '');
    if (!username) return;
    setLoading(true);
    try {
      const accountRef = doc(db, 'artifacts', appId, 'related_accounts', username);
      await setDoc(accountRef, {
        username,
        followers: 0,
        likesCount: 0,
        lastFound: Date.now(),
      }, { merge: true });
      setStatus(`Added @${username} to related accounts.`);
      setRelatedUsernameInput('');
    } catch (e) {
      console.error(e);
      setError('Unable to add related account.');
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2500);
    }
  };

  const removeRelatedAccount = async (username) => {
    if (!username) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'related_accounts', username));
      setStatus(`Removed @${username} from related accounts.`);
      setActiveUsernames(prev => prev.filter(u => u !== username));
    } catch (e) {
      console.error(e);
      setError('Unable to remove related account.');
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2500);
    }
  };

  const selectScan = (scanId) => {
    setSelectedScanId(scanId);
    setActiveMainTab('current');
    const postsForScan = allMemes.filter(m => m.scanId === scanId);
    if (postsForScan.length) {
      setCurrentScanData(postsForScan);
    }
  };

  const selectedScan = useMemo(() => scanHistory.find(scan => scan.id === selectedScanId), [scanHistory, selectedScanId]);

  useEffect(() => {
    if (!selectedScanId) return;
    const postsForScan = allMemes.filter(m => m.scanId === selectedScanId);
    if (postsForScan.length) {
      setCurrentScanData(postsForScan);
    }
  }, [selectedScanId, allMemes]);

  // --- HELPERS: AGGRESSIVE VIDEO FILTERING ---
  const isVideoItem = (item) => {
    if (!item) return false;
    const type = String(item.type || '').toLowerCase();
    const postType = String(item.postType || '').toLowerCase();
    const mediaType = String(item.mediaType || '').toLowerCase();
    return item.isVideo === true || type.includes('video') || postType.includes('video') || mediaType.includes('video') || Boolean(item.videoUrl) || Boolean(item.videoUrls) || Boolean(item.hasOwnProperty('is_video') && item.is_video);
  };

  const shouldKeepPost = (item) => {
    if (!item || isVideoItem(item)) return false;
    const itemType = String(item.postType || item.type || item.mediaType || '').toLowerCase();
    const isCarousel = itemType.includes('carousel') || itemType.includes('sidecar');
    const isImage = itemType.includes('image') || itemType.includes('photo') || itemType.includes('post');
    return isCarousel || isImage || Boolean(item.displayUrl) || Boolean(item.url);
  };

  // --- APIFY LOGIC ---
  const pollApify = async (runId, type) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);
        const result = await res.json();
        if (result.data.status === 'SUCCEEDED') {
          clearInterval(timer);
          processResults(result.data.defaultDatasetId, type);
        } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(result.data.status)) {
          clearInterval(timer);
          setLoading(false);
          setError(`${type} scan ${result.data.status.toLowerCase()}.`);
        }
      } catch (e) {
        clearInterval(timer);
        setLoading(false);
      }
    }, 3000);
  };

  const processResults = async (datasetId, type) => {
    try {
      const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}`);
      const items = await res.json();
      
      const batch = writeBatch(db);
      if (type === 'RELATED') {
        items.forEach(acc => {
          if (!acc.username) return;
          const ref = doc(db, 'artifacts', appId, 'related_accounts', acc.username);
          batch.set(ref, {
            username: acc.username,
            followers: acc.followersCount || 0,
            likesCount: acc.likesCount || 0,
            lastFound: Date.now(),
          }, { merge: true });
        });
        setStatus("Library updated with related users!");
      } else {
        const filteredPosts = items.filter(shouldKeepPost);
        const newCurrentData = [];

        filteredPosts.forEach(post => {
          const id = btoa(post.url).replace(/\//g, '_');
          const postData = {
            ...post,
            vote: post.vote || 'none',
            createdAt: serverTimestamp(),
            scanId: currentScanDocId || null,
          };
          
          newCurrentData.push({ id, scanId: currentScanDocId || null, ...post, vote: post.vote || 'none' });
          const postRef = doc(db, 'artifacts', appId, 'memes', id);
          batch.set(postRef, postData, { merge: true });
        });

        if (currentScanDocId) {
          const historyRef = doc(db, 'artifacts', appId, 'scan_history', currentScanDocId);
          batch.set(historyRef, {
            status: 'completed',
            postCount: filteredPosts.length,
            completedAt: serverTimestamp(),
            scanId: currentScanDocId,
          }, { merge: true });
        }

        setCurrentScanData(newCurrentData);
        setActiveMainTab('current');
        setStatus(`Scanned ${filteredPosts.length} new posts!`);
      }
      await batch.commit();
    } catch (e) {
      setError("Failed to save results.");
      if (currentScanDocId) {
        await updateDoc(doc(db, 'artifacts', appId, 'scan_history', currentScanDocId), { status: 'failed', completedAt: serverTimestamp() });
      }
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const startRelatedScan = async () => {
    if (!relatedTarget) return;
    setLoading(true);
    setStatus("Scouting related accounts...");
    try {
      const res = await fetch(`https://api.apify.com/v2/acts/thenetaji~instagram-related-user-scraper/runs?token=${apifyToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "username": [relatedTarget.replace('@','')], "maxItem": parseInt(relatedCount) })
      });
      const run = await res.json();
      pollApify(run.data.id, 'RELATED');
    } catch (e) { setError("Discovery failed."); setLoading(false); }
  };

  const startPostScan = async () => {
    if (activeUsernames.length === 0) return;
    setLoading(true);
    setStatus("Scanning top IG posts...");
    try {
      const scanRef = doc(collection(db, 'artifacts', appId, 'scan_history'));
      await setDoc(scanRef, {
        type: 'Top IG Posts',
        activeUsernames,
        postsPerAccount: Number(postsPerAccount) || 0,
        lookbackValue: Number(lookbackValue) || 0,
        lookbackUnit,
        createdAt: serverTimestamp(),
        status: 'pending',
        estimatePrice: scanEstimatePrice,
      });
      setCurrentScanDocId(scanRef.id);
      setSelectedScanId(scanRef.id);

      const res = await fetch(`https://api.apify.com/v2/acts/apify~instagram-post-scraper/runs?token=${apifyToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "username": activeUsernames,
          "resultsLimit": parseInt(postsPerAccount),
          "onlyPostsNewerThan": `${lookbackValue} ${lookbackUnit}`,
          "skipPinnedPosts": true
        })
      });
      const run = await res.json();
      pollApify(run.data.id, 'POSTS');
    } catch (e) { setError("Scan failed."); setLoading(false); }
  };

  const computeMemeId = (post) => {
    if (!post) return null;
    if (post.id) return String(post.id);
    if (typeof post.url === 'string' && post.url.length > 0) {
      return btoa(post.url).replace(/\//g, '_');
    }
    return null;
  };

  const handleVote = async (post, vote) => {
    const id = computeMemeId(post);
    if (!id) return;
    const url = typeof post.url === 'string' ? post.url : null;
    const postRef = doc(db, 'artifacts', appId, 'memes', id);
    const updatedVote = vote;

    const updateItem = item => {
      if (item.id === id || (url && item.url === url)) {
        return { ...item, vote: updatedVote };
      }
      return item;
    };

    setAllMemes(prev => {
      const found = prev.some(item => item.id === id || (url && item.url === url));
      return found ? prev.map(updateItem) : [...prev, { ...post, id, vote: updatedVote }];
    });

    setCurrentScanData(prev => {
      const found = prev.some(item => item.id === id || (url && item.url === url));
      return found ? prev.map(updateItem) : [...prev, { ...post, id, vote: updatedVote }];
    });

    try {
      await setDoc(postRef, {
        vote: updatedVote,
        votedAt: updatedVote === 'down' ? Date.now() : null
      }, { merge: true });
      setStatus(updatedVote === 'down' ? 'Post marked as disliked.' : updatedVote === 'up' ? 'Post marked as liked.' : 'Vote removed.');
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      console.error('Vote save error:', e);
      setError('Failed to save vote.');
    }
  };

  const unlockApp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const secretSnap = await getDoc(doc(db, 'secrets', 'apify'));
      if (secretSnap.exists() && passwordInput === secretSnap.data().password) {
        setApifyToken(secretSnap.data().token);
        setIsUnlocked(true);
        localStorage.setItem('rmf-apify-token', secretSnap.data().token);
      } else {
        setError("Invalid Access Key");
      }
    } catch(err) { setError("Auth Error"); }
    setLoading(false);
  };

  if (!isUnlocked) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={unlockApp} className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl">
          <Lock className="text-emerald-500 mx-auto mb-6" size={40} />
          <h2 className="text-white font-black text-xl uppercase tracking-tighter mb-2 italic">Intelligence Terminal</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-8">Relationship Meme Finder v2.2</p>
          <input 
            type="password" value={passwordInput} 
            onChange={e => setPasswordInput(e.target.value)} 
            placeholder="Enter System Password" 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none focus:border-emerald-500 mb-4 font-mono text-center" 
          />
          <button className="w-full bg-emerald-500 text-slate-950 font-black py-4 rounded-xl hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">Authorize</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden overflow-x-hidden font-sans">
      {/* MOBILE OVERLAY */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 lg:sticky lg:top-0 z-[70] h-screen bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col overflow-hidden lg:overflow-y-auto relative ${isSidebarOpen ? 'w-[85vw] max-w-[85vw] translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-80 lg:max-w-none'}`}>
        {isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden absolute top-4 right-4 p-2 rounded-xl bg-slate-800/90 text-slate-100 shadow-lg shadow-slate-950/25">
            <X size={18} />
          </button>
        )}
        <div className="flex border-b border-slate-800 shrink-0">
          <button onClick={() => setActiveSidebarTab('scan')} className={`flex-1 p-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${activeSidebarTab === 'scan' ? 'bg-slate-800 text-emerald-500' : 'text-slate-500'}`}><RefreshCw size={14}/> Setup Scan</button>
          <button onClick={() => setActiveSidebarTab('library')} className={`flex-1 p-4 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${activeSidebarTab === 'library' ? 'bg-slate-800 text-emerald-500' : 'text-slate-500'}`}><Layers size={14}/> Library</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {activeSidebarTab === 'scan' ? (
            <div className="space-y-8">
              <section className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Search size={12}/> Step 1 — Find Related Users</h3>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input 
                    value={relatedTarget} onChange={e => setRelatedTarget(e.target.value)}
                    placeholder="Seed @username..." 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <input
                    type="number"
                    min="1"
                    value={relatedCount}
                    onChange={e => setRelatedCount(Number(e.target.value) || 0)}
                    className="w-full sm:w-28 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-center outline-none focus:border-emerald-500"
                    placeholder="Count"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest">
                  <span className="font-black text-slate-400"># Related users</span>
                  <span>${relatedEstimate.toFixed(2)} est.</span>
                </div>
                <button onClick={startRelatedScan} className="mt-4 w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-slate-950 transition-all">Find Related Users</button>
              </section>

              <section className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest"># Related users</h4>
                  <span className="text-[9px] text-slate-500">{sortedGlobalAccounts.length} accounts</span>
                </div>
                <div className="grid gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {sortedGlobalAccounts.map(acc => (
                    <button key={acc.id} type="button" onClick={() => toggleActiveUsername(acc.username)} className={`w-full text-left p-3 rounded-xl border transition-all ${activeUsernames.includes(acc.username) ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-950/40 border-slate-800/50 hover:border-slate-600'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-black text-white truncate">@{acc.username}</span>
                        <span className="text-[9px] text-slate-500">{(likedCountsByUsername[acc.username] || 0).toLocaleString()} liked</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Step 2 — Scan Top IG Posts</h3>
                  <span className="text-[9px] text-slate-600 font-mono italic">{activeUsernames.length} selected</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-bold text-slate-600 uppercase mb-2 block tracking-widest">Lookback Window</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="number" value={lookbackValue} onChange={e => setLookbackValue(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-full sm:w-16 text-center font-mono" />
                      <select value={lookbackUnit} onChange={e => setLookbackUnit(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] font-black uppercase">
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-600 uppercase mb-2 block tracking-widest">Posts Per User</label>
                    <input type="number" value={postsPerAccount} onChange={e => setPostsPerAccount(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Accounts to scan</div>
                      <span className="text-[9px] text-slate-500">{scanEstimateResults.toLocaleString()} posts</span>
                    </div>
                    <div className="rounded-2xl bg-slate-950/50 border border-slate-800 p-3 text-[10px] text-slate-400">
                      Estimated price: <span className="text-white">${scanEstimatePrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Related Accounts</h3>
                <span className="text-[9px] text-slate-600 font-mono italic">{sortedGlobalAccounts.length} accounts</span>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={relatedUsernameInput}
                    onChange={e => setRelatedUsernameInput(e.target.value)}
                    placeholder="@username"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={addRelatedAccount}
                    className="bg-emerald-500 text-slate-950 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {sortedGlobalAccounts.map(acc => (
                  <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl border bg-slate-950/40 border-slate-800/50">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-black text-white truncate">@{acc.username}</div>
                      <div className="text-[9px] text-slate-500 font-mono">{(likedCountsByUsername[acc.username] || 0).toLocaleString()} liked posts</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRelatedAccount(acc.username)}
                      className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scan History</h3>
                  <span className="text-[9px] text-slate-600 font-mono italic">{scanHistory.length} scans</span>
                </div>
                <div className="grid gap-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {scanHistory.length > 0 ? scanHistory.map(scan => (
                    <button key={scan.id} type="button" onClick={() => selectScan(scan.id)} className={`w-full text-left p-3 rounded-2xl border transition-all ${selectedScanId === scan.id ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-950/40 border-slate-800/50 hover:border-slate-600'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-black text-white truncate">{scan.type || 'Top IG Posts'}</div>
                          <div className="text-[9px] text-slate-500 truncate">{scan.activeUsernames?.length || 0} accounts · {scan.postCount ?? 'pending'} posts</div>
                        </div>
                        <span className="text-[9px] text-slate-500">{scan.status || 'pending'}</span>
                      </div>
                    </button>
                  )) : (
                    <div className="text-[9px] text-slate-500">No scan history available yet.</div>
                  )}
                </div>

                {selectedScan && (
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                    <div className="text-[9px] uppercase tracking-widest text-slate-500 font-black">Selected Scan Parameters</div>
                    <div className="grid gap-2 text-[10px] text-slate-300">
                      <div className="flex justify-between"><span>Type</span><span>{selectedScan.type}</span></div>
                      <div className="flex justify-between"><span>Accounts</span><span>{selectedScan.activeUsernames?.length || 0}</span></div>
                      <div className="flex justify-between"><span>Lookback</span><span>{selectedScan.lookbackValue} {selectedScan.lookbackUnit}</span></div>
                      <div className="flex justify-between"><span>Posts/User</span><span>{selectedScan.postsPerAccount}</span></div>
                      <div className="flex justify-between"><span>Status</span><span>{selectedScan.status}</span></div>
                      <div className="flex justify-between"><span>Posts loaded</span><span>{displayData.length}</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {activeSidebarTab === 'scan' && (
          <div className="p-6 border-t border-slate-800">
            <button onClick={startPostScan} disabled={loading || activeUsernames.length === 0} className="w-full bg-emerald-500 text-slate-950 font-black py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-30 shadow-lg shadow-emerald-500/20">
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw size={18}/>}
              <span className="tracking-widest text-[11px] uppercase">Scan Top IG Posts</span>
            </button>
          </div>
        )}
      </aside>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-950">
        
        {/* MOBILE-FIRST HEADER */}
        <header className="flex flex-col gap-3 p-4 lg:px-8 border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl shrink-0 z-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 lg:hidden text-emerald-500 bg-slate-900 rounded-xl border border-slate-800 shrink-0">
                {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
              <div className="bg-emerald-500 p-1.5 lg:p-2 rounded-lg shrink-0 shadow-lg shadow-emerald-500/30">
                <Heart className="text-white fill-white" size={14} />
              </div>
              <h1 className="text-sm lg:text-base font-black text-white uppercase italic tracking-tighter truncate">Meme Intel</h1>
            </div>
            
            <div className="flex bg-slate-900 rounded-xl p-1 shrink-0">
              <button onClick={() => setActiveMainTab('current')} className={`px-3 sm:px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeMainTab === 'current' ? 'bg-slate-800 text-emerald-500 shadow-sm' : 'text-slate-500'}`}>Current</button>
              <button onClick={() => setActiveMainTab('history')} className={`px-3 sm:px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeMainTab === 'history' ? 'bg-slate-800 text-emerald-500 shadow-sm' : 'text-slate-500'}`}>History</button>
            </div>
          </div>
          
          <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
            {['unrated', 'liked', 'disliked', 'all'].map(f => (
              <button key={f} onClick={() => setMainFilter(f)} className={`flex-1 min-w-[60px] px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mainFilter === f ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>{f}</button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase"><AlertCircle size={16} /> {error}</div>}
          {status && <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase animate-pulse"><Loader2 size={16} className="animate-spin" /> {status}</div>}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 lg:gap-8">
            {displayData.map((meme, idx) => (
              <div key={meme.id || idx} className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col group hover:border-emerald-500/40 transition-all shadow-xl hover:shadow-emerald-500/5">
                <div className="p-4 flex justify-between items-center bg-slate-900/50 backdrop-blur-sm border-b border-slate-800/50">
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-sm" />
                    <span className="font-black text-[10px] text-white uppercase tracking-tight truncate">@{meme.ownerUsername}</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-600 shrink-0">
                    {meme.timestamp ? new Date(meme.timestamp).toLocaleDateString() : ''}
                  </span>
                </div>
                
                <div className="relative aspect-[4/5] sm:aspect-square bg-slate-950 flex items-center justify-center overflow-hidden">
                  <img 
                    src={`https://images.weserv.nl/?url=${encodeURIComponent(meme.displayUrl)}&w=600&fit=contain`} 
                    alt="Intelligence Result" 
                    className="w-full h-full max-w-full object-contain"
                    loading="lazy" 
                  />
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2 text-center">
                      <div className="text-[8px] text-slate-500 font-black uppercase">Likes</div>
                      <div className="text-xs font-mono text-emerald-500">{(meme.likesCount || 0).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-2 text-center">
                      <div className="text-[8px] text-slate-500 font-black uppercase">Comments</div>
                      <div className="text-xs font-mono text-white">{(meme.commentsCount || 0).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleVote(meme, meme.vote === 'up' ? 'none' : 'up')}
                      className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${meme.vote === 'up' ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-emerald-500 hover:border-emerald-500'}`}
                    >
                      <ThumbsUp size={16} />
                    </button>
                    <button 
                      onClick={() => handleVote(meme, meme.vote === 'down' ? 'none' : 'down')}
                      className={`flex-1 py-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${meme.vote === 'down' ? 'bg-red-500 border-red-500 text-slate-950' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-red-500 hover:border-red-500'}`}
                    >
                      <ThumbsDown size={16} />
                    </button>
                  </div>

                  <a 
                    href={meme.url} target="_blank" rel="noreferrer" 
                    className="w-full bg-white text-slate-950 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-center flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors"
                  >
                    Open in Instagram <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
          
          {displayData.length === 0 && !loading && (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center text-slate-700">
              <Instagram size={48} className="mb-4 opacity-20" />
              <p className="font-black text-[11px] uppercase tracking-[0.3em] opacity-40">No intelligence found in current sector</p>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #10b981; border-radius: 10px; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        img { user-select: none; -webkit-user-drag: none; }
      `}</style>
    </div>
  );
};

export default App;