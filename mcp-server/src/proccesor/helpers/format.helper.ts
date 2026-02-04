/** Форматирует кандидаты из RAG для промпта (вопрос + ответ по каждому) */
export function formatCandidatesForPrompt(
    candidates: Array<{ document: string; metadata: Record<string, unknown> }>,
): string {
    return candidates
        .map((c, i) => {
            const q = (c.metadata?.question as string) || '';
            const a = (c.metadata?.answer as string) || c.document || '';
            return `[${i + 1}] Вопрос: ${q}\nОтвет: ${a}`;
        })
        .join('\n\n');
}

/** Парсит аргументы вызова tool из ответа LLM */
export function parseToolArgs<T = Record<string, unknown>>(argsJson: string): T {
    return JSON.parse(argsJson || '{}') as T;
}

/** Уникальные значения по ключу (для массивов объектов) */
export function uniqueBy<T>(arr: T[], key: keyof T): T[] {
    const seen = new Set<unknown>();
    return arr.filter(item => {
        const k = item[key];
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}
