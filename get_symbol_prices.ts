import { fetchPriceWithFees, getSymbols, PriceRes } from "./index.ts";
import ccxt, {Exchange} from 'npm:ccxt'

export async function get_symbol_prices(
  symbol: string,
): Promise<PriceRes[] | null> {
  const symbols = await getSymbols();
  if (!(symbol in symbols)) return null;
  const exchangeIds = symbols[symbol];
  const exchanges: Exchange = []
  for (const id of exchangeIds) {
    try {
      const x = new ccxt[id]();
      await x.loadMarkets();
      exchanges.push(x)
    } catch {
      console.error('failed to load exchange:', id)
    }
  }
  console.log("Comparing", symbol);
  const results = (
    await Promise.all(
      exchanges.map((exchange: Exchange) => fetchPriceWithFees(exchange, symbol)),
    )
  ).filter(
    (result: PriceRes | null): result is PriceRes => result !== null && result.price !== null,
  );

  if (results.length === 0) {
    console.log("No valid results for", symbol);
    return null;
  } else {
    return results;
  }
}
(async() => {
  let prices = await get_symbol_prices("ALI/USDT")
  console.info(prices)
})()