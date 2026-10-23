import os from 'node:os';
import { readFile, readdir, statfs } from 'node:fs/promises';

export function parseNetworkCounters(text: string): Map<string, { rx: number; tx: number }> {
    const result = new Map<string, { rx: number; tx: number }>();
    for (const line of text.split('\n')) {
        const [label, values] = line.split(':');
        if (!values || label.trim() === 'lo') continue;
        const fields = values.trim().split(/\s+/).map(Number);
        if (fields.length >= 16 && Number.isSafeInteger(fields[0]) && Number.isSafeInteger(fields[8])) {
            result.set(label.trim(), { rx: fields[0], tx: fields[8] });
        }
    }
    return result;
}
export function networkDelta(
    previous: ReturnType<typeof parseNetworkCounters> | null,
    current: ReturnType<typeof parseNetworkCounters> | null
) {
    if (!previous || !current) return null;
    let rx = 0;
    let tx = 0;
    let comparable = false;
    for (const [name, value] of current) {
        const old = previous.get(name);
        if (!old || value.rx < old.rx || value.tx < old.tx) continue;
        rx += value.rx - old.rx;
        tx += value.tx - old.tx;
        comparable = true;
    }
    return comparable ? { rx, tx } : null;
}
export async function readNetwork() {
    if (process.platform !== 'linux') return null;
    try {
        return parseNetworkCounters(await readFile('/proc/net/dev', 'utf8'));
    } catch {
        return null;
    }
}
export function cpuTicks() {
    return os.cpus().reduce(
        (value, cpu) => {
            value.idle += cpu.times.idle;
            value.total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
            return value;
        },
        { idle: 0, total: 0 }
    );
}
export async function readDisk() {
    try {
        const disk = await statfs(process.cwd());
        return { total: disk.blocks * disk.bsize, available: disk.bavail * disk.bsize };
    } catch {
        return null;
    }
}
export async function readOpenFileDescriptors() {
    if (process.platform !== 'linux') return null;
    try {
        return (await readdir('/proc/self/fd')).length;
    } catch {
        return null;
    }
}
