// services/dataProcessor.ts
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import eleniaService from './eleniaService';
import vattenfallService from './vattenfallService';

// ... (interfaces remain the same) ...

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
            // Update if different day, month, or year
            return lastUpdate.getDate() !== now.getDate() ||
                   lastUpdate.getMonth() !== now.getMonth() ||
                   lastUpdate.getFullYear() !== now.getFullYear();
        }

        // For past years, no need to update unless cache is missing/corrupt
        // (The check for existence happens in getCachedData)
        return false; // Generally don't auto-update past years
    }

    async getCachedData(year: string): Promise<YearData | null> {
        try {
            const filePath = this.getCacheFilePath(year);
            const fileInfo = await FileSystem.getInfoAsync(filePath);
            if (!fileInfo.exists) {
                console.warn(`[DataProcessor] Cache file not found for year ${year}: ${filePath}`);
                return null;
            }

            const content = await FileSystem.readAsStringAsync(filePath);
            const data = JSON.parse(content);
             // Basic validation
            if (!data || !data.lastUpdated || !Array.isArray(data.hourly) || !Array.isArray(data.monthly)) {
                console.warn(`[DataProcessor] Cached data for year ${year} seems invalid. Will refetch.`);
                await FileSystem.deleteAsync(filePath, { idempotent: true }); // Delete invalid cache
                return null;
            }
            console.warn(`[DataProcessor] Using cached data for year ${year}, last updated: ${data.lastUpdated}`);
            return data;
        } catch (error) {
            console.error(`[DataProcessor] Error reading cache for year ${year}:`, error);
             // Attempt to delete corrupted cache file
            try {
                 await FileSystem.deleteAsync(this.getCacheFilePath(year), { idempotent: true });
            } catch (deleteError) {
                console.error(`[DataProcessor] Failed to delete potentially corrupted cache file for year ${year}:`, deleteError);
            }
            return null;
        }
    }

    private async saveToCache(year: string, data: YearData): Promise<void> {
        try {
            await this.ensureCacheDirectory();
            const filePath = this.getCacheFilePath(year);
            await FileSystem.writeAsStringAsync(filePath, JSON.stringify(data));
            console.warn(`[DataProcessor] Successfully saved data to cache for year ${year}: ${filePath}`);
        } catch (error) {
            console.error(`[DataProcessor] Error saving to cache for year ${year}:`, error);
        }
    }

    async combineData(year: string = new Date().getFullYear().toString()): Promise<YearData> {
        // Try to get cached data first
        const cachedData = await this.getCachedData(year);
        // Check if cache is valid AND if it needs updating
        if (cachedData && !this.shouldUpdateData(cachedData.lastUpdated)) {
            console.warn(`[DataProcessor] Returning valid cached data for year ${year}.`);
            return cachedData;
        }
        if (cachedData && this.shouldUpdateData(cachedData.lastUpdated)) {
             console.warn(`[DataProcessor] Cache for year ${year} needs update (Last updated: ${cachedData.lastUpdated}). Fetching fresh data.`);
        } else if (!cachedData) {
             console.warn(`[DataProcessor] No valid cache found for year ${year}. Fetching fresh data.`);
        }


        try {
            console.warn(`[DataProcessor] Fetching fresh data for year ${year}...`);
            // Fetch consumption data from Elenia
            const responses = await eleniaService.fetchConsumptionData(year);
            console.warn(`[DataProcessor] Received ${responses.length} responses from Elenia for year ${year}`);

            const pricesArray = await vattenfallService.fetchPriceData(year);
            console.warn(`[DataProcessor] Received ${pricesArray.length} price entries from Vattenfall`);

            // Normalize timestamps in price data
            const prices = new Map(pricesArray.map(p => {
                try {
                    // Ensure timestamp is treated as UTC and normalize
                    const date = new Date(p.timeStamp.endsWith('Z') ? p.timeStamp : p.timeStamp + 'Z');
                    if (isNaN(date.getTime())) {
                        console.error(`[DataProcessor] Invalid price timestamp encountered: ${p.timeStamp}`);
                        return [null, null]; // Skip invalid entry
                    }
                    const normalizedTimestamp = date.toISOString(); //.replace(/\.000Z$/, 'Z'); // ISOString already ends in Z
                    return [normalizedTimestamp, p.value];
                } catch (e) {
                    console.error(`[DataProcessor] Error processing price timestamp: ${p.timeStamp}`, e);
                    return [null, null]; // Skip invalid entry
                }
            }).filter(([ts, _]) => ts !== null)); // Filter out skipped entries

            console.warn(`[DataProcessor] Created price map with ${prices.size} entries`);
            if (prices.size < pricesArray.length) {
                 console.warn(`[DataProcessor] ${pricesArray.length - prices.size} price entries were skipped due to invalid timestamps.`);
            }
            // Log first few price keys for debugging
             if (prices.size > 0) {
                 console.warn(`[DataProcessor] Sample price timestamps (normalized): ${Array.from(prices.keys()).slice(0, 3).join(', ')}`);
             }


            const combinedData: CombinedData[] = [];
            const monthlyDataMap = new Map<string, MonthlyData>();

            // Process consumption data and combine with prices
            for (const response of responses) {
                 if (!response || !Array.isArray(response.months)) {
                     console.warn('[DataProcessor] Encountered invalid/empty response from EleniaService, skipping.');
                     continue;
                 }
                for (const month of response.months) {
                    if (!month) {
                         console.warn('[DataProcessor] Encountered null/undefined month object, skipping.');
                         continue;
                    }
                     // --- Verification Log ---
                    console.warn(`[DataProcessor] Checking month ${month.month}: Has netted: ${!!month.hourly_values_netted?.length}, Has hourly: ${!!month.hourly_values?.length}`);
                    if (month.hourly_values_netted && month.hourly_values) {
                        console.error(`[DataProcessor] CRITICAL WARNING: Both hourly_values_netted AND hourly_values are present for month ${month.month}! EleniaService might not be clearing fields correctly.`);
                    }
                     // --- End Verification Log ---


                    // Explicitly prioritize netted values
                    const hasNettedValues = month.hourly_values_netted && month.hourly_values_netted.length > 0;
                    const readings = hasNettedValues ? month.hourly_values_netted : month.hourly_values;
                    const readingsSource = hasNettedValues ? 'hourly_values_netted' : 'hourly_values'; // Keep this accurate

                    if (!readings || readings.length === 0) {
                        // This check handles cases where BOTH are empty/null/undefined, or where the selected one is empty.
                        console.warn(`[DataProcessor] No usable readings (checked ${readingsSource}) found for month ${month.month}`);
                        continue;
                    }

                    console.warn(`[DataProcessor] Processing ${readings.length} readings from *${readingsSource}* for month ${month.month}`);
                     // --- Verification Log ---
                     if (readings.length > 0) {
                        const sampleReading = readings[0];
                         console.warn(`[DataProcessor] Sample reading from ${readingsSource} for ${month.month}: t=${sampleReading.t}, v=${sampleReading.v}`);
                     }
                     // --- End Verification Log ---

                    for (const reading of readings) {
                        if (typeof reading.v !== 'number' || isNaN(reading.v)) {
                             console.warn(`[DataProcessor] Invalid consumption value type or NaN for timestamp ${reading.t}: ${reading.v} (type: ${typeof reading.v}), skipping.`);
                             continue;
                        }
                         if (typeof reading.t !== 'string' || reading.t === '') {
                             console.warn(`[DataProcessor] Invalid timestamp type or empty for value ${reading.v}: ${reading.t} (type: ${typeof reading.t}), skipping.`);
                             continue;
                         }

                        // Convert watts to kilowatts
                        const consumption = reading.v / 1000;
                        const timestamp = reading.t; // Already normalized in EleniaService

                         // *** IMPORTANT: Price Lookup Normalization ***
                         // EleniaService already formats to "yyyy-MM-dd'T'HH:mm:ssXXX" (ISO 8601 with timezone offset)
                         // Vattenfall timestamps are normalized to ISOString (UTC, ends with Z)
                         // We need to convert the Elenia timestamp (which is localized) back to UTC ISO string for lookup
                         let normalizedTimestampForLookup: string;
                         try {
                            // Parse the ISO 8601 string with offset, getDate returns the UTC equivalent
                             const date = new Date(timestamp);
                             if (isNaN(date.getTime())) {
                                 throw new Error('Invalid Date parsed from Elenia timestamp');
                             }
                             normalizedTimestampForLookup = date.toISOString();
                         } catch (e) {
                             console.warn(`[DataProcessor] Failed to parse Elenia timestamp '${timestamp}' to Date object:`, e);
                             continue; // Skip this reading if timestamp is bad
                         }


                        const price = prices.get(normalizedTimestampForLookup);

                        if (price === undefined) {
                            // Price lookup failure is common if price data isn't available for the exact hour.
                             // Log less intrusively, maybe only once per run or less frequently.
                             // console.warn(`[DataProcessor] Price lookup failed for Elenia timestamp: ${timestamp} (Normalized UTC: ${normalizedTimestampForLookup})`);
                             // You might want to check if the timestamp is within the expected range of price data
                            continue;
                        }

                        if (isNaN(consumption)) {
                            // This should be caught by the earlier check, but added as safeguard
                            console.warn(`[DataProcessor] Invalid consumption value detected post-division for timestamp ${normalizedTimestampForLookup}: ${reading.v}, skipping.`);
                            continue;
                        }
                        if (typeof price !== 'number' || isNaN(price)) {
                             console.warn(`[DataProcessor] Invalid price value found for timestamp ${normalizedTimestampForLookup}: ${price} (type: ${typeof price}), skipping.`);
                             continue;
                        }


                        const entry: CombinedData = {
                            timestamp: normalizedTimestampForLookup, // Store normalized UTC timestamp
                            consumption_kWh: Number(consumption.toFixed(3)),
                            price_cents_per_kWh: Number(price.toFixed(2)),
                            cost_euros: Number((consumption * price / 100).toFixed(6)) // price is cents/kWh
                        };
                        combinedData.push(entry);

                        // Use UTC month for grouping to be consistent with UTC timestamps
                        const dateForMonthKey = new Date(normalizedTimestampForLookup);
                        const monthKey = dateForMonthKey.toLocaleDateString('en-CA', { // Use 'en-CA' for YYYY-MM format or similar unambiguous standard
                            year: 'numeric',
                            month: '2-digit', // Use 'long' if preferred: 'January 2023' etc.
                             timeZone: 'UTC'
                        });


                        let monthData = monthlyDataMap.get(monthKey);
                        if (!monthData) {
                            monthData = {
                                month: monthKey, // Store consistent month key
                                totalConsumption: 0,
                                averagePrice: 0, // Will be calculated later
                                totalCost: 0
                            };
                            monthlyDataMap.set(monthKey, monthData);
                        }

                        monthData.totalConsumption += entry.consumption_kWh;
                        monthData.totalCost += entry.cost_euros;
                    }
                }
            }

            // Calculate average price AFTER summing up totals for the month
            const monthlyData = Array.from(monthlyDataMap.values())
                .map(data => {
                    // Avoid division by zero if consumption is zero (or negative due to netting)
                    const avgPrice = (data.totalConsumption !== 0)
                        ? (data.totalCost / data.totalConsumption * 100) // Recalculate cents/kWh
                        : 0;
                    return {
                        ...data,
                        totalConsumption: Number(data.totalConsumption.toFixed(3)), // Increased precision maybe needed
                        averagePrice: Number(avgPrice.toFixed(2)),
                        totalCost: Number(data.totalCost.toFixed(2))
                    };
                })
                 // Sort by month key (e.g., "2023-01", "2023-02")
                .sort((a, b) => a.month.localeCompare(b.month));


            // Sort hourly data by timestamp just in case order was mixed
            combinedData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const yearData: YearData = {
                lastUpdated: new Date().toISOString(),
                hourly: combinedData,
                monthly: monthlyData
            };

            console.warn(`[DataProcessor] Finished processing data for year ${year}. Total hourly entries: ${yearData.hourly.length}`);
             console.warn('[DataProcessor] Final monthly summary:', yearData.monthly.map(m => ({
                 month: m.month,
                 totalConsumption: m.totalConsumption,
                 avgPrice: m.averagePrice,
                 totalCost: m.totalCost
             })));


            // Save to cache asynchronously (don't wait for it)
             this.saveToCache(year, yearData).catch(err => {
                 console.error(`[DataProcessor] Background cache saving failed for year ${year}:`, err);
             });


            return yearData;
        } catch (error) {
            console.error(`[DataProcessor] Critical error during combineData for year ${year}:`, error);
            // If fetching failed, maybe return the stale cache if available and valid?
             if (cachedData) {
                 console.warn(`[DataProcessor] Falling back to stale cached data for year ${year} due to error.`);
                 return cachedData;
             }
            // Otherwise, re-throw or return an empty/error state
            throw error; // Re-throw the error to signal failure
             // Or return an empty state:
             // return { lastUpdated: new Date().toISOString(), hourly: [], monthly: [] };
        }
    }
}

export default new DataProcessor();