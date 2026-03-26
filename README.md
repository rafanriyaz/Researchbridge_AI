# ResearchBridge AI 🎓🌐
**Multi-tier Orchestration for Scholarly Discovery & Knowledge Mapping**

ResearchBridge AI is a specialized research tool designed to bridge the gap between fragmented academic papers. Following the methodology of **Ismail et al. (2025)**, this system automates the ingestion, synthesis, and visualization of research domains to identify "White Spaces" (limitations) and "Research Bridges."



## 🏗️ The Multi-Tier Architecture

| Tier | Layer | Technology | Responsibility |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Presentation** | React + Tailwind | Interactive Dashboard & Force-Directed Graph |
| **Tier 2** | **Logic** | FastAPI + Ollama | AI Orchestration & TLC (Theory-Limitation-Conclusion) Extraction |
| **Tier 3** | **Database** | Neo4j Desktop | Knowledge Graph storage & Relationship mapping |
| **Tier 4** | **Data** | arXiv API | Live scholarly metadata harvesting |

## 🚀 Key Features
* **Automated Ingestion:** Directly pulls the latest research from arXiv based on user keywords.
* **Local AI Synthesis:** Uses **Qwen2.5:8b** (via Ollama) to extract structured insights from abstracts without cloud costs.
* **Interactive Knowledge Map:** A 2D physics-based graph visualizing connections between Papers, Authors, and Keywords.
* **Gap Identification:** Highlighted "White Spaces" in current research to help scholars find new project directions.

## 🛠️ Installation & Setup

### Prerequisites
* [Ollama](https://ollama.com/) (with `qwen2.5:8b` pulled)
* [Neo4j Desktop](https://neo4j.com/download/) (Local DBMS running)
* Node.js & Python 3.11+

### 1. Backend Setup (Tier 2)
```bash
cd tier2_logic
pip install -r requirements.txt
# Ensure .env is configured with Neo4j credentials
uvicorn main:app --reload
