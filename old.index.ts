import ccxt from 'ccxt';
import { promises as fs } from 'node:fs';

// Types
type PriceRes = [string, number, boolean];

type SymbolDetails = {
  [symbol: string]: string[];
};

type PriceDetails = {
  diff: number;
  min: PriceRes;
  max: PriceRes;
};

async function isDex(exchange: any): Promise<boolean> {
  return Boolean(exchange.options?.isDex);
}

async function fetchPrice(exchange: any, symbol: string): Promise<PriceRes | null> {
  console.log('checking', symbol, 'on', exchange.id);
  try {
    const ticker = await exchange.fetchTicker(symbol);
    return [exchange.name, ticker.last, await isDex(exchange)];
  } catch (e) {
    console.error(e.constructor.name, e.message);
    return null;
  }
}

async function compareSymbol(exchanges: any[], symbol: string): Promise<[PriceRes, PriceRes] | null> {
  console.log('comparing', symbol);
  const results = (await Promise.all(exchanges.map((exchange) => fetchPrice(exchange, symbol)))).filter(
    (result): result is PriceRes => result !== null && result[1] !== null
  );

  if (results.length === 0) {
    console.log('no valid results in compareSymbol for', symbol);
    return null;
  }

  return [
    results.reduce((min, res) => (res[1] < min[1] ? res : min)),
    results.reduce((max, res) => (res[1] > max[1] ? res : max)),
  ];
}

async function collectSymbols() {
  console.log('started collecting symbols');

  const exchanges: any[] = [];
  const symbols: SymbolDetails = {};

  for (const exchangeId of ccxt.exchanges) {
    try {
      const exchange = new ccxt[exchangeId]();
      await exchange.loadMarkets();
      exchanges.push(exchange);
    } catch (e) {
      console.error(`Error processing exchange ${exchangeId}: ${e}`);
    }
  }

  for (const exchange of exchanges) {
    try {
      if (!Array.isArray(exchange.symbols)) continue;
      for (const sym of exchange.symbols) {
        if (!symbols[sym]) symbols[sym] = [];
        symbols[sym].push(exchange.id);
      }
    } catch (e) {
      console.error(`Error processing exchange ${exchange.id}: ${e}`);
    }
  }

  await fs.writeFile('symbols.json', JSON.stringify(symbols, null, 2));
  console.log(symbols);
}

async function getSymbols(): Promise<SymbolDetails> {
  const data = await fs.readFile('symbols.json', 'utf-8');
  return JSON.parse(data);
}

async function scan() {
  console.log('started');

  const exchanges: { [id: string]: any } = {};
  let prices: { [symbol: string]: PriceDetails } = {};
  const symbols = await getSymbols();
  const baseCurrencies = ['USDC', 'USDT'];
  const targetSymbols = ['XRP3S'];

  const filteredSymbols = Object.entries(symbols)
    .filter(([symbol]) =>
      targetSymbols.some((s) => symbol.includes(s)) &&
      baseCurrencies.some((base) => symbol.includes(base))
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
          console.log('loading', exchangeId);
          await exchange.loadMarkets();
          exchanges[exchangeId] = exchange;
          console.log('loaded', exchangeId);
        } catch (e) {
          console.error('exception with', exchangeId, ':', e);
        }
      }
    }
  }

  console.log('ex len', Object.keys(exchanges).length);

  for (const [symbol, exchangeIds] of Object.entries(filteredSymbols)) {
    console.log('starting', symbol);
    const symbolExchanges = exchangeIds.map((id) => exchanges[id]).filter(Boolean);
    const minmax = await compareSymbol(symbolExchanges, symbol);
    if (!minmax) continue;

    prices[symbol] = {
      diff: minmax[1][1] - minmax[0][1],
      min: minmax[0],
      max: minmax[1],
    };
  }

  prices = Object.fromEntries(
    Object.entries(prices).sort(([, a], [, b]) => a.diff - b.diff)
  );

  console.log(prices);
  await fs.writeFile('prices.json', JSON.stringify(prices, null, 2));
}

// Execute the scan function
scan().catch(console.error);
