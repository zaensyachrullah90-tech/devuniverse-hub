import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getDatabase, 
  ref, 
  onValue, 
  push, 
  set, 
  remove 
} from 'firebase/database';
import { 
  Plus, 
  Trash2, 
  ExternalLink, 
  MessageSquare, 
  Search, 
  Globe, 
  ShieldCheck, 
  BrainCircuit, 
  Loader2,
  AlertTriangle,
  Cpu
} from 'lucide-react';

// ==========================================
// KONFIGURASI AMAN (ENVIRONMENT VARIABLES)
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const appId = 'dev-universe-hub';

// Inisialisasi hanya jika ada URL Database (mencegah crash di preview jika kosong)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app); 

export default function App() {
  const [user, setUser] = useState(null);
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Autentikasi Anonim
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Data dari REALTIME DATABASE
  useEffect(() => {
    if (!user) return; 

    const linksRef = ref(db, `artifacts/${appId}/users/${user.uid}/links`);
    
    const unsubscribe = onValue(linksRef, (snapshot) => {
      const data = snapshot.val();
      const fetchedLinks = [];
      
      if (data) {
        for (const id in data) {
          fetchedLinks.push({ id, ...data[id] });
        }
      }
      
      fetchedLinks.sort((a, b) => b.createdAt - a.createdAt);
      setLinks(fetchedLinks);
      setIsLoading(false);
    }, (error) => {
      console.error("Database Error:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // ==========================================
  // ARSITEKTUR AI BERLAPIS (DUAL ENGINE)
  // ==========================================

  // LAYER 1: OpenAI (ChatGPT) - Spesialis Copywriting & Deskripsi
  const fetchOpenAILayer = async (url) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI Key Missing");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${apiKey}` 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Model cepat dan murah
        messages: [
          { 
            role: "system", 
            content: "You are an expert app analyzer. Return ONLY JSON with keys 'title' (short app name) and 'description' (1 professional sentence explaining the app function) based on the URL provided." 
          },
          { role: "user", content: `Analyze this URL: ${url}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  };

  // LAYER 2: Gemini - Spesialis Kategorisasi & Analisa Teknologi
  const fetchGeminiLayer = async (url) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini Key Missing");
    
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const prompt = `Analyze this URL: ${url}. Return ONLY a raw JSON object with exactly two keys: 'category' (e.g., SaaS, E-Commerce, Tool, Dashboard) and 'techStack' (guess the main framework/language used, or write 'Web App' if unsure).`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  };

  // HELPER: Ekstrak Favicon
  const isValidUrl = (string) => { try { new URL(string); return true; } catch (_) { return false; } };
  const getFavicon = (url) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=128`; } catch { return "https://cdn-icons-png.flaticon.com/512/1243/1243420.png"; } };

  // ==========================================
  // EKSEKUSI PEMROSESAN PARALEL
  // ==========================================
  const handleAddLink = async () => {
    if (!user) return;
    setErrorMsg('');
    if (!isValidUrl(urlInput)) return setErrorMsg('Format URL tidak valid (Gunakan https://).');

    setIsProcessing(true);
    try {
      const iconUrl = getFavicon(urlInput);

      // Jalankan ChatGPT dan Gemini secara BERSAMAAN (Paralel) agar 2x lebih cepat!
      const [openAiData, geminiData] = await Promise.all([
        fetchOpenAILayer(urlInput).catch(e => {
          console.warn("OpenAI Failed", e);
          return { title: "Untitled App", description: "Deskripsi gagal dianalisa AI." };
        }),
        fetchGeminiLayer(urlInput).catch(e => {
          console.warn("Gemini Failed", e);
          return { category: "Uncategorized", techStack: "Unknown" };
        })
      ]);

      // Gabungkan hasil dari kedua AI
      const newLinkDoc = {
        url: urlInput,
        chatLink: chatInput || null,
        title: openAiData.title,
        description: openAiData.description,
        category: geminiData.category,
        techStack: geminiData.techStack, // Info tambahan dari Gemini!
        icon: iconUrl,
        createdAt: Date.now()
      };

      // Simpan ke Realtime Database
      const linksListRef = ref(db, `artifacts/${appId}/users/${user.uid}/links`);
      const newLinkRef = push(linksListRef);
      await set(newLinkRef, newLinkDoc);

      setUrlInput(''); setChatInput(''); setIsModalOpen(false);
    } catch (err) {
      setErrorMsg('Gagal menyatukan data AI dan Database.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Hapus Data
  const handleDelete = async (id) => {
    if (!user) return;
    try {
      const linkRef = ref(db, `artifacts/${appId}/users/${user.uid}/links/${id}`);
      await remove(linkRef);
    } catch (err) {
      console.error("Gagal menghapus", err);
    }
  };

  // Filter Search
  const filteredLinks = useMemo(() => links.filter(link => 
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      link.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (link.techStack && link.techStack.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [links, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      
      <nav className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Globe className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">DevUniverse</h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Cpu className="w-3 h-3 text-emerald-400" /> Dual AI Engine (OpenAI + Gemini)
              </p>
            </div>
          </div>
          
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg active:scale-95">
            <Plus className="w-5 h-5" /> Deploy Link
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row gap-6 justify-between items-center mb-10">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Cari aplikasi atau teknologi..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 focus:border-indigo-500 rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all placeholder:text-slate-600"
            />
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-6 py-3 flex-1 md:flex-none text-center">
            <span className="text-slate-400 text-sm block">Total Active Apps</span>
            <span className="text-2xl font-bold text-indigo-400">{links.length}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-500">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
            <p>Mendekripsi data dari Realtime Database...</p>
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
            <Globe className="w-16 h-16 mb-4 text-slate-700" />
            <h3 className="text-xl font-bold text-slate-300">Belum Ada Aplikasi</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLinks.map((link) => (
              <div key={link.id} className="group bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl flex flex-col">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-14 h-14 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden">
                    <img src={link.icon} className="w-8 h-8 object-contain" onError={(e) => { e.target.src = "https://cdn-icons-png.flaticon.com/512/1243/1243420.png" }} />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-slate-800 text-slate-300 text-xs font-bold rounded-full border border-slate-700 uppercase tracking-wide">
                        {link.category}
                      </span>
                      <button onClick={() => handleDelete(link.id)} className="w-8 h-8 rounded-full bg-slate-800/50 text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Tambahan Info Tech Stack dari Gemini */}
                    {link.techStack && (
                      <span className="text-[10px] text-indigo-400 font-medium">⚙️ {link.techStack}</span>
                    )}
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-slate-100 mb-2 line-clamp-1">{link.title}</h3>
                <p className="text-slate-400 text-sm mb-6 flex-grow line-clamp-2 leading-relaxed">{link.description}</p>
                
                <div className="grid grid-cols-12 gap-3 mt-auto">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="col-span-9 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition text-sm border border-white/5">
                    Buka Aplikasi <ExternalLink className="w-4 h-4" />
                  </a>
                  {link.chatLink ? (
                    <a href={link.chatLink} target="_blank" rel="noopener noreferrer" className="col-span-3 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white flex items-center justify-center rounded-xl transition border border-indigo-500/20">
                      <BrainCircuit className="w-5 h-5" />
                    </a>
                  ) : (
                    <div className="col-span-3 bg-slate-800/30 text-slate-600 flex items-center justify-center rounded-xl border border-slate-800">
                       <MessageSquare className="w-5 h-5" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-8">
              <h2 className="text-2xl font-bold mb-2">Deploy Aplikasi Baru</h2>
              <p className="text-slate-400 text-sm mb-6">OpenAI & Gemini akan bekerja sama menganalisa link ini.</p>
              {errorMsg && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-3 text-sm"><AlertTriangle className="w-5 h-5" /> {errorMsg}</div>}
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">URL Aplikasi (Wajib)</label>
                  <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://..." className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3.5 outline-none text-slate-200" disabled={isProcessing} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2 flex justify-between">
                    <span>Link Chat AI (Opsional)</span>
                  </label>
                  <input type="url" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="https://chatgpt.com/... atau gemini..." className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3.5 outline-none text-slate-200" disabled={isProcessing} />
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-slate-950 border-t border-slate-800 flex gap-3">
              <button onClick={() => { setIsModalOpen(false); setErrorMsg(''); }} className="px-6 py-3.5 rounded-xl font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all flex-1" disabled={isProcessing}>Batal</button>
              <button onClick={handleAddLink} disabled={isProcessing || !urlInput} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3.5 rounded-xl font-bold flex-[2] flex items-center justify-center gap-2 disabled:opacity-50">
                {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /> Menyatukan Kekuatan AI...</> : <><Cpu className="w-5 h-5" /> Mulai Analisa</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}