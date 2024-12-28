import { Prices } from './index.ts';
import fs from 'node:fs';
export function write(data: any, name: string) {
  fs.writeFileSync(`${name}.json`, JSON.stringify(data, null, 2));
}