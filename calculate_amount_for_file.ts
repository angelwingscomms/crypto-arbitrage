import { load_prices } from "./load_prices.ts";
import { write } from "./write.ts";

type Price = {
  price: number;
  name: string;
};

(async () => {
  const amount = 10.44;
  const data = load_prices();

  let new_data: {
    [symbol: string]: { profit: number; min: Price; max: Price };
  } = {};
  for (const k in data) {
    let gross_profit =
      (amount / data[k]["min"]["price"]) * data[k]["max"]["price"];

    new_data[k] = {
      profit: gross_profit - amount,
      min: {
        name: data[k]["min"]["exchangeName"],
        price: data[k]["min"]["price"],
      },
      max: {
        name: data[k]["max"]["exchangeName"],
        price: data[k]["max"]["price"],
      },
    };
  }

  new_data = Object.fromEntries(
    Object.entries(new_data).sort(([, a], [, b]) => b.profit - a.profit),
  );

  const regex = /^(?!.*\d[a-zA-Z]\/).*$/;

  new_data = Object.keys(data)
    .filter((key) => regex.test(key))
    .reduce((res, key) => {
      res[key] = new_data[key];
      return res;
    }, {});

  write(new_data, "new_data");
})();
