import { Injectable, OnModuleInit } from "@nestjs/common";
import { ChromaClient } from "chromadb";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

// Кастомная embedding функция на основе OpenAI
class OpenAIEmbeddingFunction {
    private openai: OpenAI;
    private model: string;

    constructor(apiKey: string, model: string = "text-embedding-3-small") {
        this.openai = new OpenAI({ apiKey });
        this.model = model;
    }

    async generate(texts: string[]): Promise<number[][]> {
        try {
            const response = await this.openai.embeddings.create({
                model: this.model,
                input: texts,
            });
            return response.data.map(item => item.embedding);
        } catch (error) {
            console.error("Error generating embeddings:", error);
            throw error;
        }
    }

    // Метод для одного текста (может потребоваться ChromaDB)
    async embed(text: string): Promise<number[]> {
        const embeddings = await this.generate([text]);
        return embeddings[0];
    }
}

@Injectable()
export class ChromRagInitService implements OnModuleInit {
    private readonly chromaClient: ChromaClient;
    private readonly embedder: OpenAIEmbeddingFunction;
    private readonly collectionName = "vet_knowledge_base";
    private readonly priceCollectionName = "vet_price_list";
    private collection: any;
    private priceCollection: any;

    constructor() {
        const chromaPath = process.env.CHROMA_PATH || "http://localhost:8000";
        const openaiApiKey = process.env.OPENAI_API_KEY;
        
        if (!openaiApiKey) {
            throw new Error("OPENAI_API_KEY environment variable is required");
        }
        
        // ChromaClient поддерживает как локальные пути, так и URL
        this.chromaClient = new ChromaClient({
            path: chromaPath,
        });
        
        this.embedder = new OpenAIEmbeddingFunction(openaiApiKey);
    }

    async onModuleInit() {
        try {
            await this.initializeCollection();
            await this.initializePriceCollection();
            
            // Загружаем CSV только если коллекция пустая (первый запуск)
            const count = await this.collection.count();
            if (count === 0) {
                console.log("Collection is empty, loading CSV files...");
                await this.loadCSVFiles();
            } else {
                console.log(`Collection already has ${count} documents. Skipping CSV loading.`);
            }

            // Загружаем цены только если коллекция пустая
            const priceCount = await this.priceCollection.count();
            if (priceCount === 0) {
                console.log("Price collection is empty, loading price CSV...");
                await this.loadPriceCSV();
            } else {
                console.log(`Price collection already has ${priceCount} documents. Skipping price CSV loading.`);
            }
        } catch (error) {
            console.error("Error initializing ChromaDB:", error);
        }
    }

    /**
     * Инициализация коллекции в ChromaDB
     */
    async initializeCollection() {
        try {
            // Пытаемся получить существующую коллекцию
            // Используем кастомную embedding функцию
            this.collection = await this.chromaClient.getOrCreateCollection({
                name: this.collectionName,
                embeddingFunction: this.embedder as any,
            });
            console.log(`Collection "${this.collectionName}" initialized`);
        } catch (error) {
            console.error("Error initializing collection:", error);
            throw error;
        }
    }

    /**
     * Инициализация коллекции для цен
     */
    async initializePriceCollection() {
        try {
            this.priceCollection = await this.chromaClient.getOrCreateCollection({
                name: this.priceCollectionName,
                embeddingFunction: this.embedder as any,
            });
            console.log(`Price collection "${this.priceCollectionName}" initialized`);
        } catch (error) {
            console.error("Error initializing price collection:", error);
            throw error;
        }
    }

    /**
     * Загрузка CSV файлов из директории
     * @param forceReload - принудительная перезагрузка даже если коллекция не пустая
     */
    async loadCSVFiles(csvDirectory?: string, forceReload: boolean = false) {
        const directory = csvDirectory || process.env.CSV_KNOWLEDGE_BASE_PATH || path.join(__dirname, "../questions");
        
        if (!fs.existsSync(directory)) {
            console.warn(`Directory ${directory} does not exist. Skipping CSV loading.`);
            return;
        }

        const files = fs.readdirSync(directory).filter(file =>
            file.endsWith('.csv') && !file.includes('structured_price_list') && !file.includes('chech-list')
        );
        
        if (files.length === 0) {
            console.warn(`No CSV files found in ${directory}`);
            return;
        }

      
        if (forceReload) {
            const count = await this.collection.count();
            if (count > 0) {
                console.log(`Force reload: clearing ${count} existing documents...`);
                // Удаляем коллекцию и создаем заново
                await this.chromaClient.deleteCollection({ name: this.collectionName });
                await this.initializeCollection();
            }
        }

        for (const file of files) {
            try {
                await this.loadCSVFile(path.join(directory, file));
            } catch (error) {
                console.error(`Error loading CSV file ${file}:`, error);
            }
        }
    }

    /**
     * Загрузка одного CSV файла
     */
    private async loadCSVFile(filePath: string) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            return;
        }

        // Парсим заголовки (первая строка)
        const headers = lines[0].split(',').map(h => h.trim());
        const questionIndex = headers.findIndex(h => 
            h.toLowerCase().includes('вопрос') || 
            h.toLowerCase().includes('question') ||
            h.toLowerCase().includes('query')
        );
        const answerIndex = headers.findIndex(h => 
            h.toLowerCase().includes('ответ') || 
            h.toLowerCase().includes('answer') ||
            h.toLowerCase().includes('response')
        );

        if (questionIndex === -1 || answerIndex === -1) {
            console.warn(`CSV file ${filePath} does not have required columns (question/answer)`);
            return;
        }

        const documents: string[] = [];
        const metadatas: any[] = [];
        const ids: string[] = [];

        // Парсим данные (начиная со второй строки)
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            
            if (values.length <= Math.max(questionIndex, answerIndex)) {
                continue;
            }

            const question = values[questionIndex]?.trim();
            const answer = values[answerIndex]?.trim();

            if (!question || !answer) {
                continue;
            }

            // Создаем документ: вопрос + ответ
            const document = `Вопрос: ${question}\nОтвет: ${answer}`;
            documents.push(document);
            
            metadatas.push({
                question,
                answer,
                source: path.basename(filePath),
                row: i
            });
            
            ids.push(`${path.basename(filePath)}_${i}`);
        }

        if (documents.length > 0) {
            // Добавляем документы в коллекцию
            await this.collection.add({
                ids,
                documents,
                metadatas
            });
            console.log(`Loaded ${documents.length} documents from ${path.basename(filePath)}`);
        }
    }

    /**
     * Загрузка CSV файла с ценами
     */
    async loadPriceCSV() {
        // Используем ту же логику определения пути, что и в loadCSVFiles
        let csvDirectory = process.env.CSV_KNOWLEDGE_BASE_PATH || path.join(__dirname, "../questions");
        let csvPath = path.join(csvDirectory, "structured_price_list.csv");
        
        console.log(`Attempting to load price CSV from: ${csvPath}`);
        
        // Если файл не найден, пробуем альтернативные пути
        if (!fs.existsSync(csvPath)) {
            // Если мы в dist/, пробуем найти в исходниках (для локальной разработки)
            if (__dirname.includes('dist')) {
                const sourcePath = path.join(process.cwd(), "libs/infractructure/rag/questions/structured_price_list.csv");
                console.log(`Trying alternative path (from dist): ${sourcePath}`);
                if (fs.existsSync(sourcePath)) {
                    csvPath = sourcePath;
                } else {
                    // Пробуем относительный путь от dist
                    const relativePath = path.join(process.cwd(), "../libs/infractructure/rag/questions/structured_price_list.csv");
                    console.log(`Trying relative path: ${relativePath}`);
                    if (fs.existsSync(relativePath)) {
                        csvPath = relativePath;
                    }
                }
            } else {
                // Если не в dist, пробуем прямой путь от текущей директории
                const directPath = path.join(process.cwd(), "libs/infractructure/rag/questions/structured_price_list.csv");
                console.log(`Trying direct path: ${directPath}`);
                if (fs.existsSync(directPath)) {
                    csvPath = directPath;
                }
            }
        }
        
        if (!fs.existsSync(csvPath)) {
            console.warn(`Price CSV file not found. Tried paths:`);
            console.warn(`  1. ${path.join(csvDirectory, "structured_price_list.csv")}`);
            console.warn(`  2. ${path.join(process.cwd(), "libs/infractructure/rag/questions/structured_price_list.csv")}`);
            console.warn(`CSV_KNOWLEDGE_BASE_PATH env: ${process.env.CSV_KNOWLEDGE_BASE_PATH}`);
            console.warn(`__dirname: ${__dirname}`);
            console.warn(`process.cwd(): ${process.cwd()}`);
            return;
        }
        
        console.log(`Found price CSV file at: ${csvPath}`);

        const content = fs.readFileSync(csvPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            return;
        }

        // Парсим заголовки (первая строка)
        const headers = lines[0].split(',').map(h => h.trim());
        const categoryIndex = headers.findIndex(h => h.toLowerCase().includes('категория') || h.toLowerCase().includes('category'));
        const nameIndex = headers.findIndex(h => 
            h.toLowerCase().includes('название') || 
            h.toLowerCase().includes('товар') ||
            h.toLowerCase().includes('name') ||
            h.toLowerCase().includes('service')
        );
        const priceIndex = headers.findIndex(h => 
            h.toLowerCase().includes('цена') || 
            h.toLowerCase().includes('price') ||
            h.toLowerCase().includes('стоимость')
        );

        if (categoryIndex === -1 || nameIndex === -1 || priceIndex === -1) {
            console.warn(`Price CSV file does not have required columns (category/name/price)`);
            return;
        }

        const documents: string[] = [];
        const metadatas: any[] = [];
        const ids: string[] = [];

        // Парсим данные (начиная со второй строки)
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            
            if (values.length <= Math.max(categoryIndex, nameIndex, priceIndex)) {
                continue;
            }

            const category = values[categoryIndex]?.trim();
            const name = values[nameIndex]?.trim();
            const price = values[priceIndex]?.trim();

            if (!category || !name || !price) {
                continue;
            }

            // Создаем документ для поиска: категория + название + цена + синонимы
            // Добавляем синонимы для лучшего поиска
            let documentText = `${category} ${name} ${price} руб`;
            
            // Добавляем синонимы в документ для лучшего поиска
            const synonyms: string[] = [];
            const nameLower = name.toLowerCase();
            const categoryLower = category.toLowerCase();
            
            if (nameLower.includes('вакцинация') || categoryLower.includes('вакцинация')) {
                synonyms.push('прививка', 'вакцинация');
            }
            if (nameLower.includes('груминг') || nameLower.includes('стрижка')) {
                synonyms.push('стрижка', 'груминг');
            }
            if (nameLower.includes('кастрация')) {
                synonyms.push('кастрация', 'стерилизация');
            }
            if (nameLower.includes('стерилизация')) {
                synonyms.push('стерилизация', 'кастрация');
            }
            
            // Добавляем ключевые слова из названия для лучшего поиска
            if (synonyms.length > 0) {
                documentText += ` ${synonyms.join(' ')}`;
            }
            
            documents.push(documentText);
            
            const priceNum = parseFloat(price);
            metadatas.push({
                category,
                service_name: name,
                price: priceNum,
                price_str: price,
            });
            
            ids.push(`price_${i}`);
        }

        if (documents.length > 0) {
            await this.priceCollection.add({
                ids,
                documents,
                metadatas
            });
            console.log(`Loaded ${documents.length} price documents from structured_price_list.csv`);
        }
    }

    /**
     * Парсинг строки CSV с учетом кавычек
     */
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
    }

    /**
     * Получить коллекцию знаний
     */
    getCollection() {
        return this.collection;
    }

    /**
     * Получить коллекцию цен
     */
    getPriceCollection() {
        return this.priceCollection;
    }

    /**
     * Получить ChromaClient
     */
    getChromaClient() {
        return this.chromaClient;
    }

    /**
     * Получить embedder
     */
    getEmbedder() {
        return this.embedder;
    }
}

