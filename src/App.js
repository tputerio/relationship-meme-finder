import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, onSnapshot, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { 
  Heart, RefreshCw, AlertCircle, Loader2, 
  PlusCircle, Trash2, Settings2, 
  ChevronLeft, Instagram, Lock, Unlock 
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

// CHANGE THIS TO YOUR DESIRED PASSWORD
const ACCESS_PASSWORD = "timiscool"; 
const COST_PER_1000 = 1.70;

const App = () => {
  const [user, setUser] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [apifyToken, setApifyToken] = useState(null);
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [newAccount, setNewAccount] = useState("");

  const [sessionSpend, setSessionSpend] = useState(0);
  const [resultsPerAccount, setResultsPerAccount] = useState(5);
  const [timeValue, setTimeValue] = useState(1);
  const [timeUnit, setTimeUnit] = useState('months');
  const [activeUsernames, setActiveUsernames] = useState([]);
  const [accountLibrary, setAccountLibrary] = useState([]);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Fetch Secret Apify Token from DB once unlocked
  const unlockApp = async (e) => {
    e.preventDefault();
    if (passwordInput === ACCESS_PASSWORD) {
      try {
        const secretSnap = await getDoc(doc(db, 'secrets', 'apify'));
        if (secretSnap.exists()) {
          setApifyToken(secretSnap.data().token);
          setIsUnlocked(true);
        } else {
          setError("Secret token not found in database.");
        }
      } catch (err) {
        setError("Database permission denied.");
      }
    } else {
      alert("Incorrect Password");
    }
  };

  useEffect(() => {
    if (!user) return;
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
        setDoc(docRef, {
          sessionSpend: 0, resultsPerAccount: 5, timeValue: 1, timeUnit: 'months',
          activeUsernames: ["Girlyzar"],
          accountLibrary: ["Girlyzar", "Drunkbetch", "Mytherapistsays"]
        });
      }
    });
    return () => unsub();
  }, [user]);

  const updateCloud = async (newData) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config'), newData);
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

  const fetchDataset = async (id) => {
    try {
      const res = await fetch(`https://api.apify.com/v2/datasets/${id}/items?token=${apifyToken}`);
      const items = await res.json();
      const now = new Date();
      let cutoff = new Date();
      if (timeUnit === 'days') cutoff.setDate(now.getDate() - timeValue);
      else if (timeUnit === 'weeks') cutoff.setDate(now.getDate() - (timeValue * 7));
      else if (timeUnit === 'months') cutoff.setMonth(now.getMonth() - timeValue);

      const sorted = items
        .filter(i => new Date(i.timestamp) >= cutoff)
        .sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0));

      updateCloud({ sessionSpend: sessionSpend + ((items.length / 1000) * COST_PER_1000) });
      setData(sorted);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError("Failed to fetch results.");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  if (!isUnlocked) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={unlockApp} className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] w-full max-w-sm text-center shadow-2xl">
          <div className="bg-emerald-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="text-emerald-500" size={28} />
          </div>
          <h2 className="text-white font-black text-xl uppercase tracking-tighter mb-2 italic">Access Restricted</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-8">Verification Required</p>
          <input 
            type="password" 
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="Enter Password"
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center text-white outline-none focus:border-emerald-500 mb-4 font-black"
          />
          <button type="submit" className="w-full bg-emerald-500 text-slate-950 font-black py-4 rounded-2xl hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">
            Unlock Interface
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden animate-in fade-in duration-700">
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-30 overflow-hidden`}>
        <div className="flex flex-col h-full w-80">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="text-emerald-500" size={20} />
              <h2 className="font-black text-xs uppercase tracking-widest">Targeting</h2>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="text-slate-500 hover:text-white"><ChevronLeft size={20} /></button>
          </div>

          <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
            <section>
              <label className="text-[10px] font-black text-slate-500 uppercase mb-4 block">User Library</label>
              <form onSubmit={(e) => {
                e.preventDefault();
                const clean = newAccount.replace('@', '').trim();
                if (clean) {
                  updateCloud({ accountLibrary: [...accountLibrary, clean], activeUsernames: [...activeUsernames, clean] });
                  setNewAccount("");
                }
              }} className="flex gap-2 mb-4">
                <input type="text" value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="Add @user..." className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs flex-1 outline-none" />
                <button type="submit" className="text-emerald-500"><PlusCircle size={22} /></button>
              </form>
              <div className="space-y-1 bg-slate-950/30 rounded-2xl p-1 border border-slate-800/50">
                {accountLibrary.map(u => (
                  <div key={u} className={`flex items-center justify-between p-2 rounded-xl ${activeUsernames.includes(u) ? 'bg-slate-800/40' : 'opacity-30'}`}>
                    <button onClick={() => updateCloud({ activeUsernames: activeUsernames.includes(u) ? activeUsernames.filter(x => x !== u) : [...activeUsernames, u] })} className="text-[11px] font-bold">@{u}</button>
                    <button onClick={() => updateCloud({ accountLibrary: accountLibrary.filter(x => x !== u), activeUsernames: activeUsernames.filter(x => x !== u) })} className="text-slate-600 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </section>
            
            <section className="space-y-6 pt-6 border-t border-slate-800">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block">Posts per Account</label>
                <input type="number" value={resultsPerAccount} onChange={(e) => updateCloud({ resultsPerAccount: parseInt(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-full font-black text-xl outline-none" />
              </div>
              <div className="flex justify-between items-end">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Lifetime Cost</span>
                 <span className="text-sm font-black text-white italic">${sessionSpend.toFixed(3)}</span>
              </div>
            </section>
          </div>

          <div className="p-6 border-t border-slate-800">
            <button onClick={fetchMemes} disabled={loading} className="w-full bg-emerald-500 text-slate-950 py-5 rounded-2xl font-black transition-all flex items-center justify-center gap-3">
              {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
              {loading ? "SCANNING..." : "START SCAN"}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen">
        <nav className="h-20 border-b border-slate-900 px-8 flex items-center justify-between bg-slate-950/80 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="bg-slate-900 p-2 rounded-xl"><Settings2 size={20} /></button>}
            <div className="bg-emerald-500 p-2 rounded-xl"><Heart className="text-white fill-white" size={18} /></div>
            <h1 className="text-xl font-black text-white uppercase italic tracking-tighter">Relationship Meme Finder</h1>
          </div>
          <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Linked & Secured <Unlock size={10} className="inline ml-1 mb-0.5" /></div>
        </nav>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {error && <div className="mb-8 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest"><AlertCircle size={18} />{error}</div>}
          {status && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-4 rounded-2xl flex items-center gap-4 mb-8 animate-pulse text-[10px] font-black uppercase tracking-widest"><Loader2 className="animate-spin" size={16} />{status}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 pb-20">
            {data.map((meme, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden flex flex-col">
                <div className="p-4 flex justify-between items-center border-b border-slate-800/50">
                  <span className="font-black text-[10px] text-emerald-500 uppercase tracking-tight">@{meme.ownerUsername}</span>
                  <span className="text-[9px] font-black text-slate-500 italic">#{idx+1}</span>
                </div>
                <div className="aspect-square bg-black">
                  <img src={`https://images.weserv.nl/?url=${encodeURIComponent(meme.displayUrl)}&w=600&h=600&fit=cover`} alt="Meme" className="w-full h-full object-cover" />
                </div>
                <div className="p-5">
                  <div className="flex-1 bg-slate-950 p-2 rounded-xl text-center border border-slate-800 mb-4">
                    <div className="text-[8px] font-bold text-slate-500 uppercase mb-0.5">Likes</div>
                    <div className="text-lg font-black text-white">{(meme.likesCount || 0).toLocaleString()}</div>
                  </div>
                  <a href={meme.url} target="_blank" rel="noreferrer" className="block text-center bg-emerald-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">View Post</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #10b981; border-radius: 10px; }`}</style>
    </div>
  );
};

export default App;