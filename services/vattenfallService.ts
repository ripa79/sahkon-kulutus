import axios from 'axios';
import * as FileSystem from 'expo-file-system';

interface PriceData {
  timeStamp: string;
  value: number;
}

class VattenfallService {
  private headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36'
  };

  private getCacheFilePath(year: string) {
    return `${FileSystem.documentDirectory}vattenfall_hinnat_${year}.csv`;
  }

  private async clearCache(year: string) {
    try {
      const cacheFilePath = this.getCacheFilePath(year);
      const cacheExists = await FileSystem.getInfoAsync(cacheFilePath);
      if (cacheExists.exists) {
        try {
          await FileSystem.deleteAsync(cacheFilePath, { idempotent: true });
        } catch (error) {
          console.log('Cache clear failed, continuing with fresh data fetch');
        }
      }
    } catch (error) {
      console.log('Cache check failed, continuing with fresh data fetch');
    }
  }

  async fetchPriceData(year: string = new Date().getFullYear().toString()): Promise<PriceData[]> {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const url = `https://www.vattenfall.fi/api/price/spot/${startDate}/${endDate}?lang=fi`;

    try {
      // Try to clear cache but don't let it block the fetch
      await this.clearCache(year).catch(() => {});

      // Always fetch fresh data
      const response = await axios.get(url, { headers: this.headers });
      const data: PriceData[] = response.data;

      // Add VAT (25.5%) to the values and normalize timestamps
      const VAT_RATE = 0.255;
      const processedData = data.map(row => ({
        ...row,
        timeStamp: new Date(row.timeStamp).toISOString().replace(/\.000Z$/, 'Z'),
        value: Number((row.value * (1 + VAT_RATE)).toFixed(2))
      }));

      // Save to cache asynchronously but don't wait for it
      const saveCache = async () => {
        try {
          const csvContent = this.convertToCSV(processedData);
          await FileSystem.writeAsStringAsync(this.getCacheFilePath(year), csvContent);
        } catch (err: unknown) {
          console.log('Failed to save cache, but data was fetched successfully');
        }
      };
      saveCache();

      return processedData;
    } catch (error) {
      console.error('Failed to fetch Vattenfall price data:', error);
      throw error;
    }
  }

  private convertToCSV(data: PriceData[]): string {
    if (!data || data.length === 0) return '';
    
    const csvRows = [
      'timeStamp;value',
      ...data.map(row => `${row.timeStamp};${row.value}`)
    ];
    
    return csvRows.join('\n');
  }

  private parseCSV(csvContent: string): PriceData[] {
    const rows = csvContent.split('\n');
    // Skip header row
    return rows.slice(1).map(row => {
      const [timeStamp, value] = row.split(';');
      return {
        timeStamp,
        value: Number(value)
      };
    });
  }

  getCurrentPrice(prices: PriceData[]): number | null {
    if (!prices || prices.length === 0) return null;

    const now = new Date();
    // Find the price for the current hour, don't check the year
    const currentPrice = prices.find(price => {
      const priceDate = new Date(price.timeStamp);
      return priceDate.getHours() === now.getHours() &&
             priceDate.getDate() === now.getDate() &&
             priceDate.getMonth() === now.getMonth();
    });

    return currentPrice?.value ?? null;
  }
}

export default new VattenfallService();