/**
 * About / API pointer modal.
 */

import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet } from 'react-native';

import { Body, Muted, Screen, Title } from '@/components/Ui';
import { api } from '@/lib/api';

export default function ModalScreen() {
  return (
    <Screen>
      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
      <Title>Ledger Chain</Title>
      <Muted>Wholesaler app · Expo</Muted>
      <Body>
        Talks to the FastAPI backend for M-PESA sync, document intake, analytics, Stock
        Trail, and draft approvals. Retailers stay on USSD.
      </Body>
      <Muted>API: {api.baseUrl}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({});
