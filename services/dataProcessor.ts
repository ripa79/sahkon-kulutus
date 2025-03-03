import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import eleniaService from './eleniaService';
import vattenfallService from './vattenfallService';

export interface CombinedData {
    timestamp: string;
    consumption_kWh: number;
    price_cents_per_kWh: number;
    cost_euros: number;
}

export interface MonthlyData {
    month: string;
    totalConsumption: number;
    averagePrice: number;
    totalCost: number;
}

export interface YearData {
    lastUpdated: string;
    hourly: CombinedData[];
    monthly: MonthlyData[];
}

class DataProcessor {
    private cacheDir: string;

    constructor() {
        this.cacheDir = `${FileSystem.cacheDirectory}data/`;
    }

    private getCacheFilePath(year: string): string {
        return `${this.cacheDir}combined_data_${year}.json`;
    }

    private async ensureCacheDirectory(): Promise<void> {
        const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
        }
    }

    private shouldUpdateData(lastUpdated: string | null): boolean {
        if (!lastUpdated) return true;
        
        const lastUpdate = new Date(lastUpdated);
        const now = new Date();
        
        // If it's the current year, update if the last update was not today
        const isCurrentYear = lastUpdate.getFullYear() === now.getFullYear();
        if (isCurrentYear) {
            return lastUpdate.getDate() !== now.getDate() ||
                   lastUpdate.getMonth() !== now.getMonth();
        }
        
        // For past years, no need to update
        return false;
    }

    async getCachedData(year: string): Promise<YearData | null> {
        try {
            const filePath = this.getCacheFilePath(year);
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) return null;

            const content = await FileSystem.readAsStringAsync(filePath);
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading cached data:', error);
            return null;
        }
    }

    private async saveToCache(year: string, data: YearData): Promise<void> {
        try {
            await this.ensureCacheDirectory();
            const filePath = this.getCacheFilePath(year);
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    }

    async combineData(year: string = new Date().getFullYear().toString()): Promise<YearData> {
        // Try to get cached data first
        const cachedData = await this.getCachedData(year);
        if (cachedData && !this.shouldUpdateData(cachedData.lastUpdated)) {
            return cachedData;
        }

        try {
            // Fetch consumption data from Elenia
            const responses = await eleniaService.fetchConsumptionData(year);
            console.warn(`[DataProcessor] Processing ${responses.length} responses for year ${year}`);
            
            const pricesArray = await vattenfallService.fetchPriceData(year);
            console.warn(`[DataProcessor] Received ${pricesArray.length} price entries`);
            
            // Normalize timestamps in price data
            const prices = new Map(pricesArray.map(p => {
                const date = new Date(p.timeStamp);
                const normalizedTimestamp = date.toISOString().replace(/\.000Z$/, 'Z');
                return [normalizedTimestamp, p.value];
            }));
            
            console.warn(`[DataProcessor] Created price map with ${prices.size} entries`);

            // Sample a few prices to verify data
            if (pricesArray.length > 0) {
                const sampleSize = Math.min(3, pricesArray.length);
                const samples = pricesArray.slice(0, sampleSize).map(p => ({
                    originalTimestamp: p.timeStamp,
                    normalizedTimestamp: new Date(p.timeStamp).toISOString().replace(/\.000Z$/, 'Z'),
                    value: p.value
                }));
                console.warn(`[DataProcessor] Sample price entries:`, samples);
            }

            const combinedData: CombinedData[] = [];
            const monthlyDataMap = new Map<string, MonthlyData>();

            // Process consumption data and combine with prices
            for (const response of responses) {
                for (const month of response.months || []) {
                    // Try hourly_values first since that's what we see in the logs
                    let readings = month.hourly_values;
                    let readingsSource = 'hourly_values';
                    
                    // Only fallback to hourly_values_netted if hourly_values is not available
                    if (!readings || readings.length === 0) {
                        readings = month.hourly_values_netted;
                        readingsSource = 'hourly_values_netted';
                    }

                    if (!readings || readings.length === 0) {
                        console.warn(`[DataProcessor] No readings available for month ${month.month}`);
                        continue;
                    }

                    // Log some examples of consumption timestamps for comparison
                    if (readings.length > 0) {
                        console.warn(`[DataProcessor] Consumption timestamp format for ${month.month}:`, {
                            timestamp: readings[0].t,
                            value: readings[0].v,
                            readingsSource
                        });
                    }

                    console.warn(`[DataProcessor] Processing ${readings.length} readings from ${readingsSource} for month ${month.month}`);
                    
                    for (const reading of readings) {
                        const consumption = reading.v / 1000;
                        const timestamp = reading.t;
                        
                        // Create date object once and reuse it
                        const date = new Date(timestamp);
                        const normalizedTimestamp = date.toISOString().replace(/\.000Z$/, 'Z');
                        
                        const price = prices.get(normalizedTimestamp);
                        
                        if (price === undefined) {
                            // Log more details about the timestamp format
                            console.warn(`[DataProcessor] Price lookup failed for ${normalizedTimestamp}`, {
                                originalTimestamp: timestamp,
                                normalizedTimestamp,
                                samplePriceTimestamps: Array.from(prices.keys()).slice(0, 2)
                            });
                            continue;
                        }

                        if (isNaN(consumption)) {
                            console.warn(`[DataProcessor] Invalid consumption value for timestamp ${normalizedTimestamp}: ${reading.v}`);
                            continue;
                        }

                        /*console.warn(`[DataProcessor] Successfully processed entry:`, {
                            timestamp: normalizedTimestamp,
                            consumption_kWh: Number(consumption.toFixed(3)),
                            price_cents_per_kWh: Number(price.toFixed(2))
                        });*/

                        const entry: CombinedData = {
                            timestamp: normalizedTimestamp,
                            consumption_kWh: Number(consumption.toFixed(3)),
                            price_cents_per_kWh: Number(price.toFixed(2)),
                            cost_euros: Number((consumption * price / 100).toFixed(6))
                        };
                        combinedData.push(entry);

                        // Reuse the existing date object
                        const monthKey = date.toLocaleDateString('en-US', { 
                            year: 'numeric',
                            month: 'long'
                        });

                        let monthData = monthlyDataMap.get(monthKey);
                        if (!monthData) {
                            monthData = {
                                month: monthKey,
                                totalConsumption: 0,
                                averagePrice: 0,
                                totalCost: 0
                            };
                            monthlyDataMap.set(monthKey, monthData);
                        }

                        monthData.totalConsumption += entry.consumption_kWh;
                        monthData.totalCost += entry.cost_euros;
                    }
                }
            }

            // Ensure we have data and log the state
            if (monthlyDataMap.size === 0) {
                console.warn('[DataProcessor] No monthly data was processed. Debug info:', {
                    combinedDataLength: combinedData.length,
                    pricesSize: prices.size,
                    responsesLength: responses.length,
                    monthsInResponses: responses.map(r => r.months?.length || 0),
                    firstPriceTimestamp: Array.from(prices.keys())[0],
                    firstConsumptionTimestamp: responses[0]?.months[0]?.hourly_values?.[0]?.t || 
                                            responses[0]?.months[0]?.hourly_values_netted?.[0]?.t
                });
            } else {
                console.warn('[DataProcessor] Successfully processed monthly data:', {
                    monthCount: monthlyDataMap.size,
                    months: Array.from(monthlyDataMap.keys()),
                    totalEntries: combinedData.length,
                    sampleEntry: combinedData[0]
                });
            }

            const monthlyData = Array.from(monthlyDataMap.values())
                .map(data => ({
                    ...data,
                    totalConsumption: Number(data.totalConsumption.toFixed(2)),
                    averagePrice: Number((data.totalCost / data.totalConsumption * 100).toFixed(2)),
                    totalCost: Number(data.totalCost.toFixed(2))
                }))
                .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

            combinedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const yearData: YearData = {
                lastUpdated: new Date().toISOString(),
                hourly: combinedData,
                monthly: monthlyData
            };

            // Save to cache asynchronously
            this.saveToCache(year, yearData);

            return yearData;
        } catch (error) {
            console.error('Error combining data:', error);
            throw error;
        }
    }
}

export default new DataProcessor();