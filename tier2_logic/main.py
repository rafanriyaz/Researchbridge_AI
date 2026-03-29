from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from neo4j import GraphDatabase
from dotenv import load_dotenv
import json
import os
from typing import Optional
import random
import requests
import urllib.parse
import re

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
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "admin123")
NEO4J_USER = "neo4j"

print(f"--- INITIALIZING ---")
print(f"Target Database URI: {NEO4J_URI}")

OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY")
if not OPENALEX_API_KEY:
    print("CRITICAL WARNING: No OpenAlex API key found in environment variables. Live data fetching will be unavailable.")

API_CACHE = {}

try:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    driver.verify_connectivity()
    print("SUCCESS: Connected to Local Neo4j Desktop!")
except Exception as e:
    print(f"CRITICAL ERROR: Could not connect to Neo4j. Is the database 'Running' in Neo4j Desktop?\nDetails: {e}")

class IngestRequest(BaseModel):
    query: str
    max_results: int = 1

def decode_abstract(inverted_index):
    if not inverted_index: 
        return ""
    word_index = []
    for word, positions in inverted_index.items():
        for pos in positions:
            word_index.append((pos, word))
    word_index.sort(key=lambda x: x[0])
    return " ".join([word for pos, word in word_index])

def fetch_openalex_data(search_query: str, max_results: int):
    cache_key = f"{search_query.lower()}_{max_results}"
    
    if cache_key in API_CACHE:
        cached_item = API_CACHE[cache_key]
        print(f"\n-> CACHE HIT (🟢 {cached_item['type'].upper()} DATA): Loading '{search_query}' from memory.")
        return cached_item["data"]

    print(f"\n-> CACHE MISS: Attempting LIVE OpenAlex fetch for '{search_query}'...")
    safe_query = urllib.parse.quote(search_query)
    
    url = f"https://api.openalex.org/works?search={safe_query}&per-page={max_results}&api_key={OPENALEX_API_KEY}"
    
    try:
        response = requests.get(url, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            papers = []
            
            for item in data.get('results', []):
                abstract_inv = item.get('abstract_inverted_index')
                if not abstract_inv:
                    continue
                    
                abstract_text = decode_abstract(abstract_inv)
                
                authors = []
                for authorship in item.get('authorships', []):
                    name = authorship.get('author', {}).get('display_name')
                    if name: authors.append(name)

                paper = {
                    "paper_id": item.get('id', '').split('/')[-1],
                    "title": item.get('title', 'Unknown Title'),
                    "abstract": abstract_text,
                    "authors": authors[:3] 
                }
                papers.append(paper)
            
            if papers:
                print(f"-> SUCCESS: Retrieved {len(papers)} live papers from OpenAlex!")
                API_CACHE[cache_key] = {"type": "live", "data": papers}
                return papers
                
        print(f"-> WARNING: OpenAlex returned Status {response.status_code}.")
            
    except Exception as e:
        print(f"-> WARNING: Network error ({e}).")

    print(f"-> FAILOVER ACTIVE: Synthesizing proxy data for '{search_query}'...")
    
    authors_list = ["Dr. Alan Turing", "Grace Hopper", "Ada Lovelace", "John von Neumann", "Claude Shannon"]
    mock_papers = []
    
    for i in range(max_results):
        fake_id = f"W{random.randint(1000000000, 9999999999)}"
        title = f"Advances in {search_query.title()} Architectures"
        abstract = f"This paper investigates {search_query}. We propose a new multi-tier orchestration model. Limitations remain regarding scaling without GPU bottlenecks. Ultimately, this provides a white space for future mapping."
        
        mock_papers.append({
            "paper_id": fake_id,
            "title": title,
            "abstract": abstract,
            "authors": random.sample(authors_list, 2)
        })
    
    API_CACHE[cache_key] = {"type": "mock", "data": mock_papers}
    return mock_papers

def extract_tlc_with_ollama(abstract: str):
    print(f"-> STEP 2: Sending abstract to local Ollama (Qwen)...")
    ollama_url = "http://localhost:11434/api/generate"
    
    prompt = f"""
    Analyze the following academic abstract. Extract the Theory/Methodology, Limitations (or 'White Spaces'), and Conclusion.
    Respond ONLY with a valid JSON object using the keys "theory", "limitations", and "conclusion". Do not use markdown tags.
    The whitespaces/limitations should be specific gaps or weaknesses in the current research that future work could address, it should not contain anything other than the limitations/whitespaces.
    The conclusion should summarize the main takeaway of the paper.
    
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
        response = requests.post(ollama_url, json=payload, timeout=120)
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
    print(f"-> STEP 3: Saving {paper['paper_id']} to Neo4j Desktop...")
    query = """
    MERGE (p:Paper {paper_id: $paper_id})
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
        "paper_id": paper["paper_id"],
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
        papers = fetch_openalex_data(request.query, request.max_results)
        
        results = []
        for paper in papers:
            tlc_data = extract_tlc_with_ollama(paper["abstract"])
            save_to_neo4j(paper, tlc_data, request.query)
            
            results.append({
                "paper_id": paper["paper_id"],
                "status": "Ingested successfully",
                "extracted_tlc": tlc_data
            })
            
        print("========== REQUEST COMPLETE ==========\n")
        return {"message": f"Processed {len(papers)} papers.", "data": results}
    
    except Exception as e:
        print(f"========== PIPELINE CRASHED ==========")
        print(f"Detailed Error: {e}")
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
                n = record["n"]
                if n is not None:
                    n_id = str(getattr(n, "element_id", getattr(n, "id", None)))
                    if n_id not in nodes_dict:
                        labels = list(n.labels)
                        label = labels[0] if labels else "Unknown"
                        name = n.get("title") or n.get("name") or n.get("paper_id") or "Node"
                        paper_id = n.get("paper_id") 
                        nodes_dict[n_id] = {"id": n_id, "group": label, "name": name, "paper_id": paper_id}
                
                m = record["m"]
                if m is not None:
                    m_id = str(getattr(m, "element_id", getattr(m, "id", None)))
                    if m_id not in nodes_dict:
                        labels = list(m.labels)
                        label = labels[0] if labels else "Unknown"
                        name = m.get("title") or m.get("name") or m.get("paper_id") or "Node"
                        paper_id = m.get("paper_id")
                        nodes_dict[m_id] = {"id": m_id, "group": label, "name": name, "paper_id": paper_id}
                
                r = record["r"]
                if r is not None:
                    source_id = str(getattr(r.start_node, "element_id", getattr(r.start_node, "id", None)))
                    target_id = str(getattr(r.end_node, "element_id", getattr(r.end_node, "id", None)))
                    
                    links.append({
                        "source": source_id,
                        "target": target_id,
                        "label": r.type
                    })
            
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

class ChatRequest(BaseModel):
    message: str
    active_paper_id: Optional[str] = None

@app.post("/api/v1/chat")
async def chat_with_graph(req: ChatRequest):
    print(f"\n--- RAG PIPELINE TRIGGERED ---")
    print(f"User Question: {req.message}")
    
    context_blocks = []
    
    try:
        with driver.session() as session:
            if req.active_paper_id:
                print(f"-> Mode: Targeted Paper Analysis ({req.active_paper_id})")
                query = """
                MATCH (p:Paper {paper_id: $paper_id})
                OPTIONAL MATCH (p)-[:TAGGED_WITH]->(k:Keyword)
                RETURN p.title AS title, p.theory AS theory, p.limitations AS limitations, p.conclusion AS conclusion, collect(k.name) as keywords
                """
                result = session.run(query, {"paper_id": req.active_paper_id}).single()
                if result:
                    context_blocks.append(
                        f"FOCUS PAPER: {result['title']}\n"
                        f"Keywords: {', '.join(result['keywords'])}\n"
                        f"Theory: {result['theory']}\n"
                        f"Limitations (White Space): {result['limitations']}\n"
                        f"Conclusion: {result['conclusion']}\n"
                    )
            
            else:
                print("-> Mode: Global Graph Search")
                stop_words = {"what", "is", "the", "a", "an", "how", "why", "can", "you", "tell", "me", "about", "in", "of", "and", "or", "for", "to"}
                words = [w.lower() for w in re.sub(r'[^\w\s]', '', req.message).split() if w.lower() not in stop_words]
                
                if not words:
                    words = [""] 
                
                query = """
                WITH $words AS searchTerms
                MATCH (p:Paper)
                WHERE ANY(term IN searchTerms WHERE toLower(p.title) CONTAINS term OR toLower(p.abstract) CONTAINS term OR toLower(p.limitations) CONTAINS term)
                RETURN p.title AS title, p.limitations AS limitations, p.conclusion AS conclusion
                LIMIT 5
                """
                result = session.run(query, {"words": words})
                for record in result:
                    context_blocks.append(
                        f"Paper: {record['title']}\n"
                        f"Limitations: {record['limitations']}\n"
                        f"Conclusion: {record['conclusion']}\n"
                    )

    except Exception as e:
        print(f"Database Error during RAG retrieval: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve graph context.")

    if not context_blocks:
        return {"reply": "I couldn't find any papers in the current Knowledge Map that match your question. Try ingesting some related papers first!"}

    compiled_context = "\n---\n".join(context_blocks)
    print(f"-> Retrieved {len(context_blocks)} contextual blocks from Graph.")

    system_prompt = f"""You are ResearchBridge AI, an expert academic orchestrator.
You are assisting a researcher. Answer their question strictly using the CONTEXT provided below.
If the context contains a "FOCUS PAPER", prioritize that paper heavily.
If the answer cannot be deduced from the context, explicitly say: "I do not have enough data in the current graph to answer this." Do not hallucinate external knowledge.

CONTEXT:
{compiled_context}

USER QUESTION:
{req.message}
"""

    try:
        ollama_payload = {
            "model": "qwen3:8b", 
            "prompt": system_prompt,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_ctx": 4096    
            }
        }
        
        print("-> Generating response via Ollama...")
        response = requests.post("http://localhost:11434/api/generate", json=ollama_payload)
        response.raise_for_status()
        
        reply_text = response.json().get("response", "Error generating response.")
        print("--- RAG PIPELINE COMPLETE ---\n")
        return {"reply": reply_text}
        
    except requests.exceptions.RequestException as e:
        print(f"Ollama Error: {e}")
        raise HTTPException(status_code=500, detail="Local LLM is currently unreachable.")

@app.get("/api/v1/paper/{paper_id}")
async def get_paper_details(paper_id: str):
    """Fetches the full TLC data for a specific paper for the UI Inspector."""
    print(f"-> Fetching details for paper: {paper_id}")
    
    query = """
    MATCH (p:Paper {paper_id: $paper_id})
    RETURN p.title AS title, 
           p.abstract AS abstract, 
           p.theory AS theory, 
           p.limitations AS limitations, 
           p.conclusion AS conclusion
    """
    
    try:
        with driver.session() as session:
            result = session.run(query, {"paper_id": paper_id}).single()
            
            if not result:
                raise HTTPException(status_code=404, detail="Paper not found in Graph.")
                
            return {
                "paper_id": paper_id,
                "title": result["title"],
                "abstract": result["abstract"],
                "theory": result["theory"],
                "limitations": result["limitations"],
                "conclusion": result["conclusion"]
            }
    except Exception as e:
        print(f"Error fetching paper details: {e}")
        raise HTTPException(status_code=500, detail="Database error.")

@app.delete("/api/v1/graph/clear")
async def clear_database():
    print("-> DANGER: User requested full database wipe...")
    query = """
    MATCH (n)
    DETACH DELETE n
    """
    try:
        with driver.session() as session:
            session.run(query)
        print("-> SUCCESS: Neo4j database is completely empty.")
        return {"message": "Knowledge Map wiped successfully."}
    except Exception as e:
        print(f"Database Wipe Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear database.")