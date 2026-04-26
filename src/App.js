import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { 
  Heart, RefreshCw, AlertCircle, Loader2, 
  PlusCircle, Trash2, Settings2, 
  ChevronLeft, Instagram 
} from 'lucide-react';

// --- CONFIGURATION ---
// REPLACE THESE WITH YOUR ACTUAL KEYS FROM FIREBASE CONSOLE
// You can find these in Project Settings > Your Apps > Web App
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase services safely
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "relationship-meme-finder";

// Apify constants
const APIFY_TOKEN = "apify_api_qcw3FBbnFAXebdhuXBs4I6rp6sPn8N19fLH4";
const COST_PER_1000 = 1.70;

const App = () => {
  const [user, setUser] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [newAccount, setNewAccount] = useState("");

  // Cloud-synced state
  const [sessionSpend, setSessionSpend] = useState(0);
  const [resultsPerAccount, setResultsPerAccount] = useState(5);
  const [timeValue, setTimeValue] = useState(1);
  const [timeUnit, setTimeUnit] = useState('months');
  const [activeUsernames, setActiveUsernames] = useState([]);
  const [accountLibrary, setAccountLibrary] = useState([]);

  // 1. Authentication Layer
  useEffect(() => {
    const initAuth = async () => {
      try {
        // We use anonymous auth so users don't have to log in manually, 
        // but their data is still private to their device/session.
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
        setError("Firebase Configuration Missing. Please add your API keys to the code.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore Sync
  useEffect(() => {
    if (!user) return;

    // This path is structured to work with standard Firebase Security Rules
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');

    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setSessionSpend(d.sessionSpend || 0);
        setResultsPerAccount(d.resultsPerAccount || 5);
        setTimeValue(d.timeValue || 1);
        setTimeUnit(d.timeUnit || 'months');
        setActiveUsernames(d.activeUsernames || []);
        setAccountLibrary(d.accountLibrary || []);
      } else {
        // Initial setup for new users
        setDoc(docRef, {
          sessionSpend: 0,
          resultsPerAccount: 5,
          timeValue: 1,
          timeUnit: 'months',
          activeUsernames: ["Girlyzar"],
          accountLibrary: ["Girlyzar", "Drunkbetch", "Mytherapistsays", "Couplesofsociety"]
        });
      }
    }, (err) => {
      console.error("Firestore Error:", err);
      // If you see this error, you need to enable Firestore in your console
      setError("Database access denied. Enable Firestore in your Firebase Console.");
    });

    return () => unsub();
  }, [user]);

  const updateCloud = async (newData) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
      await updateDoc(docRef, newData);
    } catch (e) {
      console.error("Update failed:", e);
    }
  };

  const addAccountToLibrary = (e) => {
    e.preventDefault();
    const clean = newAccount.replace('@', '').trim();
    if (clean && !accountLibrary.includes(clean)) {
      updateCloud({ 
        accountLibrary: [...accountLibrary, clean],
        activeUsernames: [...activeUsernames, clean]
      });
      setNewAccount("");
    }
  };

  const toggleAccountActive = (name) => {
    const newActive = activeUsernames.includes(name) 
      ? activeUsernames.filter(u => u !== name) 
      : [...activeUsernames, name];
    updateCloud({ activeUsernames: newActive });
  };

  const removeFromLibrary = (name) => {
    updateCloud({ 
      accountLibrary: accountLibrary.filter(u => u !== name),
      activeUsernames: activeUsernames.filter(u => u !== name)
    });
  };

  const fetchMemes = async () => {
    if (activeUsernames.length === 0) return;
    setLoading(true);
    setError(null);
    setStatus("Scanning Instagram...");

    try {
      const response = await fetch(`https://api.apify.com/v2/acts/apify~instagram-post-scraper/runs?token=${APIFY_TOKEN}`, {
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
      setError("Scraper start failed.");
      setLoading(false);
    }
  };

  const pollStatus = (runId, datasetId) => {
    const timer = setInterval(async () => {
      const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const result = await res.json();
      if (result.data.status === 'SUCCEEDED') {
        clearInterval(timer);
        fetchDataset(datasetId);
      } else if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(result.data.status)) {
        clearInterval(timer);
        setLoading(false);
        setError("Scraper run failed in the cloud.");
      }
    }, 3000);
  };

  const fetchDataset = async (id) => {
    setStatus("Sorting Viral Posts...");
    try {
      const res = await fetch(`https://api.apify.com/v2/datasets/${id}/items?token=${APIFY_TOKEN}`);
      const items = await res.json();
      
      const now = new Date();
      let cutoff = new Date();
      if (timeUnit === 'days') cutoff.setDate(now.getDate() - timeValue);
      else if (timeUnit === 'weeks') cutoff.setDate(now.getDate() - (timeValue * 7));
      else if (timeUnit === 'months') cutoff.setMonth(now.getMonth() - timeValue);

      const sorted = items
        .filter(i => new Date(i.timestamp) >= cutoff)
        .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));

      const runCost = (items.length / 1000) * COST_PER_1000;
      updateCloud({ sessionSpend: sessionSpend + runCost });

      setData(sorted);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Failed to fetch results from dataset.");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-30`}>
        <div className="flex flex-col h-full w-80 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
            <div className="flex items-center gap-3">
              <Settings2 className="text-emerald-500" size={20} />
              <h2 className="font-black text-xs uppercase tracking-widest">Targeting</h2>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="text-slate-500 hover:text-white transition-colors">
              <ChevronLeft size={20} />
            </button>
          </div>

          <div className="p-6 space-y-8 flex-1">
            {/* Library Section */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">User Library</label>
                <span className="text-[10px] font-bold text-emerald-500 tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {activeUsernames.length} ACTIVE
                </span>
              </div>
              
              <form onSubmit={addAccountToLibrary} className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  placeholder="Add @username..."
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs flex-1 focus:border-emerald-500 outline-none"
                />
                <button type="submit" className="text-emerald-500 hover:scale-110 transition-transform">
                  <PlusCircle size={22} />
                </button>
              </form>

              <div className="space-y-1 max-h-64 overflow-y-auto border border-slate-800/50 rounded-2xl p-1 bg-slate-950/30">
                {accountLibrary.map(u => {
                  const isActive = activeUsernames.includes(u);
                  return (
                    <div key={u} className={`flex items-center justify-between p-2 rounded-xl transition-all ${isActive ? 'bg-slate-800/40' : 'opacity-30 grayscale'}`}>
                      <button 
                        onClick={() => toggleAccountActive(u)}
                        className="flex items-center gap-3 flex-1 text-left"
                      >
                        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`}></div>
                        <span className="text-[11px] font-bold tracking-tight">@{u}</span>
                      </button>
                      <button 
                        onClick={() => removeFromLibrary(u)}
                        className="p-1 text-slate-600 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Config Section */}
            <div className="space-y-6 pt-6 border-t border-slate-800">
               <section>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block text-slate-400">Posts per Account</label>
                <input 
                  type="number" 
                  value={resultsPerAccount}
                  onChange={(e) => updateCloud({ resultsPerAccount: parseInt(e.target.value) })}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-full font-black text-xl outline-none focus:border-emerald-500"
                />
              </section>

              <section>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block text-slate-400">Search Window</label>
                <div className="flex bg-slate-950 border border-slate-800 rounded-xl overflow-hidden focus-within:border-emerald-500">
                  <input 
                    type="number" 
                    value={timeValue}
                    onChange={(e) => updateCloud({ timeValue: parseInt(e.target.value) })}
                    className="bg-transparent p-3 w-16 font-black text-xl border-r border-slate-800 outline-none"
                  />
                  <select 
                    value={timeUnit}
                    onChange={(e) => updateCloud({ timeUnit: e.target.value })}
                    className="bg-transparent p-3 flex-1 font-bold text-xs uppercase text-slate-400 outline-none"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </section>
              
              <div className="flex justify-between items-end pt-2">
                 <span className="text-[10px] font-black text-slate-500 uppercase">Cloud Lifetime Cost</span>
                 <span className="text-sm font-black text-white">${sessionSpend.toFixed(3)}</span>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-800 sticky bottom-0 bg-slate-900 z-10">
            <button
              onClick={fetchMemes}
              disabled={loading || activeUsernames.length === 0}
              className="w-full flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 py-5 rounded-2xl font-black transition-all shadow-xl active:scale-95"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
              {loading ? "FETCHING..." : "START SCAN"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Grid View */}
      <main className="flex-1 flex flex-col h-screen relative">
        <nav className="h-20 border-b border-slate-900 px-8 flex items-center justify-between bg-slate-950/80 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="bg-slate-900 p-2 rounded-xl text-slate-400">
                <Settings2 size={20} />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 p-2 rounded-xl shadow-lg">
                <Heart className="text-white fill-white" size={18} />
              </div>
              <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">
                Relationship Meme Finder
              </h1>
            </div>
          </div>
          <div className="hidden sm:block text-[9px] font-black text-slate-500 uppercase tracking-widest">
            Last Scan: {lastUpdated || "N/A"}
          </div>
        </nav>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {error && (
            <div className="mb-8 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle size={18} />
              <span className="text-xs font-black uppercase tracking-widest">{error}</span>
            </div>
          )}

          {status && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-2xl flex items-center gap-4 mb-8 animate-pulse max-w-sm">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">{status}</span>
            </div>
          )}

          {data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 pb-20">
              {data.map((meme, idx) => (
                <div key={meme.id || idx} className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden flex flex-col hover:border-emerald-500/50 transition-all shadow-2xl">
                  <div className="p-4 flex justify-between items-center border-b border-slate-800/50">
                    <span className="font-black text-[10px] text-emerald-500 uppercase flex items-center gap-2">
                      <Instagram size={10} /> @{meme.ownerUsername}
                    </span>
                    <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-2 py-0.5 rounded">
                      {new Date(meme.timestamp).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="aspect-square bg-black">
                    <img 
                      src={`https://images.weserv.nl/?url=${encodeURIComponent(meme.displayUrl)}&w=600&h=600&fit=cover`} 
                      alt="Viral Content"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="p-5 bg-gradient-to-b from-slate-900 to-black">
                    <div className="flex gap-2 mb-4">
                      <div className="flex-1 bg-slate-950 p-2 rounded-xl text-center border border-slate-800">
                        <div className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Likes</div>
                        <div className="text-lg font-black text-white">{(meme.likesCount || 0).toLocaleString()}</div>
                      </div>
                      <div className="flex-1 bg-slate-950 p-2 rounded-xl text-center border border-slate-800">
                        <div className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Rank</div>
                        <div className="text-lg font-black text-emerald-500">#{idx + 1}</div>
                      </div>
                    </div>
                    <a 
                      href={meme.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-center bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors shadow-lg shadow-emerald-900/20"
                    >
                      View Original Post
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading && (
            <div className="flex flex-col items-center justify-center py-40 opacity-20">
               <Heart size={80} className="text-emerald-500 mb-6" />
               <p className="font-black text-xs uppercase tracking-[0.4em]">No scans performed yet</p>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #10b981; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
