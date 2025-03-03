import axios from 'axios';
import { LogBox } from 'react-native';
import EleniaService from './eleniaService';

export async function testEleniaCredentials(username: string, password: string): Promise<boolean> {
    try {
        console.warn('[EleniaAuth] Testing credentials for username:', username);
        const cognitoToken = await EleniaService['getCognitoToken'](username, password);
        console.warn('[EleniaAuth] Successfully got Cognito token');

        console.warn('[EleniaAuth] Getting customer data...');
        const customerData = await EleniaService['getCustomerData'](cognitoToken);
        console.warn('[EleniaAuth] Successfully got customer data:', {
            hasToken: !!customerData.apiToken,
            hasCustomerId: !!customerData.customerId,
            hasConsumptionGsrn: !!customerData.consumptionGsrn,
            hasProductionGsrn: !!customerData.productionGsrn
        });

        // Only check for required auth data, not GSRN values
        return !!(customerData.apiToken && customerData.customerId);
    } catch (error) {
        console.warn('[EleniaAuth] Error testing credentials:', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
        });
        return false;
    }
}