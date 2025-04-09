// services/eleniaService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { secureStorage } from '@/services/secureStorage';
import Constants from 'expo-constants';
import { LogBox } from 'react-native';
import { toZonedTime as utcToZonedTime, format } from 'date-fns-tz';

interface CustomerData {
    token: string;
    customer_datas: {
        [key: string]: {
            meteringpoints: Array<{
                gsrn: string;
                type?: string;
                additional_information?: string;
                device?: {
                    name: string;
                };
            }>;
        };
    };
}

interface MeterReadingResponse {
    months: Array<{
        month?: string;
        hourly_values_netted?: Array<{
            t: string;
            v: number;
        }>;
        hourly_values?: Array<{
            t: string;
            v: number;
        }>;
    }>;
}

interface CognitoAuthResponse {
    AuthenticationResult: {
        AccessToken: string;
        ExpiresIn: number;
        TokenType: string;
    };
}

class EleniaService {
    private baseUrl: string;
    private cognitoUrl: string;
    private headers: Record<string, string>;
    private maxRetries: number;

    constructor() {
        this.baseUrl = 'https://public.sgp-prod.aws.elenia.fi/api/gen';
        this.cognitoUrl = 'https://cognito-idp.eu-west-1.amazonaws.com/';
        this.maxRetries = 5;
        this.headers = {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://ainalab.aws.elenia.fi/',
            'Origin': 'https://ainalab.aws.elenia.fi',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Sec-GPC': '1',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
        };
    }

    private async makeRequestWithRetry<T>(
        method: string,
        url: string,
        config: any,
        attempt: number = 0
    ): Promise<AxiosResponse<T>> {
        try {
            console.warn(`[EleniaService] Making ${method} request to: ${url}, attempt ${attempt + 1}/${this.maxRetries}`);
            const response = await axios.request<T>({
                method,
                url,
                ...config
            });

            if (response.status === 504 && attempt < this.maxRetries - 1) {
                const waitTime = Math.pow(2, attempt);
                console.warn(`[EleniaService] Got 504 error, retrying after ${waitTime} seconds`);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                return this.makeRequestWithRetry(method, url, config, attempt + 1);
            }

            return response;
        } catch (error: any) {
            if (attempt < this.maxRetries - 1) {
                const waitTime = Math.pow(2, attempt);
                console.warn(`[EleniaService] Request failed, retrying after ${waitTime} seconds:`, error.message);
                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                return this.makeRequestWithRetry(method, url, config, attempt + 1);
            }
            throw error;
        }
    }

    private async getCognitoToken(username: string, password: string): Promise<string> {
        const payload = {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: 'k4s2pnm04536t1bm72bdatqct',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            },
            ClientMetadata: {}
        };

        try {
            console.warn('[EleniaService] Requesting Cognito token for user:', username);
            const response = await this.makeRequestWithRetry<CognitoAuthResponse>('post', this.cognitoUrl, {
                headers: {
                    'Content-Type': 'application/x-amz-json-1.1',
                    'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
                },
                data: payload
            });
            console.warn('[EleniaService] Cognito token request successful');
            return response.data.AuthenticationResult.AccessToken;
        } catch (error: any) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: this.cognitoUrl
            };
            console.warn('[EleniaService] Cognito token request failed:', errorDetails);
            throw error;
        }
    }

    private async getCustomerData(bearerToken: string) {
        try {
            console.warn('[EleniaService] Requesting customer data');
            const response = await this.makeRequestWithRetry<CustomerData>('get', 
                `${this.baseUrl}/customer_data_and_token`, 
                { headers: { ...this.headers, Authorization: `Bearer ${bearerToken}` } }
            );

            const metadata = response.data;
            const apiToken = metadata.token;
            const customerId = Object.keys(metadata.customer_datas)[0];
            const customerData = metadata.customer_datas[customerId];

            let consumptionGsrn = null;
            let productionGsrn = null;

            for (const meteringpoint of customerData.meteringpoints) {
                // Check type field first for consumption points
                if (meteringpoint.type === 'kulutus') {
                    consumptionGsrn = meteringpoint.gsrn;
                    console.warn('[EleniaService] Found consumption GSRN from type=kulutus:', consumptionGsrn);
                }
                // For production, check for virtual device
                if (meteringpoint.device?.name === 'Tuotannon virtuaalilaite') {
                    productionGsrn = meteringpoint.gsrn;
                    console.warn('[EleniaService] Found production GSRN from virtual device:', productionGsrn);
                }
            }

            return {
                apiToken,
                customerId,
                consumptionGsrn,
                productionGsrn,
            };
        } catch (error: any) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: `${this.baseUrl}/customer_data_and_token`
            };
            console.warn('[EleniaService] Customer data request failed:', errorDetails);
            throw error;
        }
    }

    private async getMeterReadings(apiToken: string, gsrn: string, customerId: string, year: string) {
        try {
            console.warn('[EleniaService] Requesting consumption readings:', { gsrn, customerId, year });
            const response = await this.makeRequestWithRetry<MeterReadingResponse>('get', 
                `${this.baseUrl}/meter_reading_yh`,
                {
                    params: {
                        gsrn,
                        customer_ids: customerId,
                        year
                    },
                    headers: { ...this.headers, Authorization: `Bearer ${apiToken}` }
                }
            );

            // Normalize timestamps in the response data
            response.data.months = response.data.months.map(month => {
                const convertTimestamp = (timestamp: string) => {
                    try {
                        let date = new Date(timestamp);
                        const helsinkiDate = utcToZonedTime(date, 'Europe/Helsinki');
                        return format(helsinkiDate, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: 'Europe/Helsinki' });
                    } catch (error) {
                        console.warn(`[EleniaService] Failed to parse timestamp: ${timestamp}`, error);
                        return timestamp;
                    }
                };
                
                if (month.hourly_values_netted && month.hourly_values_netted.length > 0) {
                    // Use only netted values if available
                    month.hourly_values_netted = month.hourly_values_netted.map(reading => ({
                        ...reading,
                        t: convertTimestamp(reading.t)
                    }));
                    month.hourly_values = undefined; // Clear non-netted values
                } else if (month.hourly_values && month.hourly_values.length > 0) {
                    // Use hourly values if no netted values are available
                    month.hourly_values = month.hourly_values.map(reading => ({
                        ...reading,
                        t: convertTimestamp(reading.t)
                    }));
                    month.hourly_values_netted = undefined; // Clear netted values
                }
                return month;
            });

            // Calculate and log monthly usage
            response.data.months.forEach(month => {
                const values = month.hourly_values_netted || month.hourly_values || [];
                const totalKwh = values.reduce((sum, reading) => sum + reading.v / 1000, 0); // Convert watts to kilowatts
                console.warn(`[EleniaService] Month ${month.month} total usage: ${totalKwh.toFixed(2)} kWh`);
            });

            // Log data structure details for debugging
            response.data.months.forEach(month => {
                const hasHourlyValues = !!month.hourly_values?.length;
                const hasHourlyValuesNetted = !!month.hourly_values_netted?.length;
                console.warn(`[EleniaService] Month ${month.month} data structure:`, {
                    hasHourlyValues,
                    hasHourlyValuesNetted,
                    hourlyValuesCount: month.hourly_values?.length || 0,
                    hourlyValuesNettedCount: month.hourly_values_netted?.length || 0
                });

                if (month.hourly_values?.length) {
                    const first = month.hourly_values[0].t;
                    const last = month.hourly_values[month.hourly_values.length - 1].t;
                    console.warn(`[EleniaService] Month ${month.month} hourly_values: ${month.hourly_values.length} records from ${first} to ${last}`);
                }
                if (month.hourly_values_netted?.length) {
                    const first = month.hourly_values_netted[0].t;
                    const last = month.hourly_values_netted[month.hourly_values_netted.length - 1].t;
                    console.warn(`[EleniaService] Month ${month.month} hourly_values_netted: ${month.hourly_values_netted.length} records from ${first} to ${last}`);
                }
            });

            // Calculate total hours for both types
            const totalHourlyValues = response.data.months.reduce((sum, month) => 
                sum + (month.hourly_values?.length || 0), 0);
            const totalHourlyValuesNetted = response.data.months.reduce((sum, month) => 
                sum + (month.hourly_values_netted?.length || 0), 0);
            
            console.warn(`[EleniaService] Total data received:`, {
                totalHourlyValues,
                totalHourlyValuesNetted
            });

            return response.data;
        } catch (error: any) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                params: { gsrn, customerId, year }
            };
            console.warn('[EleniaService] Consumption meter readings request failed:', errorDetails);
            throw error;
        }
    }

    async fetchConsumptionData(year: string = new Date().getFullYear().toString()) {
        try {
            console.warn('[EleniaService] Starting fetchConsumptionData...');
            const settings = await AsyncStorage.getItem('app_settings');
            if (!settings) {
                throw new Error('No settings found');
            }
            const { eleniaUsername } = JSON.parse(settings);
            if (!eleniaUsername) {
                throw new Error('No username found in settings');
            }

            const password = await secureStorage.getPassword();
            if (!password) {
                console.warn('[EleniaService] No password found in secure storage');
                throw new Error('No password found');
            }

            console.warn('[EleniaService] Getting Cognito token...');
            const bearerToken = await this.getCognitoToken(eleniaUsername, password);
            
            console.warn('[EleniaService] Getting customer data...');
            const { apiToken, customerId, consumptionGsrn, productionGsrn } = await this.getCustomerData(bearerToken);

            const results = [];
            if (consumptionGsrn) {
                const consumptionData = await this.getMeterReadings(apiToken, consumptionGsrn, customerId, year);
                results.push(consumptionData);
            } else {
                console.warn('[EleniaService] No consumption GSRN found');
            }

            // Optionally fetch production data if available
            /*if (productionGsrn) {
                const productionData = await this.getMeterReadings(apiToken, productionGsrn, customerId, year);
                results.push(productionData);
            }*/

            return results;
        } catch (error: any) {
            const errorDetails = {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                stack: error.stack
            };
            console.warn('[EleniaService] Error in fetchConsumptionData:', errorDetails);
            throw error;
        }
    }
}

export default new EleniaService();