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
  Cpu,
  Info
} from 'lucide-react';

// ==========================================
// KONFIGURASI AMAN (ENVIRONMENT VARIABLES)
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const appId = 'dev-universe-hub';

// Inisialisasi Firebase
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

  // Autentikasi
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

  // Fetch Data Realtime
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

  // --- AI ENGINES ---

  const fetchOpenAILayer = async (url) => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) throw new Error("API Key OpenAI tidak ditemukan di .env");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${apiKey}` 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Kembalikan JSON: {'title': 'Nama App', 'description': '1 kalimat deskripsi'}" },
          { role: "user", content: `Analisa URL ini: ${url}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(`OpenAI Error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  };

  const fetchGeminiLayer = async (url) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key Gemini tidak ditemukan di .env");
    
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analisa URL: ${url}. Berikan JSON: {'category': 'Kategori', 'techStack': 'Teknologi'}` }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error(`Gemini Error: ${response.statusText}`);

    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  };

  const handleAddLink = async () => {
    if (!user) return;
    setErrorMsg('');
    setIsProcessing(true);

    try {
      const domain = new URL(urlInput).hostname;
      const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

      // Eksekusi Paralel dengan Error Handling Individual
      const [openAiResult, geminiResult] = await Promise.allSettled([
        fetchOpenAILayer(urlInput),
        fetchGeminiLayer(urlInput)
      ]);

      const finalData = {
        url: urlInput,
        chatLink: chatInput || null,
        title: openAiResult.status === 'fulfilled' ? openAiResult.value.title : "Untitled App",
        description: openAiResult.status === 'fulfilled' ? openAiResult.value.description : "Gagal memuat deskripsi AI.",
        category: geminiResult.status === 'fulfilled' ? geminiResult.value.category : "Uncategorized",
        techStack: geminiResult.status === 'fulfilled' ? geminiResult.value.techStack : "Web Tech",
        icon: iconUrl,
        createdAt: Date.now()
      };

      // Tampilkan error di console jika salah satu AI gagal
      if (openAiResult.status === 'rejected') console.error("OpenAI Failed:", openAiResult.reason);
      if (geminiResult.status === 'rejected') console.error("Gemini Failed:", geminiResult.reason);

      const linksListRef = ref(db, `artifacts/${appId}/users/${user.uid}/links`);
      await set(push(linksListRef), finalData);

      setUrlInput(''); setChatInput(''); setIsModalOpen(false);
    } catch (err) {
      setErrorMsg(`Error: ${err.message}. Pastikan URL benar dan API Key aktif.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id) => {
    if (!user) return;
    try { await remove(ref(db, `artifacts/${appId}/users/${user.uid}/links/${id}`)); } catch (e) {}
  };

  const filteredLinks = useMemo(() => links.filter(link => 
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      link.category.toLowerCase().includes(searchQuery.toLowerCase())
  ), [links, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <nav className="border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Globe className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">DevUniverse</h1>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all">
            <Plus className="w-5 h-5 inline mr-1" /> Deploy Link
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row gap-6 justify-between items-center mb-10">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Cari aplikasi..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 focus:border-indigo-500 rounded-2xl py-3.5 pl-12 pr-4 outline-none transition-all"
            />
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl px-6 py-3 text-indigo-400 font-bold">
            {links.length} Active Apps
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32"><Loader2 className="animate-spin w-10 h-10 text-indigo-500" /></div>
        ) : filteredLinks.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-800 rounded-3xl text-slate-500">
             <Info className="mx-auto mb-4 w-12 h-12 opacity-20" />
             <p>Belum ada aplikasi tersimpan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLinks.map((link) => (
              <div key={link.id} className="group bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 rounded-3xl p-6 transition-all duration-300 flex flex-col">
                <div className="flex justify-between items-start mb-5">
                  <img src={link.icon} className="w-12 h-12 rounded-xl bg-slate-950 p-2 border border-slate-800" onError={(e) => e.target.src="https://cdn-icons-png.flaticon.com/512/1243/1243420.png"} />
                  <div className="flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-md uppercase border border-slate-700">{link.category}</span>
                    <span className="text-[10px] text-indigo-500 font-medium">⚙️ {link.techStack}</span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">{link.title}</h3>
                <p className="text-slate-400 text-sm mb-6 flex-grow line-clamp-2">{link.description}</p>
                <div className="flex gap-2">
                  <a href={link.url} target="_blank" className="flex-1 bg-white/5 hover:bg-white/10 text-white text-center py-2.5 rounded-xl font-semibold border border-white/5 flex items-center justify-center gap-2">
                    Open <ExternalLink className="w-4 h-4" />
                  </a>
                  {link.chatLink && (
                    <a href={link.chatLink} target="_blank" className="px-4 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white rounded-xl flex items-center transition border border-indigo-500/20">
                      <BrainCircuit className="w-5 h-5" />
                    </a>
                  )}
                  <button onClick={() => handleDelete(link.id)} className="px-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition border border-red-500/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-8 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">Deploy Link Baru</h2>
            {errorMsg && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex gap-3"><AlertTriangle className="w-5 h-5 shrink-0" /> {errorMsg}</div>}
            <div className="space-y-4">
              <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://..." className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl outline-none focus:border-indigo-500 transition" />
              <input type="url" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Link Chat AI (Opsional)" className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl outline-none focus:border-indigo-500 transition" />
              <div className="flex gap-3 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-400 hover:text-white transition">Batal</button>
                <button onClick={handleAddLink} disabled={isProcessing || !urlInput} className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all">
                  {isProcessing ? <><Loader2 className="animate-spin w-5 h-5" /> AI Processing...</> : <><Cpu className="w-5 h-5" /> Deploy</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
