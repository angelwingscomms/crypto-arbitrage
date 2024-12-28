import { calculateProfitWithFees, compareSymbol, getSymbols, PriceDetails, SymbolDetails } from "./index.ts";
import ccxt from 'npm:ccxt'
import fs from 'node:fs'

// Scan and identify arbitrage opportunities
async function scan() {
  console.log('Started scanning');

  const exchanges: { [id: string]: any } = {};
  let prices: { [symbol: string]: PriceDetails } = {};
  const symbols = await getSymbols();
  const baseCurrencies = ['USDC', 'USDT'];
  const targetSymbols = ['SOL/USDT'];

  const filteredSymbols = Object.entries(symbols)
    .filter(([symbol, value]) =>
      // targetSymbols.some((s) => symbol.includes(s)) &&
      baseCurrencies.some((base) => symbol.includes(base)) &&
      value.length > 1 &&
      /^[^-]+$/.test(symbol)
    )
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as SymbolDetails);

  for (const [symbol, exchangeIds] of Object.entries(filteredSymbols)) {
    for (const exchangeId of exchangeIds) {
      if (!exchanges[exchangeId]) {
        try {
          const exchange = new ccxt[exchangeId]();
          await exchange.loadMarkets();
          exchanges[exchangeId] = exchange;
        } catch (e) {
          console.error('Error loading exchange', exchangeId, ':', e);
        }
      }
    }
  }

  for (const [symbol, exchangeIds] of Object.entries(filteredSymbols)) {
    console.log('Analyzing', symbol);
    const symbolExchanges = exchangeIds.map((id) => exchanges[id]).filter(Boolean);
    const minmax = await compareSymbol(symbolExchanges, symbol);
    if (!minmax) continue;

    const diff = calculateProfitWithFees(minmax[0], minmax[1], 1);
    const ratio = (diff / minmax[1].price) * 100;

    prices[symbol] = { diff, ratio, profit: diff, min: minmax[0], max: minmax[1] };
  }

  prices = Object.fromEntries(
    Object.entries(prices).sort(([, a], [, b]) => b.ratio - a.ratio)
  );

  console.log('Arbitrage Opportunities:', prices);
  await fs.writeFile(`prices${Date.now()}.json`, JSON.stringify(prices, null, 2));

  // const minProfit = 1;
  // const userAmount = 36; // Example input amount

  // for (const symbol in prices) {
  //   const opportunity = prices[symbol];
  //   const profit = calculateProfitWithFees(opportunity.min, opportunity.max, userAmount);

  //   if (profit > minProfit) {
  //     await executeTrade(opportunity, userAmount);
  //   }
  // }
}

scan().catch(console.error);