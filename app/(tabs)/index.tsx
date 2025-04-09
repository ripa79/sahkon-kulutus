import { View, StyleSheet, ActivityIndicator, ScrollView, SafeAreaView, RefreshControl } from 'react-native';
import { usePriceData } from '@/hooks/usePriceData';
import { useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { useIsFocused } from '@react-navigation/native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSettingsContext } from '@/hooks/SettingsContext';

export default function HomeScreen() {
  const { currentPrice, monthlyData, isLoading, error, refresh } = usePriceData();
  const [refreshing, setRefreshing] = useState(false);
  const { settings } = useSettings();
  const { settingsVersion } = useSettingsContext();
  const isFocused = useIsFocused();

  // Use layout effect to ensure synchronous refresh when dependencies change
  useLayoutEffect(() => {
    if (isFocused) {
      console.log('HomeScreen focused, refreshing data...', {
        year: settings.year,
        settingsVersion,
        hasCurrentPrice: !!currentPrice,
        hasMonthlyData: monthlyData?.length > 0
      });
      if (monthlyData) {
        console.log('Monthly data received by UI:', monthlyData);
      }
      refresh();
    }
  }, [isFocused, settings.year, settingsVersion, refresh]);

  const onRefresh = useCallback(async () => {
    console.log('Manual refresh triggered');
    setRefreshing(true);
    try {
      await refresh();
      console.log('Manual refresh completed successfully');
    } catch (error: any) {
      console.error('Error during manual refresh:', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (error) {
      console.error('Error state in HomeScreen:', {
        error,
        settings: {
          year: settings.year,
          hasSpotMargin: !!settings.spotMargin
        }
      });
    }
  }, [error, settings]);

  const currentPriceWithMargin = currentPrice ? currentPrice + Number(settings.spotMargin) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ThemedView style={styles.priceCard}>
          <ThemedText style={styles.title}>Current Electricity Price v2</ThemedText>
          {isLoading ? (
            <ActivityIndicator size="large" />
          ) : error ? (
            <ThemedText style={styles.error}>{error}</ThemedText>
          ) : (
            <View style={styles.priceContainer}>
              <View style={styles.priceBreakdown}>
                <ThemedText style={styles.priceLabel}>Spot price:</ThemedText>
                <ThemedText style={styles.priceValue}>
                  {currentPrice ? currentPrice.toFixed(2) : '--'} c/kWh
                </ThemedText>
              </View>
              <View style={styles.priceBreakdown}>
                <ThemedText style={styles.priceLabel}>Margin:</ThemedText>
                <ThemedText style={styles.priceValue}>
                  {Number(settings.spotMargin).toFixed(2)} c/kWh
                </ThemedText>
              </View>
              <View style={[styles.priceBreakdown, styles.totalPrice]}>
                <ThemedText style={styles.priceLabel}>Total:</ThemedText>
                <ThemedText style={[styles.priceValue, styles.totalPriceValue]}>
                  {currentPriceWithMargin ? currentPriceWithMargin.toFixed(2) : '--'} c/kWh
                </ThemedText>
              </View>
            </View>
          )}
        </ThemedView>
        <ThemedView style={styles.section}>
          <ThemedText style={styles.title}>Monthly Overview ({settings.year})</ThemedText>
          {isLoading ? (
            <ActivityIndicator size="large" />
          ) : error ? (
            <ThemedText style={styles.error}>{error}</ThemedText>
          ) : (
            monthlyData.map((month, index) => {
              console.log(`Rendering month ${month.month}:`, month);
              return (
                <ThemedView key={index} style={styles.monthRow}>
                  <ThemedText style={styles.monthName}>{month.month}</ThemedText>
                  <View style={styles.monthDetails}>
                    <View style={styles.detailColumn}>
                      <ThemedText style={styles.label}>Usage</ThemedText>
                      <ThemedText style={styles.value}>{month.totalConsumption.toFixed(1)} kWh</ThemedText>
                    </View>
                    <View style={styles.detailColumn}>
                      <ThemedText style={styles.label}>Avg. Price</ThemedText>
                      <ThemedText style={styles.value}>{month.averagePrice.toFixed(2)} c/kWh</ThemedText>
                    </View>
                    <View style={styles.detailColumn}>
                      <ThemedText style={styles.label}>Total</ThemedText>
                      <ThemedText style={styles.value}>{month.totalCost.toFixed(2)} €</ThemedText>
                    </View>
                  </View>
                </ThemedView>
              );
            })
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 16,
  },
  priceCard: {
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    width: '100%',
  },
  priceContainer: {
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  priceBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalPrice: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  priceLabel: {
    fontSize: 16,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  totalPriceValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  price: {
    fontSize: 56,
    fontWeight: 'bold',
    width: '100%',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 66,
  },
  unit: {
    fontSize: 16,
    marginTop: 12,
  },
  section: {
    padding: 16,
    borderRadius: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  error: {
    color: '#e74c3c',
    textAlign: 'center',
  },
  monthRow: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
  },
  monthName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  monthDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailColumn: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
    opacity: 0.7,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
  },
});
