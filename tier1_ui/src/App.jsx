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

  // --- NEW HIGHLIGHT STATE (Day 5) ---
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);

  // --- NEW CHAT STATE ---
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: "Hi! I'm ResearchBridge AI. Ask me about the papers, authors, or limitations in your Knowledge Map." }
  ]);
  const chatEndRef = useRef(null);

  // Add this right under your chat states:
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // --- EXISTING LOGIC ---  added fallbacks and error handling to make it more robust for demos
const fetchGraph = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/graph');
      
      // 1. If the backend throws a 500, immediately jump to the catch block
      if (!res.ok) throw new Error(`Backend error: ${res.status}`);
      
      const data = await res.json();
      
      // 2. Double-check that the data actually has nodes and links before saving
      if (data && data.nodes && data.links) {
        setGraphData(data);
      } else {
        setGraphData({ nodes: [], links: [] });
      }
      
    } catch (err) {
      console.error("Failed to load graph:", err);
      // 3. Fallback: Reset to an empty graph so the UI doesn't crash
      setGraphData({ nodes: [], links: [] });
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

const handleClearGraph = async () => {
    // Built-in browser confirmation so you don't accidentally click it during a demo
    if (!window.confirm("Are you sure you want to delete all papers? This cannot be undone.")) return;
    
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/v1/graph/clear', {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to clear database');
      
      // Reset all UI states to empty
      setGraphData({ nodes: [], links: [] });
      setResults([]);
      setSelectedPaper(null);
      setChatHistory([
        { role: 'ai', text: "Graph cleared! I am ready for a new research topic." }
      ]);
      
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
// --- UPDATED CHAT LOGIC ---
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
        body: JSON.stringify({ 
          message: userMessage,
          // NEW: Send the active paper ID if the Inspector panel is open!
          active_paper_id: selectedPaper ? selectedPaper.arxiv_id : null 
        }),
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
        <form onSubmit={handleSearch} className="flex gap-4 max-w-3xl mx-auto mb-8">
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
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Synthesizing...' : 'Discover gaps'}
          </button>
          
          {/* NEW CLEAR BUTTON */}
          <button
            type="button"
            onClick={handleClearGraph}
            disabled={loading || graphData?.nodes?.length === 0 || !graphData?.nodes}
            className="px-4 py-3 bg-red-50 text-red-600 font-medium rounded-lg border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
            title="Wipe the current Knowledge Map"
          >
            Clear Map
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
            
            {graphData?.nodes?.length > 0 ? (
                <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeRelSize={6}
                    
                    // --- 1. DYNAMIC LINK COLORING ---
                    linkColor={(link) => highlightLinks.has(link) ? '#f59e0b' : (hoverNode ? 'rgba(148, 163, 184, 0.1)' : '#94a3b8')}
                    linkWidth={(link) => highlightLinks.has(link) ? 3 : 1.5}
                    linkDirectionalArrowLength={3}
                    linkDirectionalArrowRelPos={1}
                    width={1100} 
                    height={500}
                    nodeLabel="name" 
                    
                    // --- 2. THE HOVER LOGIC ---
                    onNodeHover={(node) => {
                      setHighlightNodes(new Set());
                      setHighlightLinks(new Set());
                      
                      if (node) {
                        const newHighlightNodes = new Set([node]);
                        const newHighlightLinks = new Set();
                        
                        // Find all links connected to this node
                        graphData.links.forEach(link => {
                          if (link.source === node || link.target === node) {
                            newHighlightLinks.add(link);
                            newHighlightNodes.add(link.source === node ? link.target : link.source);
                          }
                        });

                        setHighlightNodes(newHighlightNodes);
                        setHighlightLinks(newHighlightLinks);
                      }
                      
                      setHoverNode(node || null);
                    }}

                    onNodeClick={async (node) => {
                      if (node.group === 'Paper') {
                        setLoadingDetails(true);
                        try {
                          const targetId = node.arxiv_id; 
                          if (!targetId) return;

                          const res = await fetch(`http://localhost:8000/api/v1/paper/${targetId}`);
                          if (res.ok) {
                            const data = await res.json();
                            setSelectedPaper(data);
                          }
                        } catch (err) {
                          console.error("Failed to fetch paper details", err);
                        } finally {
                          setLoadingDetails(false);
                        }
                      } else if (node.group === 'Author') {
                        const searchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(node.name)}`;
                        window.open(searchUrl, '_blank');
                      }
                    }}
                    
                    // --- 3. DYNAMIC NODE RENDERING ---
                    nodeCanvasObject={(node, ctx, globalScale) => {
                      // Check if we should dim this node
                      const isHighlighted = hoverNode ? highlightNodes.has(node) : true;
                      
                      // Set opacity based on highlight state
                      ctx.globalAlpha = isHighlighted ? 1 : 0.15;

                      const label = node.name.length > 20 ? node.name.substring(0, 20) + "..." : node.name;
                      const fontSize = 14 / globalScale;
                      
                      ctx.font = `${fontSize}px Inter, Sans-Serif`;
                      ctx.fillStyle = getNodeColor(node);
                      ctx.beginPath(); 
                      
                      // Make hovered nodes slightly larger
                      const radius = node === hoverNode ? 8 : 6;
                      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false); 
                      ctx.fill();
                      
                      ctx.textAlign = 'center'; 
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; 
                      ctx.fillText(label, node.x, node.y + (radius + 6));
                      ctx.fillStyle = '#1e293b'; 
                      ctx.fillText(label, node.x, node.y + (radius + 6));

                      // Reset alpha so it doesn't mess up the rest of the canvas
                      ctx.globalAlpha = 1;
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
      {/* --- TLC INSPECTOR SIDE PANEL --- */}
      {selectedPaper && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[500px] bg-white shadow-2xl border-l border-slate-200 z-40 transform transition-transform duration-300 ease-in-out flex flex-col">
          {/* Header */}
          <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-start">
            <div>
              <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded mb-2">
                arXiv: {selectedPaper.arxiv_id}
              </span>
              <h2 className="text-xl font-bold text-slate-800 leading-tight">
                {selectedPaper.title}
              </h2>
            </div>
            <button 
              onClick={() => setSelectedPaper(null)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* White Space / Limitations (Highlighted deliberately) */}
            <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-lg">
              <h3 className="text-amber-800 font-bold mb-2 flex items-center">
                <span className="mr-2">⚠️</span> Extracted White Space (Limitations)
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {selectedPaper.limitations}
              </p>
            </div>

            {/* Theory */}
            <div>
              <h3 className="text-indigo-800 font-bold border-b border-slate-100 pb-2 mb-2">
                Theory / Methodology
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {selectedPaper.theory}
              </p>
            </div>

            {/* Conclusion */}
            <div>
              <h3 className="text-emerald-800 font-bold border-b border-slate-100 pb-2 mb-2">
                Conclusion
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {selectedPaper.conclusion}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-100">
              <a 
                href={`https://arxiv.org/abs/${selectedPaper.arxiv_id}`} 
                target="_blank" 
                rel="noreferrer"
                className="inline-block w-full text-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 text-sm font-medium transition-colors"
              >
                Read Full Paper on arXiv
              </a>
            </div>
          </div>
        </div>
      )}
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