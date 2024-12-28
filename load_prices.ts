import fs from 'node:fs'
import { PriceDetails, Prices } from './index.ts';

export function load_prices(): Prices {
  return JSON.parse(fs.readFileSync("prices.json", "utf-8"));
}