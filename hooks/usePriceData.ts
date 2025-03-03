import { useState, useEffect, useCallback } from 'react';
import spotPriceService from '@/services/spotPriceService';
import dataProcessor from '@/services/dataProcessor';
import { useSettings } from './useSettings';
import { useSettingsContext } from './SettingsContext';

export interface PriceData {
  currentPrice: number | null;
  currentPriceWithMargin: number | null;
  hourlyData: {
    timestamp: string;
    consumption_kWh: number;
    price_cents_per_kWh: number;
    cost_euros: number;
  }[];
  monthlyData: {
    month: string;
    totalConsumption: number;
    averagePrice: number;
    totalCost: number;
  }[];
  isLoading: boolean;
  error: string | null;
}

export function usePriceData() {
  const { settings } = useSettings();
  const { settingsVersion } = useSettingsContext();
  const [data, setData] = useState<PriceData>({
    currentPrice: null,
    currentPriceWithMargin: null,
    hourlyData: [],
    monthlyData: [],
    isLoading: true,
    error: null
  });

  const applySpotMargin = useCallback((rawData: typeof data, spotMargin: number) => {
    const hourlyData = rawData.hourlyData.map(hour => ({
      ...hour,
      price_cents_per_kWh: Number((hour.price_cents_per_kWh + spotMargin).toFixed(2)),
      cost_euros: Number(((hour.consumption_kWh * (hour.price_cents_per_kWh + spotMargin)) / 100).toFixed(6))
    }));

    // Recalculate monthly data with new margins
    const monthlyDataMap = new Map<string, typeof rawData.monthlyData[0]>();
    
    for (const hour of hourlyData) {
      const date = new Date(hour.timestamp);
      const monthKey = date.toLocaleDateString('en-US', { 
        year: 'numeric',
        month: 'long'
      });

      const monthData = monthlyDataMap.get(monthKey) || {
        month: monthKey,
        totalConsumption: 0,
        averagePrice: 0,
        totalCost: 0
      };

      monthData.totalConsumption += hour.consumption_kWh;
      monthData.totalCost += hour.cost_euros;
      monthlyDataMap.set(monthKey, monthData);
    }

    const monthlyData = Array.from(monthlyDataMap.values()).map(month => ({
      ...month,
      totalConsumption: Number(month.totalConsumption.toFixed(2)),
      averagePrice: Number((month.totalCost / month.totalConsumption * 100).toFixed(2)),
      totalCost: Number(month.totalCost.toFixed(2))
    }));

    return {
      ...rawData,
      hourlyData,
      monthlyData,
      currentPrice: rawData.currentPrice,
      currentPriceWithMargin: rawData.currentPrice ? Number((rawData.currentPrice + spotMargin).toFixed(2)) : null
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setData(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Get current spot price
      const currentSpotPrice = await spotPriceService.getCurrentSpotPrice();
      
      // Get combined data for the selected year
      const yearData = await dataProcessor.combineData(settings.year);
      
      // Create base data without margin
      const baseData = {
        currentPrice: currentSpotPrice.price,
        currentPriceWithMargin: null,  // Add this property to match PriceData interface
        hourlyData: yearData.hourly,
        monthlyData: yearData.monthly,
        isLoading: false,
        error: null
      };

      // Apply spot margin to all prices
      const dataWithMargin = applySpotMargin(baseData, Number(settings.spotMargin));
      setData(dataWithMargin);
    } catch (err) {
      console.error('Error fetching price data:', err);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch price data'
      }));
    }
  }, [settings.year, settings.spotMargin, applySpotMargin]);

  useEffect(() => {
    fetchData();
    // Refresh data every hour and when settings version changes
    const interval = setInterval(fetchData, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, settingsVersion]);

  // Reapply spot margin when it changes
  useEffect(() => {
    if (!data.isLoading && !data.error) {
      const updatedData = applySpotMargin(data, Number(settings.spotMargin));
      setData(updatedData);
    }
  }, [settings.spotMargin, applySpotMargin]);

  return {
    ...data,
    refresh: fetchData
  };
}