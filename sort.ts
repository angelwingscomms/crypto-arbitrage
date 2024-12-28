import { promises as fs } from "node:fs";
import { type PriceDetails } from "./index.ts";

const data_ = await fs.readFile("prices.json", "utf-8");
let data: { [symbol: string]: PriceDetails } = JSON.parse(data_);
data = Object.fromEntries(
  Object.entries(data).sort(([, a], [, b]) => b.ratio - a.ratio),
)
await fs.writeFile(
  `prices-filtered.json`,
  JSON.stringify(data, null, 2),
);
console.log("sorted");