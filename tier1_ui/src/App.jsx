import { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

function App() {
  // --- EXISTING STATE ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const graphRef = useRef();

  // --- NEW CHAT STATE ---
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: "Hi! I'm ResearchBridge AI. Ask me about the papers, authors, or limitations in your Knowledge Map." }
  ]);
  const chatEndRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // --- EXISTING LOGIC ---
  const fetchGraph = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/graph');
      const data = await res.json();
      setGraphData(data);
    } catch (err) {
      console.error("Failed to load graph:", err);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setResults([]);
    try {
      const response = await fetch('http://localhost:8000/api/v1/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, max_results: 2 }),
      });
      if (!response.ok) throw new Error('Failed to fetch data from backend');
      const data = await response.json();
      setResults(data.data);
      fetchGraph(); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getNodeColor = (node) => {
    switch (node.group) {
      case 'Paper': return '#4f46e5';
      case 'Author': return '#10b981';
      case 'Keyword': return '#f59e0b';
      default: return '#94a3b8';
    }
  };

  // --- NEW CHAT LOGIC ---
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setChatInput('');
    setIsChatting(true);

    try {
      const response = await fetch('http://localhost:8000/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      
      if (!response.ok) throw new Error('Chat failed');
      const data = await response.json();
      setChatHistory(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'ai', text: "Error: Could not reach the AI assistant." }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900 pb-24">
      <div className="max-w-6xl mx-auto">
        
        {/* HEADER */}
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
            ResearchBridge AI
          </h1>
          <p className="text-slate-500 text-lg">
            Multi-tier Orchestration for Scholarly Discovery
          </p>
        </header>

        {/* SEARCH FORM */}
        <form onSubmit={handleSearch} className="flex gap-4 max-w-2xl mx-auto mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter a research domain (e.g., neural networks)..."
            className="flex-1 px-4 py-3 rounded-lg border border-slate-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Synthesizing...' : 'Discover gaps'}
          </button>
        </form>

        {error && <div className="p-4 mb-8 bg-red-50 text-red-700 rounded-lg text-center border border-red-200">{error}</div>}

        {/* KNOWLEDGE MAP */}
        <div className="mb-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[500px] relative">
            <div className="absolute top-4 left-4 z-10 bg-white/90 p-3 rounded-md shadow-sm text-sm border border-slate-100">
                <h3 className="font-bold text-slate-700 mb-2">Graph Legend</h3>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo-600"></span> Papers</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Authors</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-500"></span> Keywords</div>
            </div>
            
            {graphData.nodes.length > 0 ? (
                <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeRelSize={6}
                    linkColor={() => '#94a3b8'}
                    linkWidth={1.5}
                    linkDirectionalArrowLength={3}
                    linkDirectionalArrowRelPos={1}
                    width={1100} 
                    height={500}
                    onNodeClick={(node) => {
                      if (node.group === 'Paper') window.open(`https://arxiv.org/abs/${node.id || node.name}`, '_blank');
                      else if (node.group === 'Author') window.open(`https://scholar.google.com/scholar?q=${node.name}`, '_blank');
                    }}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                      const label = node.name.length > 20 ? node.name.substring(0, 20) + "..." : node.name;
                      const fontSize = 14 / globalScale;
                      ctx.font = `${fontSize}px Inter, Sans-Serif`;
                      ctx.fillStyle = getNodeColor(node);
                      ctx.beginPath(); ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false); ctx.fill();
                      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.fillText(label, node.x, node.y + 12);
                      ctx.fillStyle = '#1e293b'; ctx.fillText(label, node.x, node.y + 12);
                    }}
                    onEngineStop={() => graphRef.current?.zoomToFit(400)}
                />
            ) : (
                <div className="flex h-full items-center justify-center text-slate-400">
                    No graph data available. Ingest some papers!
                </div>
            )}
        </div>
      </div>

      {/* --- FLOATING CHAT WIDGET --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* Chat Window */}
        {chatOpen && (
          <div className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-80 sm:w-96 h-[500px] mb-4 flex flex-col overflow-hidden transition-all">
            <div className="bg-indigo-600 text-white p-4 font-bold flex justify-between items-center">
              <span>Knowledge Assistant</span>
              <button onClick={() => setChatOpen(false)} className="hover:text-indigo-200">✕</button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-lg max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="p-3 bg-white border border-slate-200 text-slate-400 text-sm rounded-lg rounded-bl-none shadow-sm animate-pulse">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleChatSubmit} className="p-3 bg-white border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your graph..."
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                disabled={isChatting}
              />
              <button
                type="submit"
                disabled={isChatting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm"
              >
                Send
              </button>
            </form>
          </div>
        )}

        {/* Chat Toggle Button */}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-xl transition-transform hover:scale-105 focus:outline-none"
        >
          {chatOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
          )}
        </button>
      </div>

    </div>
  );
}

export default App;