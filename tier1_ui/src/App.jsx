import { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const graphRef = useRef();

  // Fetch the graph from Neo4j when the app loads or updates
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
    setLoading(true);
    setError('');
    setResults([]);

    try {
      const response = await fetch('http://localhost:8000/api/v1/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, max_results: 2 }),
      });

      if (!response.ok) throw new Error('Failed to fetch data from backend');
      
      const data = await response.json();
      setResults(data.data);
      
      // Refresh the map to show the newly ingested papers
      fetchGraph(); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Color coordinate the nodes based on their Neo4j Label
  const getNodeColor = (node) => {
    if (node.group === 'Paper') return '#4f46e5'; // Indigo
    if (node.group === 'Author') return '#10b981'; // Emerald
    if (node.group === 'Keyword') return '#f59e0b'; // Amber
    return '#94a3b8';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto">
        
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
            ResearchBridge AI
          </h1>
          <p className="text-slate-500 text-lg">
            Multi-tier Orchestration for Scholarly Discovery
          </p>
        </header>

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
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Synthesizing...' : 'Discover gaps'}
          </button>
        </form>

        {error && (
          <div className="p-4 mb-8 bg-red-50 text-red-700 rounded-lg text-center border border-red-200">
            {error}
          </div>
        )}

        {/* THE KNOWLEDGE MAP VISUALIZATION */}
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
                    nodeLabel="name"
                    nodeColor={getNodeColor}
                    nodeRelSize={6}
                    linkColor={() => '#94a3b8'}
                    linkWidth={2}
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                    width={1100} // Adjust based on your screen layout
                    height={500}

                    //--click handler--
                    onNodeClick={(node) => {
                      if (node.group === 'Paper') {
                        // ArXiv IDs are stored in the 'name' or a specific property
                        window.open(`https://arxiv.org/abs/${node.id_raw || node.name}`, '_blank');
                      } else if (node.group === 'Author') {
                        window.open(`https://scholar.google.com/scholar?q=${node.name}`, '_blank');
                      }
                    }}
                    
                    //--Improved node rendering with labels--
                    nodeCanvasObject={(node, ctx, globalScale) => {
                      const label = node.name.length>20 ? node.name.substring(0, 20) + '...' : node.name;
                      const fontSize = 14 / globalScale;
                      ctx.font= `${fontSize}px Inter, Sans-Serif`;
                      
                      //Draw the node circle
                      ctx.fillStyle = getNodeColor(node);
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false);
                      ctx.fill();

                      //Draw the labael shadow
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                      ctx.fillText(label, node.x, node.y + 12);

                      //Draw the label text
                      ctx.fillStyle = '#1e293b'; // Slate-800
                      ctx.fillText(label, node.x, node.y + 12);
                    }}
                    onEngineStop={() => graphRef.current.zoomToFit(400)}
                />
            ) : (
                <div className="flex h-full items-center justify-center text-slate-400">
                    No graph data available. Ingest some papers!
                </div>
            )}
        </div>

        {/* RESULTS GRID (From Day 1) */}
        {results.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2">
            {results.map((paper, index) => (
                <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                    arXiv ID: {paper.arxiv_id}
                    </h2>
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
                    Ingested & Mapped
                    </span>
                </div>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-indigo-900 mb-1">Theory / Methodology</h3>
                        <p className="text-slate-600 text-sm leading-relaxed">{paper.extracted_tlc.theory}</p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-rose-900 mb-1">White Spaces (Limitations)</h3>
                        <p className="text-slate-600 text-sm leading-relaxed">{paper.extracted_tlc.limitations}</p>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-amber-900 mb-1">Conclusion</h3>
                        <p className="text-slate-600 text-sm leading-relaxed">{paper.extracted_tlc.conclusion}</p>
                    </div>
                </div>
                </div>
            ))}
            </div>
        )}
      </div>
    </div>
  );
}

export default App;