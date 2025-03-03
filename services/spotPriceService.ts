import axios from 'axios';

export interface SpotPrice {
  price: number;
  timestamp: string;
}

class SpotPriceService {
  private headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36'
  };

  async getCurrentSpotPrice(): Promise<SpotPrice> {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://www.vattenfall.fi/api/price/spot/${today}/${today}?lang=fi`;

    try {
      const response = await axios.get(url, { headers: this.headers });
      const data = response.data;

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No price data available');
      }

      const now = new Date();
      const currentHourPrice = data.find((price: any) => {
        const priceDate = new Date(price.timeStamp);
        return priceDate.getHours() === now.getHours();
      });

      if (!currentHourPrice) {
        throw new Error('Current hour price not found');
      }

      // Add VAT (24%) to the price and convert to cents/kWh
      const VAT_RATE = 0.24;
      const priceWithVAT = currentHourPrice.value * (1 + VAT_RATE);

      return {
        price: Number(priceWithVAT.toFixed(2)),
        timestamp: currentHourPrice.timeStamp
      };
    } catch (error) {
      console.error('Failed to fetch current spot price:', error);
      throw error;
    }
  }
}

export default new SpotPriceService();