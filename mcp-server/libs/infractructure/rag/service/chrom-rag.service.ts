import { Injectable } from "@nestjs/common";
import { ChromRagInitService } from "./chrom-rag-init.service";

@Injectable()
export class ChromRagService {
    private get collection() {
        return this.initService.getCollection();
    }

    private get priceCollection() {
        return this.initService.getPriceCollection();
    }

    constructor(private readonly initService: ChromRagInitService) {}

    async search(query: string, nResults: number = 5, maxDistance: number = 1.15): Promise<any | null> {
        try {
            if (!this.collection) {
                throw new Error("Collection not initialized. Ensure ChromRagInitService ran on startup.");
            }

            console.log(`Searching in ChromaDB for: "${query}"`);

            const results = await this.collection.query({
                queryTexts: [query],
                nResults: nResults,
            });

            console.log(`ChromaDB query results:`, {
                documentsCount: results?.documents?.[0]?.length || 0,
                distances: results?.distances?.[0] || [],
            });

            if (!results || !results.documents || results.documents.length === 0 || !results.documents[0] || results.documents[0].length === 0) {
                console.log("No documents found in ChromaDB");
                return null;
            }

            const formattedResults = results.documents[0].map((doc: string, index: number) => ({
                document: doc,
                metadata: results.metadatas?.[0]?.[index] || {},
                distance: results.distances?.[0]?.[index] || 1,
            }));

            console.log(`Formatted results:`, formattedResults.map(r => ({
                question: r.metadata.question,
                distance: r.distance
            })));

            const bestResult = formattedResults.reduce((best, current) => {
                return current.distance < best.distance ? current : best;
            });

            console.log(`Best result distance: ${bestResult.distance}, threshold: ${maxDistance}`);

            if (bestResult.distance > maxDistance) {
                console.log(`Search result distance ${bestResult.distance} exceeds threshold ${maxDistance}. Question: "${bestResult.metadata.question}"`);
                return null;
            }

            return {
                answer: bestResult.metadata.answer || bestResult.document,
                question: bestResult.metadata.question || '',
                source: bestResult.metadata.source || '',
                distance: bestResult.distance,
            };
        } catch (error) {
            console.error("Error searching in ChromaDB:", error);
            return null;
        }
    }

    /**
     * Возвращает несколько кандидатов из базы знаний (без выбора лучшего).
     * Используется для последующей фильтрации релевантности через LLM.
     */
    async searchCandidates(
        query: string,
        nResults: number = 8,
        maxDistance: number = 1.4,
    ): Promise<Array<{ document: string; metadata: Record<string, unknown>; distance: number }> | null> {
        try {
            if (!this.collection) {
                throw new Error("Collection not initialized. Ensure ChromRagInitService ran on startup.");
            }

            const results = await this.collection.query({
                queryTexts: [query],
                nResults: nResults,
            });

            if (!results?.documents?.[0]?.length) {
                return null;
            }

            const candidates = results.documents[0]
                .map((doc: string, index: number) => ({
                    document: doc,
                    metadata: results.metadatas?.[0]?.[index] || {},
                    distance: results.distances?.[0]?.[index] ?? 1,
                }))
                .filter((r: { distance: number }) => r.distance <= maxDistance)
                .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance);

            return candidates.length > 0 ? candidates : null;
        } catch (error) {
            console.error("Error searching candidates in ChromaDB:", error);
            return null;
        }
    }

    async getAllDocuments() {
        try {
            if (!this.collection) {
                throw new Error("Collection not initialized. Ensure ChromRagInitService ran on startup.");
            }
            const count = await this.collection.count();
            const results = await this.collection.get({ limit: count });
            return results;
        } catch (error) {
            console.error("Error getting all documents:", error);
            return null;
        }
    }

    private normalizePriceQuery(query: string): string {
        let normalized = query.toLowerCase().trim();
        const replacements: Array<[RegExp, string]> = [
            [/\bпрививк[аиуой]?\b/gi, 'вакцинация'],
            [/\bвакцинац[ияией]?\b/gi, 'вакцинация'],
            [/\bстрижк[аиуой]?\b/gi, 'груминг'],
            [/\bгруминг[ауом]?\b/gi, 'груминг'],
            [/\bкот[ауом]?\b/gi, 'кошки'],
            [/\bсобак[аиуой]?\b/gi, 'собаки'],
        ];
        replacements.forEach(([regex, replacement]) => {
            normalized = normalized.replace(regex, replacement);
        });
        normalized = normalized.replace(/\b(сколько|стоит|цена|стоимость|цены|на|для|у|с)\b/gi, '').trim();
        normalized = normalized.replace(/\s+/g, ' ').trim();
        return normalized;
    }

    async searchForPrice(query: string, nResults: number = 10, maxDistance: number = 1.4): Promise<any | null> {
        try {
            if (!this.priceCollection) {
                throw new Error("Price collection not initialized. Ensure ChromRagInitService ran on startup.");
            }

            const normalizedQuery = this.normalizePriceQuery(query);
            console.log(`Searching prices for: "${query}" (normalized: "${normalizedQuery}")`);

            let results = await this.priceCollection.query({
                queryTexts: [normalizedQuery],
                nResults: nResults,
            });

            console.log(`Price query results:`, {
                documentsCount: results?.documents?.[0]?.length || 0,
                distances: results?.distances?.[0] || [],
            });

            if (!results || !results.documents || results.documents.length === 0 || !results.documents[0] || results.documents[0].length === 0) {
                return null;
            }

            const formattedResults = results.documents[0]
                .map((doc: string, index: number) => ({
                    document: doc,
                    metadata: results.metadatas?.[0]?.[index] || {},
                    distance: results.distances?.[0]?.[index] || 1,
                }))
                .filter((r: any) => r.distance <= maxDistance)
                .sort((a: any, b: any) => a.distance - b.distance);

            if (formattedResults.length === 0) {
                return null;
            }

            if (formattedResults.length === 1) {
                const result = formattedResults[0];
                return {
                    type: 'exact',
                    service_name: result.metadata.service_name,
                    category: result.metadata.category,
                    price: result.metadata.price,
                    price_str: `${result.metadata.price_str} руб`,
                    distance: result.distance,
                };
            }

            const prices = formattedResults.map((r: any) => r.metadata.price).filter((p: number) => !isNaN(p));
            if (prices.length === 0) {
                return null;
            }

            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            if (minPrice === maxPrice) {
                const bestResult = formattedResults[0];
                return {
                    type: 'exact',
                    service_name: bestResult.metadata.service_name,
                    category: bestResult.metadata.category,
                    price: minPrice,
                    price_str: `${minPrice} руб`,
                    services: formattedResults.map((r: any) => ({
                        name: r.metadata.service_name,
                        category: r.metadata.category,
                        price: r.metadata.price,
                    })),
                };
            }

            if (formattedResults.length > 1) {
                const bestResult = formattedResults[0];
                const secondBest = formattedResults[1];
                if (bestResult.distance < 0.7 && (secondBest.distance - bestResult.distance) > 0.2) {
                    return {
                        type: 'exact',
                        service_name: bestResult.metadata.service_name,
                        category: bestResult.metadata.category,
                        price: bestResult.metadata.price,
                        price_str: `${bestResult.metadata.price_str} руб`,
                        distance: bestResult.distance,
                    };
                }
            }

            return {
                type: 'range',
                min_price: minPrice,
                max_price: maxPrice,
                price_str: `${minPrice} - ${maxPrice} руб`,
                services: formattedResults.map((r: any) => ({
                    name: r.metadata.service_name,
                    category: r.metadata.category,
                    price: r.metadata.price,
                    distance: r.distance,
                })),
                count: formattedResults.length,
            };
        } catch (error) {
            console.error("Error searching prices in ChromaDB:", error);
            return null;
        }
    }
}
