import { promises as fs } from "node:fs";
import { type PriceDetails } from "./index.ts";
import { load_prices } from "./load_prices.ts";

let data = load_prices()
const regex = /^(?!.*\d[a-zA-Z]\/).*$/;

data = Object.keys(data)
  .filter((key) => regex.test(key))
  .reduce((res, key) => {
    res[key] = data[key];
    return res;
  }, {});
// data = Object.fromEntries(
//   Object.entries(data).sort(([, a], [, b]) => b.ratio - a.ratio),
// )
await fs.writeFile(`prices-filtered.json`, JSON.stringify(data, null, 2));
console.log("filtered");
