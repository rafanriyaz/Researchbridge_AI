// 1. Create constraints for data integrity (Run these one by one)
CREATE CONSTRAINT FOR (p:Paper) REQUIRE p.arxiv_id IS UNIQUE;
CREATE CONSTRAINT FOR (a:Author) REQUIRE a.name IS UNIQUE;
CREATE CONSTRAINT FOR (k:Keyword) REQUIRE k.name IS UNIQUE;

// 2. The Conceptual Schema (How your data will link)
// (Author)-[:AUTHORED]->(Paper)
// (Paper)-[:TAGGED_WITH]->(Keyword)
// (Paper)-[:REFERENCES]->(Paper) // *Save this relationship for next semester!*