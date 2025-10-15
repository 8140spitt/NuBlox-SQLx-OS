import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadTDL(packPath: string): Promise<any> {
    const full = path.resolve(packPath);
    const raw = await readFile(full, 'utf8');
    return JSON.parse(raw);
}
