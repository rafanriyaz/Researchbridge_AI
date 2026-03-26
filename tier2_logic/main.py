from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware  # <-- THIS IS THE MISSING PIECE
from pydantic import BaseModel
from neo4j import GraphDatabase
from dotenv import load_dotenv
import requests
import xml.etree.ElementTree as ET
import json
import os

load_dotenv()

app = FastAPI(title="ResearchBridge AI - Tier 2 Logic")

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],
)
# ---------------------------------------------------

# --- DATABASE CONFIGURATION ---
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://127.0.0.1:7687")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "admin123") # Update fallback if needed
NEO4J_USER = "neo4j"

print(f"--- INITIALIZING ---")
print(f"Target Database URI: {NEO4J_URI}")

# Initialize Database Driver
try:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    # Test connection on startup
    driver.verify_connectivity()
    print("SUCCESS: Connected to Local Neo4j Desktop!")
except Exception as e:
    print(f"CRITICAL ERROR: Could not connect to Neo4j. Is the database 'Running' in Neo4j Desktop?\nDetails: {e}")

class IngestRequest(BaseModel):
    query: str
    max_results: int = 1

def fetch_arxiv_data(search_query: str, max_results: int):
    print(f"-> STEP 1: Fetching {max_results} papers from arXiv for '{search_query}'...")
    url = f"http://export.arxiv.org/api/query?search_query=all:{search_query}&start=0&max_results={max_results}"
    response = requests.get(url)
    
    if response.status_code != 200:
        raise Exception(f"arXiv API rejected the request with status code: {response.status_code}")
        
    root = ET.fromstring(response.content)
    namespace = {'atom': 'http://www.w3.org/2005/Atom'}
    
    papers = []
    for entry in root.findall('atom:entry', namespace):
        paper = {
            "arxiv_id": entry.find('atom:id', namespace).text.split('/')[-1],
            "title": entry.find('atom:title', namespace).text.replace('\n', ' ').strip(),
            "abstract": entry.find('atom:summary', namespace).text.replace('\n', ' ').strip(),
            "authors": [author.find('atom:name', namespace).text for author in entry.findall('atom:author', namespace)]
        }
        papers.append(paper)
    
    if not papers:
         print("-> STEP 1 WARNING: arXiv returned 0 papers.")
    else:
         print(f"-> STEP 1 SUCCESS: Found '{papers[0]['title'][:30]}...'")
    return papers

def extract_tlc_with_ollama(abstract: str):
    print(f"-> STEP 2: Sending abstract to local Ollama (Qwen)...")
    ollama_url = "http://localhost:11434/api/generate"
    
    prompt = f"""
    Analyze the following academic abstract. Extract the Theory/Methodology, Limitations (or 'White Spaces'), and Conclusion.
    Respond ONLY with a valid JSON object using the keys "theory", "limitations", and "conclusion". Do not use markdown tags.
    
    Abstract: {abstract}
    """
    
    payload = {
        "model": "qwen3:8b", 
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"num_ctx": 16384}
    }
    
    try:
        response = requests.post(ollama_url, json=payload, timeout=120) # 2 min timeout for GPU processing
        response.raise_for_status()
        
        result_text = response.json().get("response", "{}")
        print(f"-> STEP 2 SUCCESS: Received JSON from Ollama.")
        return json.loads(result_text)
        
    except requests.exceptions.ConnectionError:
         raise Exception("Ollama connection failed. Is the Ollama app running on your computer?")
    except json.decoder.JSONDecodeError:
         print("-> STEP 2 ERROR: Ollama returned invalid JSON. Saving defaults.")
         return {"theory": "Parsing Error", "limitations": "Parsing Error", "conclusion": "Parsing Error"}
    except Exception as e:
         raise Exception(f"Ollama Extraction Error: {e}")

def save_to_neo4j(paper, tlc_data, keyword):
    print(f"-> STEP 3: Saving {paper['arxiv_id']} to Neo4j Desktop...")
    query = """
    MERGE (p:Paper {arxiv_id: $arxiv_id})
    SET p.title = $title,
        p.abstract = $abstract,
        p.theory = $theory,
        p.limitations = $limitations,
        p.conclusion = $conclusion

    MERGE (k:Keyword {name: toLower($keyword)})
    MERGE (p)-[:TAGGED_WITH]->(k)

    WITH p
    UNWIND $authors AS author_name
    MERGE (a:Author {name: author_name})
    MERGE (a)-[:AUTHORED]->(p)
    """
    
    parameters = {
        "arxiv_id": paper["arxiv_id"],
        "title": paper["title"],
        "abstract": paper["abstract"],
        "authors": paper["authors"],
        "keyword": keyword,
        "theory": tlc_data.get("theory", "N/A"),
        "limitations": tlc_data.get("limitations", "N/A"),
        "conclusion": tlc_data.get("conclusion", "N/A")
    }
    
    try:
        with driver.session() as session:
            session.run(query, parameters)
        print("-> STEP 3 SUCCESS: Graph Data saved!")
    except Exception as e:
        raise Exception(f"Neo4j Save Error: {e}")

@app.post("/api/v1/ingest")
async def ingest_papers(request: IngestRequest):
    print(f"\n========== NEW INGESTION REQUEST ==========")
    try:
        papers = fetch_arxiv_data(request.query, request.max_results)
        
        results = []
        for paper in papers:
            tlc_data = extract_tlc_with_ollama(paper["abstract"])
            save_to_neo4j(paper, tlc_data, request.query)
            
            results.append({
                "arxiv_id": paper["arxiv_id"],
                "status": "Ingested successfully",
                "extracted_tlc": tlc_data
            })
            
        print("========== REQUEST COMPLETE ==========\n")
        return {"message": f"Processed {len(papers)} papers.", "data": results}
    
    except Exception as e:
        print(f"========== PIPELINE CRASHED ==========")
        print(f"Detailed Error: {e}")
        # This sends the error message back to the Swagger UI response body
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/api/v1/graph")
async def get_knowledge_map():
    print("-> Fetching Knowledge Map for UI...")
    query = """
    MATCH (n)
    OPTIONAL MATCH (n)-[r]->(m)
    RETURN n, r, m
    """
    
    try:
        with driver.session() as session:
            result = session.run(query)
            
            nodes_dict = {}
            links = []
            
            for record in result:
                # 1. Process Source Node
                n = record["n"]
                if n is not None:
                    n_id = str(getattr(n, "element_id", getattr(n, "id", None)))
                    if n_id not in nodes_dict:
                        labels = list(n.labels)
                        label = labels[0] if labels else "Unknown"
                        name = n.get("title") or n.get("name") or n.get("arxiv_id") or "Node"
                        nodes_dict[n_id] = {"id": n_id, "group": label, "name": name}
                
                # 2. Process Target Node
                m = record["m"]
                if m is not None:
                    m_id = str(getattr(m, "element_id", getattr(m, "id", None)))
                    if m_id not in nodes_dict:
                        labels = list(m.labels)
                        label = labels[0] if labels else "Unknown"
                        name = m.get("title") or m.get("name") or m.get("arxiv_id") or "Node"
                        nodes_dict[m_id] = {"id": m_id, "group": label, "name": name}
                
                # 3. Process Relationship
                r = record["r"]
                if r is not None:
                    # Explicitly grab start and end nodes to guarantee the IDs match
                    source_id = str(getattr(r.start_node, "element_id", getattr(r.start_node, "id", None)))
                    target_id = str(getattr(r.end_node, "element_id", getattr(r.end_node, "id", None)))
                    
                    links.append({
                        "source": source_id,
                        "target": target_id,
                        "label": r.type
                    })
            
            # De-duplicate links so the physics engine doesn't over-calculate
            unique_links = []
            seen = set()
            for link in links:
                identifier = f"{link['source']}-{link['target']}-{link['label']}"
                if identifier not in seen:
                    seen.add(identifier)
                    unique_links.append(link)
                    
            return {"nodes": list(nodes_dict.values()), "links": unique_links}
            
    except Exception as e:
        print(f"Graph Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))