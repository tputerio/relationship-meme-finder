import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs, deleteDoc, where } from "firebase/firestore";
import { 
  Heart, RefreshCw, AlertCircle, Loader2, 
  PlusCircle, Trash2, Settings2, 
  ChevronLeft, Instagram, Lock, Unlock, Calendar,
  ThumbsUp, ThumbsDown
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

const COST_PER_1000 = 1.70;

const App = () => {
  const [user, setUser] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [apifyToken, setApifyToken] = useState(null);
  
  const [data, setData] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastScrapedMap, setLastScrapedMap] = useState({});
  const [historyFilter, setHistoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('results');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [newAccount, setNewAccount] = useState("");
  const [historyLastDoc, setHistoryLastDoc] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const [sessionSpend, setSessionSpend] = useState(0);
  const [resultsPerAccount, setResultsPerAccount] = useState(5);
  const [resultsPerAccountInput, setResultsPerAccountInput] = useState('5');
  const [timeValue, setTimeValue] = useState(1);
  const [timeValueInput, setTimeValueInput] = useState('1');
  const [timeUnit, setTimeUnit] = useState('months');
  const [activeUsernames, setActiveUsernames] = useState([]);
  const [accountLibrary, setAccountLibrary] = useState([]);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const storedToken = localStorage.getItem('rmf-apify-token');
    if (storedToken) {
      setApifyToken(storedToken);
      setIsUnlocked(true);
    }
  }, [user]);

  const unlockApp = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      setLoading(true);
      const secretSnap = await getDoc(doc(db, 'secrets', 'apify'));
      if (secretSnap.exists()) {
        const remotePassword = secretSnap.data().password;
        const token = secretSnap.data().token;
        if (passwordInput === remotePassword) {
          setApifyToken(token);
          setIsUnlocked(true);
          localStorage.setItem('rmf-apify-token', token);
          setError(null);
        } else {
          alert("Incorrect Password");
        }
      } else {
        setError("Security configuration missing.");
      }
    } catch (err) {
      setError("Access denied.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'settings', 'config');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setSessionSpend(d.sessionSpend || 0);
        const resultsValue = d.resultsPerAccount ?? 5;
        setResultsPerAccount(resultsValue);
        setResultsPerAccountInput(String(resultsValue));
        const lookbackValue = d.timeValue ?? 1;
        setTimeValue(lookbackValue);
        setTimeValueInput(String(lookbackValue));
        setTimeUnit(d.timeUnit || 'months');
        setActiveUsernames(d.activeUsernames || []);
        setAccountLibrary(d.accountLibrary || []);
        setLastScrapedMap(d.lastScrapedMap || {});
      } else {
        setDoc(docRef, {
          sessionSpend: 0,
          resultsPerAccount: 5,
          timeValue: 1,
          timeUnit: 'months',
          activeUsernames: ["Girlyzar"],
          accountLibrary: ["Girlyzar", "Drunkbetch", "Mytherapistsays"],
          lastScrapedMap: {}
        });
      }
    }, (err) => console.error("Firestore Error:", err));
    return () => unsub();
  }, [user]);

  const updateCloud = async (newData) => {
    if (!user) return;
    const configRef = doc(db, 'artifacts', appId, 'settings', 'config');
    await setDoc(configRef, newData, { merge: true });
  };

  const loadHistory = async (loadMore = false) => {
    if (!user || historyLoading) return;
    setHistoryLoading(true);
    try {
      const historyRef = collection(db, 'artifacts', appId, 'settings', 'config', 'history');
      let q = query(historyRef, orderBy('likesCount', 'desc'), limit(50));
      if (loadMore && historyLastDoc) {
        q = query(historyRef, orderBy('likesCount', 'desc'), limit(50), startAfter(historyLastDoc));
      }

      const querySnapshot = await getDocs(q);
      const newItems = [];
      querySnapshot.forEach((doc) => {
        newItems.push({ id: doc.id, ...doc.data() });
      });

      // Cleanup old downvoted items
      const now = Date.now();
      const cutoff = now - 24 * 60 * 60 * 1000; // 24 hours ago
      const toDelete = newItems.filter(item => item.vote === 'down' && item.downvotedAt && item.downvotedAt < cutoff);
      for (const item of toDelete) {
        await deleteDoc(doc(historyRef, item.id));
      }
      const filteredItems = newItems.filter(item => !(item.vote === 'down' && item.downvotedAt && item.downvotedAt < cutoff));

      if (loadMore) {
        setHistory(prev => [...prev, ...filteredItems]);
      } else {
        setHistory(filteredItems);
      }
      setHistoryLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMoreHistory(querySnapshot.docs.length === 50);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'history') {
      loadHistory();
    }
  }, [user, activeTab]);

  const setResultsPerAccountAndSave = async (value) => {
    setResultsPerAccount(value);
    setResultsPerAccountInput(String(value));
    await updateCloud({ resultsPerAccount: value });
  };

  const setTimeValueAndSave = async (value) => {
    setTimeValue(value);
    setTimeValueInput(String(value));
    await updateCloud({ timeValue: value });
  };

  const fetchMemes = async () => {
    if (!apifyToken || activeUsernames.length === 0) return;
    setLoading(true);
    setError(null);
    setStatus("Scanning Instagram...");

    try {
      const response = await fetch(`https://api.apify.com/v2/acts/apify~instagram-post-scraper/runs?token=${apifyToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          "username": activeUsernames,
          "resultsLimit": parseInt(resultsPerAccount),
          "skipPinnedPosts": true,
          "proxyConfiguration": { "useApifyProxy": true }
        })
      });
      const run = await response.json();
      pollStatus(run.data.id, run.data.defaultDatasetId);
    } catch (err) {
      setError("Scraper failed to start.");
      setLoading(false);
    }
  };

  const pollStatus = (runId, datasetId) => {
    const timer = setInterval(async () => {
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);
      const result = await res.json();
      if (result.data.status === 'SUCCEEDED') {
        clearInterval(timer);
        fetchDataset(datasetId);
      } else if (['FAILED', 'ABORTED'].includes(result.data.status)) {
        clearInterval(timer);
        setLoading(false);
        setError("Cloud scan failed.");
      }
    }, 3000);
  };

  const isVideoItem = (item) => {
    if (!item) return false;
    const type = String(item.type || '').toLowerCase();
    const postType = String(item.postType || '').toLowerCase();
    const mediaType = String(item.mediaType || '').toLowerCase();
    return item.isVideo === true
      || type.includes('video')
      || postType.includes('video')
      || mediaType.includes('video')
      || Boolean(item.videoUrl)
      || Boolean(item.videoUrls)
      || Boolean(item.hasOwnProperty('is_video') && item.is_video);
  };

  const shouldKeepPost = (item) => {
    if (!item || isVideoItem(item)) return false;
    const itemType = String(item.postType || item.type || item.mediaType || '').toLowerCase();
    const isCarousel = itemType.includes('carousel');
    const isImage = itemType.includes('image') || itemType.includes('photo') || itemType.includes('post');
    return isCarousel || isImage || Boolean(item.displayUrl) || Boolean(item.url);
  };

  const getItemKey = (item) => btoa(String(item.url || item.id || item._id || `${item.ownerUsername}-${item.timestamp}`));

  const mergeHistory = async (newItems) => {
    if (!user) return;
    const historyRef = collection(db, 'artifacts', appId, 'settings', 'config', 'history');
    const batch = [];
    for (const item of newItems) {
      const key = getItemKey(item);
      const itemRef = doc(historyRef, key);
      batch.push(setDoc(itemRef, { ...item, vote: item.vote || 'none' }, { merge: true }));
    }
    await Promise.all(batch);
    // Reload history after merge
    await loadHistory();
  };

  const applyVote = async (item, vote) => {
    if (!user) return;
    const key = getItemKey(item);
    const historyRef = collection(db, 'artifacts', appId, 'settings', 'config', 'history');
    const itemRef = doc(historyRef, key);
    const updateData = { vote };
    if (vote === 'down') {
      updateData.downvotedAt = Date.now();
    }
    await setDoc(itemRef, updateData, { merge: true });

    // Update local state
    setData(prev => prev.map(current => getItemKey(current) === key ? { ...current, vote } : current));
    setHistory(prev => prev.map(current => getItemKey(current) === key ? { ...current, vote } : current));
  };

  const fetchDataset = async (id) => {
    try {
      const res = await fetch(`https://api.apify.com/v2/datasets/${id}/items?token=${apifyToken}`);
      const items = await res.json();
      const now = new Date();
      let cutoff = new Date();
      if (timeUnit === 'days') cutoff.setDate(now.getDate() - timeValue);
      else if (timeUnit === 'weeks') cutoff.setDate(now.getDate() - (timeValue * 7));
      else if (timeUnit === 'months') cutoff.setMonth(now.getMonth() - timeValue);

      const filtered = items.filter(shouldKeepPost).map(item => ({ ...item, vote: item.vote || 'none' }));
      const sorted = filtered
        .filter(i => new Date(i.timestamp) >= cutoff)
        .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));

      const actualCost = (filtered.length / 1000) * COST_PER_1000;
      const nextHistory = mergeHistory(sorted);
      const nextLastScrapedMap = { ...lastScrapedMap };
      activeUsernames.forEach((username) => {
        nextLastScrapedMap[username] = new Date().toISOString();
      });

      updateCloud({
        sessionSpend: sessionSpend + actualCost,
        lastScrapedMap: nextLastScrapedMap
      });
      setData(sorted);
      await mergeHistory(sorted);
      setLastScrapedMap(nextLastScrapedMap);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Failed to fetch results.");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const filteredHistory = history.filter((item) => {
    if (historyFilter === 'liked') return item.vote === 'up';
    if (historyFilter === 'disliked') return item.vote === 'down';
    if (historyFilter === 'unrated') return item.vote === 'none';
    return true;
  });

  if (!isUnlocked) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-6 touch-none">
        <form onSubmit={unlockApp} className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-sm text-center shadow-2xl">
          <div className="bg-emerald-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-emerald-500" size={28} />
          </div>
          <h2 className="text-white font-black text-xl uppercase tracking-tighter mb-2 italic">Access Restricted</h2>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-8">Verification Required</p>
          <input 
            type="password" 
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter Password"
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center text-white outline-none focus:border-emerald-500 mb-4 font-black text-base"
            style={{ fontSize: '16px' }} 
          />
          <button type="submit" disabled={loading} className="w-full bg-emerald-500 text-slate-950 font-black py-4 rounded-2xl hover:bg-emerald-400 active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2">
            {loading && <Loader2 className="animate-spin" size={14} />}
            {loading ? "Verifying..." : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  const estCost = (activeUsernames.length * resultsPerAccount / 1000) * COST_PER_1000;

  const activeViewData = activeTab === 'results' ? data : filteredHistory;

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:relative h-full z-50 transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden ${isSidebarOpen ? 'translate-x-0 w-[85vw] lg:w-80' : '-translate-x-full lg:translate-x-0 lg:w-0'}`}>
        <div className="flex flex-col h-full w-full">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Settings2 className="text-emerald-500" size={20} />
              <h2 className="font-black text-xs uppercase tracking-widest">Settings</h2>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-500 p-2"><ChevronLeft size={24} /></button>
          </div>

          <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
            <section>
              <label className="text-[10px] font-black text-slate-500 uppercase mb-4 block tracking-widest">User Library</label>
              <form onSubmit={(e) => {
                e.preventDefault();
                const clean = newAccount.replace('@', '').trim();
                if (clean) {
                  updateCloud({ 
                    accountLibrary: Array.from(new Set([...accountLibrary, clean])), 
                    activeUsernames: [...activeUsernames, clean] 
                  });
                  setNewAccount("");
                }
              }} className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={newAccount} 
                  onChange={(e) => setNewAccount(e.target.value)} 
                  placeholder="Add @user..." 
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm flex-1 outline-none focus:border-emerald-500" 
                  style={{ fontSize: '16px' }}
                />
                <button type="submit" className="text-emerald-500 p-1 active:scale-90 transition-transform"><PlusCircle size={24} /></button>
              </form>
              <div className="space-y-1.5 bg-slate-950/30 rounded-2xl p-2 border border-slate-800/50">
                {accountLibrary.map(u => {
                  const isActive = activeUsernames.includes(u);
                  const lastScrapedLabel = lastScrapedMap[u] ? new Date(lastScrapedMap[u]).toLocaleString() : 'Never';
                  return (
                    <div key={u} className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${isActive ? 'bg-slate-800/60' : 'opacity-40 grayscale'}`}>
                      <button 
                        onClick={() => updateCloud({ activeUsernames: isActive ? activeUsernames.filter(x => x !== u) : [...activeUsernames, u] })} 
                        className="flex flex-col gap-2 flex-1 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-600'}`} />
                          <span className="text-[11px] font-bold tracking-tight">@{u}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest">Last scraped: {lastScrapedLabel}</span>
                      </button>
                      <button onClick={() => updateCloud({ accountLibrary: accountLibrary.filter(x => x !== u), activeUsernames: activeUsernames.filter(x => x !== u) })} className="text-slate-600 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                    </div>
                  );
                })}
              </div>
            </section>
            
            <section className="space-y-6 pt-6 border-t border-slate-800">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-3 block tracking-widest">Lookback Window</label>
                <div className="flex gap-2 mb-3">
                  <input 
                    type="number" 
                    value={timeValueInput} 
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setTimeValueInput(nextValue);
                      const parsed = parseInt(nextValue, 10);
                      if (!Number.isNaN(parsed) && parsed > 0) {
                        setTimeValue(parsed);
                      }
                    }}
                    onBlur={() => {
                      const parsed = parseInt(timeValueInput, 10);
                      const valid = !Number.isNaN(parsed) && parsed > 0 ? parsed : 1;
                      setTimeValueAndSave(valid);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-1/3 font-black text-lg outline-none text-center" 
                    style={{ fontSize: '16px' }}
                  />
                  <select 
                    value={timeUnit} 
                    onChange={(e) => updateCloud({ timeUnit: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex-1 font-black text-xs uppercase tracking-widest outline-none"
                    style={{ fontSize: '16px' }}
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-3 block tracking-widest">Posts per Account</label>
                <input 
                  type="number" 
                  inputMode="numeric"
                  value={resultsPerAccountInput} 
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setResultsPerAccountInput(nextValue);
                    const parsed = parseInt(nextValue, 10);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                      setResultsPerAccount(parsed);
                    }
                  }}
                  onBlur={() => {
                    const parsed = parseInt(resultsPerAccountInput, 10);
                    const valid = !Number.isNaN(parsed) && parsed > 0 ? parsed : 5;
                    setResultsPerAccountAndSave(valid);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-full font-black text-xl outline-none focus:border-emerald-500" 
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                   <span>Est. Scan Cost</span>
                   <span className="text-emerald-500 italic">${estCost.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                   <span>Lifetime Cost</span>
                   <span className="text-white italic">${sessionSpend.toFixed(3)}</span>
                </div>
              </div>
            </section>
          </div>

          <div className="p-6 border-t border-slate-800 shrink-0">
            <button 
              onClick={fetchMemes} 
              disabled={loading || activeUsernames.length === 0} 
              className="w-full bg-emerald-500 text-slate-950 py-4 lg:py-5 rounded-2xl font-black transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 mb-4"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
              <span className="tracking-widest text-xs uppercase">{loading ? "SCANNING..." : "START SCAN"}</span>
            </button>
            {/* TEMPORARY CODE: Button to fetch from existing run */}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <nav className="border-b border-slate-900 px-4 lg:px-8 bg-slate-950/80 backdrop-blur-xl shrink-0">
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="bg-slate-900 p-2 rounded-xl lg:hidden"><Settings2 size={20} /></button>
                <div className="bg-emerald-500 p-2 rounded-xl shrink-0"><Heart className="text-white fill-white" size={16} /></div>
                <h1 className="text-base lg:text-xl font-black text-white uppercase italic tracking-tighter truncate">Relationship Meme Finder</h1>
              </div>
              <div className="hidden sm:flex text-[9px] font-black text-slate-500 uppercase tracking-widest items-center gap-2">
                SECURE LINK <Unlock size={10} className="text-emerald-500" />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-900 border border-slate-800 p-2">
                <button onClick={() => setActiveTab('results')} className={`px-4 py-2 rounded-2xl font-black uppercase text-[10px] tracking-widest ${activeTab === 'results' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}>Recent</button>
                <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-2xl font-black uppercase text-[10px] tracking-widest ${activeTab === 'history' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}>History</button>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500">
                {activeTab === 'history' ? `${filteredHistory.length} memes in ${historyFilter}` : `Last updated: ${lastUpdated || 'Not yet scanned'}`}
              </div>
            </div>
            {activeTab === 'history' && (
              <div className="mt-4 flex flex-wrap gap-2">
                {['all', 'liked', 'disliked', 'unrated'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    className={`px-3 py-2 text-[9px] font-black uppercase tracking-widest rounded-2xl border transition-all ${historyFilter === filter ? 'bg-emerald-500 text-slate-950 border-emerald-500' : 'text-slate-400 border-slate-700 hover:text-white hover:border-slate-500'}`}>
                    {filter === 'all' ? 'All' : filter === 'liked' ? 'Liked' : filter === 'disliked' ? 'Disliked' : 'Unrated'}
                  </button>
                ))}
              </div>
            )}
            {activeTab === 'history' && hasMoreHistory && (
              <div className="mt-4">
                <button
                  onClick={() => loadHistory(true)}
                  disabled={historyLoading}
                  className="px-4 py-2 bg-slate-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-600 disabled:opacity-50">
                  {historyLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
          {error && <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest"><AlertCircle size={16} />{error}</div>}
          {status && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-2xl flex items-center gap-4 mb-6 animate-pulse text-[10px] font-black uppercase tracking-widest"><Loader2 className="animate-spin" size={16} />{status}</div>}

          {activeViewData.length === 0 && !loading && !status && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
              <Instagram size={64} className="mb-4" />
              <p className="font-black text-xs uppercase tracking-[0.2em]">Ready to analyze target feeds</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 lg:gap-8 pb-20">
            {activeViewData.map((meme, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden flex flex-col group hover:border-emerald-500/50 transition-all shadow-xl">
                <div className="p-4 flex justify-between items-center border-b border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    <span className="font-black text-[10px] text-white uppercase tracking-tight">@{meme.ownerUsername}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-600 italic">
                    {meme.timestamp && (() => {
                      const date = new Date(meme.timestamp);
                      if (!Number.isNaN(date.getTime())) {
                        return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      }
                      return '';
                    })()}
                  </span>
                </div>
                <div className="aspect-square bg-black overflow-hidden">
                  <img 
                    src={`https://images.weserv.nl/?url=${encodeURIComponent(meme.displayUrl)}&w=600&h=600&fit=cover`} 
                    alt="Meme" 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                    loading="lazy"
                  />
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1 bg-slate-950 p-2.5 rounded-2xl text-center border border-slate-800">
                      <div className="text-[8px] font-bold text-slate-600 uppercase mb-0.5 tracking-widest">Likes</div>
                      <div className="text-base font-black text-white italic">{(meme.likesCount || 0).toLocaleString()}</div>
                    </div>
                    <div className="flex-1 bg-slate-950 p-2.5 rounded-2xl text-center border border-slate-800">
                      <div className="text-[8px] font-bold text-slate-600 uppercase mb-0.5 tracking-widest">Comments</div>
                      <div className="text-base font-black text-white italic">{(meme.commentsCount || 0).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => applyVote(meme, meme.vote === 'up' ? 'none' : 'up')}
                      className={`flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${meme.vote === 'up' ? 'bg-emerald-500 text-slate-950 border-emerald-500' : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500 hover:text-white'}`}
                    >
                      <ThumbsUp size={16} /> {meme.vote === 'up' ? 'Liked' : 'Like'}
                    </button>
                    <button
                      onClick={() => applyVote(meme, meme.vote === 'down' ? 'none' : 'down')}
                      className={`flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${meme.vote === 'down' ? 'bg-red-500 text-slate-950 border-red-500' : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-red-500 hover:text-white'}`}
                    >
                      <ThumbsDown size={16} /> {meme.vote === 'down' ? 'Disliked' : 'Dislike'}
                    </button>
                  </div>
                  <a href={meme.url} target="_blank" rel="noreferrer" className="block text-center bg-white text-slate-950 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">Open Instagram</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #10b981; border-radius: 10px; }
        input[type="number"]::-webkit-inner-spin-button, 
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        @media (max-width: 1024px) {
          input, select, textarea { font-size: 16px !important; }
        }
      `}</style>
    </div>
  );
};

export default App;