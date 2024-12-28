import ccxt from 'npm:ccxt';

(async () => {
    const exchange = new ccxt.bequant();
    const markets = await exchange.loadMarkets();
    const symbolInfo = markets['STOX/USDT'];
    console.log(symbolInfo);
})();
