import { Injectable } from "@nestjs/common";
import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from "@infra/redis/redis.service";

@Injectable()
export class DocumentParserService {
    constructor(
        private readonly redisService: RedisService,
    ) {}

    async ParseDocument() {
        // Заглушка под будущий функционал
    }

    /**
     * Парсит текстовое расписание из text.txt и сохраняет дни в Redis (zset "timetable").
     * Элемент zset: JSON с { date: ISO, items: string[] }, score = timestamp дня.
     */
    async ParseTimeTable() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const monthMap: Record<string, number> = {
            'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
            'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
            'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12,
        };

        const year = new Date().getFullYear();
        const days: Array<{ date: string; items: string[] }> = [];
        let current: { date: string; items: string[] } | null = null;
        const dateLine = /^(\d{1,2})\s+([А-Яа-яёЁ]+)$/;

        for (const line of lines) {
            const match = line.match(dateLine);
            if (match) {
                if (current) days.push(current);
                const day = parseInt(match[1], 10);
                const monthName = match[2].toLowerCase();
                const month = monthMap[monthName];
                if (!month) {
                    throw new Error(`Неизвестный месяц в строке: "${line}"`);
                }
                const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString().split('T')[0];
                current = { date: isoDate, items: [] };
            } else if (current) {
                current.items.push(line);
            }
        }
        if (current) days.push(current);

        const zsetKey = 'timetable';
        await this.redisService.delete(zsetKey);

        for (const day of days) {
            const score = new Date(day.date + 'T00:00:00Z').getTime();
            await this.redisService.zadd(zsetKey, score, JSON.stringify(day));
        }

        return days;
    }

    /**
     * Парсит раздел "Состав врачей" и сохраняет в Redis hash "doctors":
     * поле — фамилия, значение — JSON с { lastName, details[] }.
     */
    async parseDoctors() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.toLowerCase().includes('узкие специалисты'));
        if (startIdx === -1) return [];

        const doctors: Array<{ lastName: string; details: string[] }> = [];
        const isName = (line: string) => /^[А-ЯЁ][а-яё]+$/.test(line);

        let current: { lastName: string; details: string[] } | null = null;
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('Чего у нас нет') || line.startsWith('3. ')) break;
            if (line.startsWith('Дежурные врачи')) {
                // продолжаем — далее тоже имена
                continue;
            }

            if (isName(line)) {
                if (current) doctors.push(current);
                current = { lastName: line, details: [] };
            } else if (current) {
                const cleaned = line.replace(/[;]+$/, '').trim();
                current.details.push(cleaned);
            }
        }
        if (current) doctors.push(current);

        const hashKey = 'doctors';
        for (const doc of doctors) {
            await this.redisService.hset(hashKey, doc.lastName, JSON.stringify(doc));
        }

        return doctors;
    }

    /**
     * Парсит раздел 3.x "Правила записи на приём к врачам" и сохраняет в Redis:
     * - ключ "rules:reception:index" — JSON с индексом пунктов (3.1, 3.2, 3.3);
     * - hash "rules:reception:items" — поле = код пункта, значение = JSON с содержимым.
     *
     * 3.1–3.2 считаются правилами для врачей (type = "doctors"),
     * 3.3 — общие правила (type = "general").
     */
    async parseReceptionRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('3. Правила записи'));
        if (startIdx === -1) return [];

        type Section = {
            code: string;
            title: string;
            type: 'doctors' | 'general';
            doctors?: string[];
            lines: string[];
        };

        const sections: Section[] = [];
        let current: Section | null = null;
        const sectionHeaderRe = /^(3\.[123])\.\s*(.+)$/;

        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('4. ')) break; // следующий раздел, выходим

            const m = line.match(sectionHeaderRe);
            if (m) {
                if (current) sections.push(current);
                const code = m[1];
                const title = m[2];
                const type: Section['type'] = code === '3.3' ? 'general' : 'doctors';

                let doctors: string[] | undefined;
                if (code === '3.1') {
                    // "Ступакова, Афанасьева, Кудинова, Тетерина"
                    doctors = title.split(',').map(s => s.trim()).filter(Boolean);
                } else if (code === '3.2') {
                    // "Кардиология — Храмцова"
                    const parts = title.split('—').map(s => s.trim());
                    const lastName = parts[1] || parts[0];
                    doctors = [lastName];
                }

                current = { code, title, type, doctors, lines: [] };
            } else if (current) {
                current.lines.push(line);
            }
        }
        if (current) sections.push(current);

        // Индекс
        const indexKey = 'rules:reception:index';
        const itemsKey = 'rules:reception:items';

        const indexPayload = sections.map(s => ({
            code: s.code,
            type: s.type,
            title: s.title,
        }));
        await this.redisService.set(indexKey, JSON.stringify(indexPayload));

        for (const s of sections) {
            await this.redisService.hset(itemsKey, s.code, JSON.stringify(s));
        }

        return sections;
    }

    /**
     * Парсит раздел 4.x "Хирургия (Ступакова)" и сохраняет в Redis:
     * - ключ "rules:surgery:index" — JSON с индексом пунктов (4, 4.1, 4.2, 4.3);
     * - hash "rules:surgery:items" — поле = код пункта, значение = JSON с содержимым.
     */
    async parseSurgeryRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('4. Хирургия'));
        if (startIdx === -1) return [];

        type Section = {
            code: string;
            title: string;
            lines: string[];
        };

        const sections: Section[] = [];
        let current: Section | null = null;
        const headerLine = lines[startIdx];
        const mainTitle = headerLine.replace(/^4\.\s*/, '').trim(); // "Хирургия (Ступакова)"
        current = { code: '4', title: mainTitle, lines: [] };

        const subsectionRe = /^(4\.\d+)\.\s*(.+)$/;

        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('5. ')) break; // следующий большой раздел

            const m = line.match(subsectionRe);
            if (m) {
                if (current) sections.push(current);
                const code = m[1];      // "4.1", "4.2", "4.3"
                const title = m[2];     // заголовок подпункта
                current = { code, title, lines: [] };
            } else if (current) {
                current.lines.push(line);
            }
        }
        if (current) sections.push(current);

        const indexKey = 'rules:surgery:index';
        const itemsKey = 'rules:surgery:items';

        const indexPayload = sections.map(s => ({
            code: s.code,
            title: s.title,
        }));
        await this.redisService.set(indexKey, JSON.stringify(indexPayload));

        for (const s of sections) {
            await this.redisService.hset(itemsKey, s.code, JSON.stringify(s));
        }

        return sections;
    }

    /**
     * Парсит раздел 5 "Стоматологические операции" и сохраняет в Redis:
     * - ключ "rules:dentistry:index" — JSON с индексом пунктов (пока один: 5);
     * - hash "rules:dentistry:items" — поле = "5", значение = JSON с содержимым.
     */
    async parseDentistryRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('5. Стоматологические операции'));
        if (startIdx === -1) return [];

        const headerLine = lines[startIdx];
        const title = headerLine.replace(/^5\.\s*/, '').trim(); // "Стоматологические операции (10 февраля)"

        const sectionLines: string[] = [];
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('6. ')) break; // следующий раздел — кардиология
            sectionLines.push(line);
        }

        const section = {
            code: '5',
            title,
            lines: sectionLines,
        };

        const indexKey = 'rules:dentistry:index';
        const itemsKey = 'rules:dentistry:items';

        await this.redisService.set(indexKey, JSON.stringify([{ code: section.code, title: section.title }]));
        await this.redisService.hset(itemsKey, section.code, JSON.stringify(section));

        return section;
    }

    /**
     * Парсит раздел 6 "Кардиология (Храмцова)" и сохраняет в Redis:
     * - ключ "rules:cardiology:index" — JSON с индексом пунктов (один: 6);
     * - hash "rules:cardiology:items" — поле = "6", значение = JSON с содержимым.
     */
    async parseCardiologyRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('6. Кардиология'));
        if (startIdx === -1) return [];

        const headerLine = lines[startIdx];
        const title = headerLine.replace(/^6\.\s*/, '').trim(); // "Кардиология (Храмцова)"

        const sectionLines: string[] = [];
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('7. ')) break; // следующий раздел — процедуры
            sectionLines.push(line);
        }

        const section = {
            code: '6',
            title,
            lines: sectionLines,
        };

        const indexKey = 'rules:cardiology:index';
        const itemsKey = 'rules:cardiology:items';

        await this.redisService.set(indexKey, JSON.stringify([{ code: section.code, title: section.title }]));
        await this.redisService.hset(itemsKey, section.code, JSON.stringify(section));

        return section;
    }

    /**
     * Парсит раздел 7.x "Процедуры и работа фельдшеров" и сохраняет в Redis:
     * - ключ "rules:procedures:index" — JSON с индексом пунктов (7, 7.1, 7.2, 7.3);
     * - hash "rules:procedures:items" — поле = код пункта, значение = JSON с содержимым.
     */
    async parseProceduresRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('7. Процедуры и работа фельдшеров'));
        if (startIdx === -1) return [];

        type Section = {
            code: string;
            title: string;
            lines: string[];
        };

        const sections: Section[] = [];
        let current: Section | null = null;

        // Главный заголовок 7.
        const headerLine = lines[startIdx];
        const mainTitle = headerLine.replace(/^7\.\s*/, '').trim();
        current = { code: '7', title: mainTitle, lines: [] };

        const subsectionRe = /^(7\.\d+)\.\s*(.+)$/;

        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('8. ')) break; // следующий крупный раздел

            const m = line.match(subsectionRe);
            if (m) {
                // сохраняем предыдущий блок (7 или 7.x)
                if (current) sections.push(current);
                const code = m[1];      // "7.1", "7.2", "7.3"
                const title = m[2];     // заголовок подпункта
                current = { code, title, lines: [] };
            } else if (current) {
                current.lines.push(line);
            }
        }
        if (current) sections.push(current);

        const indexKey = 'rules:procedures:index';
        const itemsKey = 'rules:procedures:items';

        const indexPayload = sections.map(s => ({
            code: s.code,
            title: s.title,
        }));
        await this.redisService.set(indexKey, JSON.stringify(indexPayload));

        for (const s of sections) {
            await this.redisService.hset(itemsKey, s.code, JSON.stringify(s));
        }

        return sections;
    }

    /**
     * Парсит раздел 8 "УЗИ брюшной и грудной полости" и сохраняет в Redis:
     * - ключ "rules:ultrasound:index" — JSON с индексом пунктов (один: 8);
     * - hash "rules:ultrasound:items" — поле = "8", значение = JSON с содержимым.
     */
    async parseUltrasoundRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('8. УЗИ брюшной и грудной полости'));
        if (startIdx === -1) return [];

        const headerLine = lines[startIdx];
        const title = headerLine.replace(/^8\.\s*/, '').trim(); // "УЗИ брюшной и грудной полости"

        const sectionLines: string[] = [];
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('9. ')) break; // следующий раздел — лаборатория
            sectionLines.push(line);
        }

        const section = {
            code: '8',
            title,
            lines: sectionLines,
        };

        const indexKey = 'rules:ultrasound:index';
        const itemsKey = 'rules:ultrasound:items';

        await this.redisService.set(indexKey, JSON.stringify([{ code: section.code, title: section.title }]));
        await this.redisService.hset(itemsKey, section.code, JSON.stringify(section));

        return section;
    }

    /**
     * Парсит раздел 9.x "Лаборатория" и сохраняет в Redis:
     * - ключ "rules:laboratory:index" — JSON с индексом пунктов (9, 9.1, 9.2, 9.3);
     * - hash "rules:laboratory:items" — поле = код пункта, значение = JSON с содержимым.
     */
    async parseLaboratoryRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('9. Лаборатория'));
        if (startIdx === -1) return [];

        type Section = {
            code: string;
            title: string;
            lines: string[];
        };

        const sections: Section[] = [];
        let current: Section | null = null;

        // Главный заголовок 9.
        const headerLine = lines[startIdx];
        const mainTitle = headerLine.replace(/^9\.\s*/, '').trim();
        current = { code: '9', title: mainTitle, lines: [] };

        const subsectionRe = /^(9\.\d+)\.\s*(.+)$/;

        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('10. ')) break; // следующий крупный раздел

            const m = line.match(subsectionRe);
            if (m) {
                // сохраняем предыдущий блок (9 или 9.x)
                if (current) sections.push(current);
                const code = m[1];      // "9.1", "9.2", "9.3"
                const title = m[2];     // заголовок подпункта
                current = { code, title, lines: [] };
            } else if (current) {
                current.lines.push(line);
            }
        }
        if (current) sections.push(current);

        const indexKeyLab = 'rules:laboratory:index';
        const itemsKeyLab = 'rules:laboratory:items';

        const indexPayload = sections.map(s => ({
            code: s.code,
            title: s.title,
        }));
        await this.redisService.set(indexKeyLab, JSON.stringify(indexPayload));

        for (const s of sections) {
            await this.redisService.hset(itemsKeyLab, s.code, JSON.stringify(s));
        }

        return sections;
    }

    /**
     * Парсит раздел 10.x "Назначения сторонних клиник: препараты и анализы" и сохраняет в Redis:
     * - ключ "rules:external:index" — JSON с индексом пунктов (10, 10.1, 10.2);
     * - hash "rules:external:items" — поле = код пункта, значение = JSON с содержимым.
     */
    async parseExternalClinicRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('10. Назначения сторонних клиник'));
        if (startIdx === -1) return [];

        type Section = {
            code: string;
            title: string;
            lines: string[];
        };

        const sections: Section[] = [];
        let current: Section | null = null;

        // Главный заголовок 10.
        const headerLine = lines[startIdx];
        const mainTitle = headerLine.replace(/^10\.\s*/, '').trim();
        current = { code: '10', title: mainTitle, lines: [] };

        const subsectionRe = /^(10\.\d+)\.\s*(.+)$/;

        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('11. ')) break; // следующий крупный раздел

            const m = line.match(subsectionRe);
            if (m) {
                // сохраняем предыдущий блок (10 или 10.x)
                if (current) sections.push(current);
                const code = m[1];      // "10.1", "10.2"
                const title = m[2];     // заголовок подпункта
                current = { code, title, lines: [] };
            } else if (current) {
                current.lines.push(line);
            }
        }
        if (current) sections.push(current);

        const indexKey = 'rules:external:index';
        const itemsKey = 'rules:external:items';

        const indexPayload = sections.map(s => ({
            code: s.code,
            title: s.title,
        }));
        await this.redisService.set(indexKey, JSON.stringify(indexPayload));

        for (const s of sections) {
            await this.redisService.hset(itemsKey, s.code, JSON.stringify(s));
        }

        return sections;
    }

    /**
     * Парсит раздел 11 "Стационар" и сохраняет в Redis:
     * - ключ "rules:stationary:index" — JSON с индексом пунктов (один: 11);
     * - hash "rules:stationary:items" — поле = "11", значение = JSON с содержимым.
     */
    async parseStationaryRules() {
        const filePath = path.resolve(process.cwd(), 'libs/infractructure/documentParser/text.txt');
        const raw = fs.readFileSync(filePath, 'utf8');
        const lines = raw
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        const startIdx = lines.findIndex(l => l.startsWith('11. Стационар'));
        if (startIdx === -1) return null;

        const headerLine = lines[startIdx];
        const title = headerLine.replace(/^11\.\s*/, '').trim(); // "Стационар"

        const sectionLines: string[] = [];
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (/^\d+\.\s/.test(line)) break; // на всякий случай остановка на следующем разделе
            if (!line) continue;
            sectionLines.push(line);
        }

        const section = {
            code: '11',
            title,
            lines: sectionLines,
        };

        const indexKey = 'rules:stationary:index';
        const itemsKey = 'rules:stationary:items';

        await this.redisService.set(indexKey, JSON.stringify([{ code: section.code, title: section.title }]));
        await this.redisService.hset(itemsKey, section.code, JSON.stringify(section));

        return section;
    }
}