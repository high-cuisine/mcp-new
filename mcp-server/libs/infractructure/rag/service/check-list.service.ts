import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface CheckListItem {
    /** Как обычно спрашивает клиент */
    clientPhrase: string;
    /** Услуга в Vetmanager (точное название) */
    serviceName: string;
    /** Тип визита */
    visitType: string;
    /** Тип врача */
    doctorType: string;
}

/** Парсит одну строку CSV с учётом полей в кавычках */
function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
            result.push(current.trim());
            current = '';
            if (c === '\n') break;
        } else {
            current += c;
        }
    }
    if (current.length > 0 || result.length > 0) {
        result.push(current.trim());
    }
    return result;
}

@Injectable()
export class CheckListService implements OnModuleInit {
    private items: CheckListItem[] = [];
    private csvPath: string;

    constructor() {
        const baseDir =
            process.env.CSV_KNOWLEDGE_BASE_PATH ||
            path.join(__dirname, '../questions');
        this.csvPath = path.join(baseDir, 'chech-list.csv');
    }

    async onModuleInit() {
        this.loadCheckList();
    }

    private loadCheckList() {
        try {
            if (!fs.existsSync(this.csvPath)) {
                const altPath = path.join(process.cwd(), 'libs/infractructure/rag/questions/chech-list.csv');
                if (fs.existsSync(altPath)) {
                    this.csvPath = altPath;
                } else {
                    return;
                }
            }
            const content = fs.readFileSync(this.csvPath, 'utf-8');
            const lines = content.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length < 2) return;
            for (let i = 1; i < lines.length; i++) {
                const parts = parseCsvLine(lines[i]);
                if (parts.length >= 4) {
                    this.items.push({
                        clientPhrase: parts[0].replace(/^"|"$/g, '').trim(),
                        serviceName: parts[1].replace(/^"|"$/g, '').trim(),
                        visitType: parts[2].replace(/^"|"$/g, '').trim(),
                        doctorType: parts[3].replace(/^"|"$/g, '').trim(),
                    });
                }
            }
        } catch (e) {
            console.warn('CheckListService: could not load chech-list.csv', e);
        }
    }

    /**
     * Ищет подходящую строку по жалобе клиента.
     * Сравнивает нормализованный запрос с колонкой "Как обычно спрашивает клиент":
     * если фраза из CSV содержится в запросе или запрос в фразе — считаем совпадением.
     * При нескольких совпадениях возвращаем наиболее специфичное (длинную фразу).
     */
    findMatch(clientQuery: string): CheckListItem | null {
        const query = (clientQuery || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!query || this.items.length === 0) return null;
        const matches: CheckListItem[] = [];
        for (const item of this.items) {
            const phrase = item.clientPhrase.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!phrase) continue;
            if (query.includes(phrase) || phrase.includes(query)) {
                matches.push(item);
            }
        }
        if (matches.length === 0) return null;
        // Возвращаем наиболее специфичное совпадение (самая длинная фраза)
        matches.sort((a, b) => b.clientPhrase.length - a.clientPhrase.length);
        return matches[0];
    }
}
