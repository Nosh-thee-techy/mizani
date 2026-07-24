/**
 * Goods — Stock Trail: dispatch panel + three-way pipeline per delivery row.
 *
 * Design changes from original:
 * — Dispatch form is a sticky card above the list (visually separated)
 * — Three-way pipeline icons per row (Invoice → Dispatched → Received)
 * — Status Badge replaces plain status text string
 * — Discrepancy notes shown in amber warning card
 * — FlatList renderItem memoized per React Native stack guideline
 */

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Badge,
  Body,
  Card,
  ErrorText,
  FieldInput,
  Loading,
  Muted,
  PrimaryButton,
  Screen,
  SectionLabel,
  useTheme,
} from '@/components/Ui';
import { api, DeliveryRow, kes } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'matched':     return 'success';
    case 'pending':     return 'warning';
    case 'discrepancy': return 'danger';
    case 'in_transit':  return 'info';
    default:            return 'neutral';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'matched':     return 'Matched';
    case 'pending':     return 'Pending';
    case 'discrepancy': return 'Discrepancy';
    case 'in_transit':  return 'In Transit';
    default:            return status;
  }
}

// ── Three-way pipeline indicator ─────────────────────────────
function Pipeline({
  dispatched,
  received,
  status,
}: {
  dispatched: number | null;
  received: number | null;
  status: string;
}) {
  const c = useTheme();
  const matched = status === 'matched';
  const hasDiscrepancy = status === 'discrepancy';

  const stepColor = (filled: boolean) => (filled ? c.tint : c.border);
  const textColor = (filled: boolean) => (filled ? c.text : c.textMuted);

  return (
    <View style={styles.pipeline}>
      {/* Step 1: Invoice */}
      <View style={styles.pipelineStep}>
        <View style={[styles.pipelineIcon, { backgroundColor: c.tint + '22' }]}>
          <Ionicons name="document-text-outline" size={14} color={c.tint} />
        </View>
        <Text style={[styles.pipelineLabel, { color: c.textMuted }]}>Invoice</Text>
      </View>

      {/* Connector */}
      <View style={[styles.pipelineConnector, { backgroundColor: dispatched ? c.tint : c.border }]} />

      {/* Step 2: Dispatched */}
      <View style={styles.pipelineStep}>
        <View
          style={[
            styles.pipelineIcon,
            { backgroundColor: dispatched ? c.tint + '22' : c.border + '44' },
          ]}>
          <Ionicons
            name="car-outline"
            size={14}
            color={stepColor(!!dispatched)}
          />
        </View>
        <Text style={[styles.pipelineLabel, { color: textColor(!!dispatched) }]}>
          {dispatched != null ? `${dispatched} out` : 'Not sent'}
        </Text>
      </View>

      {/* Connector */}
      <View
        style={[
          styles.pipelineConnector,
          { backgroundColor: received ? (hasDiscrepancy ? c.danger : c.tint) : c.border },
        ]}
      />

      {/* Step 3: Received */}
      <View style={styles.pipelineStep}>
        <View
          style={[
            styles.pipelineIcon,
            {
              backgroundColor: received
                ? hasDiscrepancy
                  ? c.dangerBg
                  : c.successBg
                : c.border + '44',
            },
          ]}>
          <Ionicons
            name={received ? (hasDiscrepancy ? 'alert-circle-outline' : 'checkmark-circle-outline') : 'time-outline'}
            size={14}
            color={received ? (hasDiscrepancy ? c.danger : c.success) : c.textMuted}
          />
        </View>
        <Text
          style={[
            styles.pipelineLabel,
            { color: received ? (hasDiscrepancy ? c.danger : c.success) : c.textMuted },
          ]}>
          {received != null ? `${received} in` : 'Awaiting'}
        </Text>
      </View>
    </View>
  );
}

// ── 3D Isometric Mapping component ──────────────────────────────
function DeliveryMap3D({ counterpartyName }: { counterpartyName: string }) {
  const c = useTheme();
  return (
    <View style={[styles.mapContainer, { backgroundColor: c.surfaceElevated, borderColor: c.border }]}>
      <Text style={[styles.mapTitle, { color: c.textMuted }]}>
        LIVE 3D ORDER ROUTE
      </Text>
      
      {/* 3D Isometric Viewport */}
      <View style={styles.isometricViewport}>
        <View style={[styles.isometricPlane, { borderColor: c.borderStrong, backgroundColor: c.background }]}>
          {/* Grid lines inside the plane */}
          <View style={[styles.gridLine, { top: '25%', left: 0, right: 0, height: 1, backgroundColor: c.border + '44' }]} />
          <View style={[styles.gridLine, { top: '50%', left: 0, right: 0, height: 1, backgroundColor: c.border + '44' }]} />
          <View style={[styles.gridLine, { top: '75%', left: 0, right: 0, height: 1, backgroundColor: c.border + '44' }]} />
          <View style={[styles.gridLine, { left: '25%', top: 0, bottom: 0, width: 1, backgroundColor: c.border + '44' }]} />
          <View style={[styles.gridLine, { left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: c.border + '44' }]} />
          <View style={[styles.gridLine, { left: '75%', top: 0, bottom: 0, width: 1, backgroundColor: c.border + '44' }]} />

          {/* Route path */}
          <View style={[styles.routePath, { borderColor: c.tint }]} />

          {/* Warehouse/Start Pin */}
          <View style={[styles.pinStart, { backgroundColor: c.tint }]}>
            <Ionicons name="business" size={10} color="#FFFDF8" />
          </View>
          <Text style={[styles.pinStartLabel, { color: c.textMuted }]}>Warehouse</Text>

          {/* Destination Pin */}
          <View style={[styles.pinEnd, { backgroundColor: c.accent }]}>
            <Ionicons name="location" size={10} color="#FFFDF8" />
          </View>
          <Text style={[styles.pinEndLabel, { color: c.textMuted }]} numberOfLines={1}>
            {counterpartyName}
          </Text>

          {/* Moving Truck */}
          <View style={[styles.movingTruck, { backgroundColor: c.tint }]}>
            <Ionicons name="car" size={12} color="#FFFDF8" />
          </View>
        </View>
      </View>
      
      <View style={styles.mapFooter}>
        <Ionicons name="navigate-circle-outline" size={14} color={c.tint} />
        <Text style={[styles.mapStatus, { color: c.text }]}>
          In Transit: Nairobi Hub to {counterpartyName} Shop
        </Text>
      </View>
    </View>
  );
}

// ── Memoized delivery row ─────────────────────────────────────
const DeliveryCard = memo(function DeliveryCard({ item }: { item: DeliveryRow }) {
  const c = useTheme();
  return (
    <Card>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
            {item.counterparty_name}
          </Text>
          <Text style={[styles.cardMeta, { color: c.textMuted }]}>
            Delivery #{item.delivery_id} · Tx #{item.transaction_id} · {item.transaction_date}
          </Text>
        </View>
        <Badge label={statusLabel(item.match_status)} variant={statusVariant(item.match_status)} />
      </View>

      {/* Amount */}
      <Text style={[styles.cardAmount, { color: c.tint }]}>{kes(item.amount)}</Text>

      {/* Three-way pipeline */}
      <Pipeline
        dispatched={item.dispatched_quantity}
        received={item.receipt_confirmed_quantity}
        status={item.match_status}
      />

      {/* 3D tracking map if dispatched */}
      {item.dispatched_quantity != null ? (
        <DeliveryMap3D counterpartyName={item.counterparty_name} />
      ) : null}

      {/* Discrepancy notes */}
      {item.discrepancy_notes ? (
        <View style={[styles.discrepancyCard, { backgroundColor: c.warningBg, borderColor: c.warning + '44' }]}>
          <Ionicons name="warning-outline" size={14} color={c.warning} />
          <Text style={[styles.discrepancyText, { color: c.warning }]}>{item.discrepancy_notes}</Text>
        </View>
      ) : null}

      {/* Driver status note */}
      {item.driver_status ? (
        <Text style={[styles.driverNote, { color: c.textMuted }]} numberOfLines={2}>
          {item.driver_status}
        </Text>
      ) : null}
    </Card>
  );
});

// ── Main screen ───────────────────────────────────────────────
export default function GoodsScreen() {
  const c = useTheme();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [txId, setTxId] = useState('');
  const [qty, setQty] = useState('50');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.goods();
      setRows(res.deliveries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goods');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onDispatch = async () => {
    const id = Number(txId);
    if (!id) {
      Alert.alert('Enter a transaction ID for this dispatch');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed');
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (shot.canceled || !shot.assets[0]) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const invoiceQty = qty ? Number(qty) : undefined;
      const result = await api.dispatch(id, shot.assets[0].uri, invoiceQty);
      setMessage(
        `Dispatched ${result.extraction?.estimated_quantity ?? '?'} units for Tx #${id}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <Screen>
        <Loading label="Loading stock trail…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.pad}
        data={rows}
        keyExtractor={(item) => String(item.delivery_id)}
        ListHeaderComponent={
          <View>
            {/* Page title */}
            <Text style={[styles.pageTitle, { color: c.text }]}>Goods</Text>
            <Muted>Stock Trail — dispatch, in transit, matched or flagged</Muted>

            {error ? <ErrorText message={error} /> : null}
            {message ? (
              <View style={[styles.successBanner, { backgroundColor: c.successBg, borderColor: c.success + '44' }]}>
                <Ionicons name="checkmark-circle" size={16} color={c.success} />
                <Text style={[styles.successText, { color: c.success }]}>{message}</Text>
              </View>
            ) : null}

            {/* ── Dispatch panel ─────────────────────────── */}
            <SectionLabel label="New Dispatch" />
            <Card elevated>
              <View style={styles.dispatchHeader}>
                <View style={[styles.dispatchIcon, { backgroundColor: c.tint + '18' }]}>
                  <Ionicons name="camera-outline" size={20} color={c.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dispatchTitle, { color: c.text }]}>
                    Photograph dispatch
                  </Text>
                  <Text style={[styles.dispatchSub, { color: c.textMuted }]}>
                    AI will count units from the photo
                  </Text>
                </View>
              </View>

              <FieldInput
                label="Transaction ID"
                value={txId}
                onChangeText={setTxId}
                keyboardType="number-pad"
                placeholder="e.g. 7"
              />
              <FieldInput
                label="Invoice quantity (optional)"
                value={qty}
                onChangeText={setQty}
                keyboardType="number-pad"
                placeholder="e.g. 50"
              />
              <PrimaryButton
                label={busy ? 'Uploading…' : 'Camera · Dispatch'}
                onPress={onDispatch}
                disabled={busy}
                icon={<Ionicons name="camera" size={16} color={c.textOnPrimary} />}
              />
            </Card>

            {/* Deliveries section label */}
            <SectionLabel label={`${rows.length} Deliveries`} />
          </View>
        }
        ListEmptyComponent={
          <Card>
            <Body>No deliveries yet. Dispatch stock or run the seed script.</Body>
          </Card>
        }
        renderItem={({ item }) => <DeliveryCard item={item} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 48 },
  pageTitle: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 4,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },
  dispatchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dispatchIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dispatchTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  dispatchSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  // Card
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  cardName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  cardAmount: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    fontWeight: '700',
    marginBottom: 12,
  },
  // Pipeline
  pipeline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pipelineStep: {
    alignItems: 'center',
    gap: 5,
  },
  pipelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipelineLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    maxWidth: 56,
  },
  pipelineConnector: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 16, // align with icon center
  },
  // Notes
  discrepancyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  discrepancyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
    lineHeight: 18,
  },
  driverNote: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    lineHeight: 16,
  },
  // Map styles
  mapContainer: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  mapTitle: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    marginBottom: 12,
  },
  isometricViewport: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  isometricPlane: {
    width: 260,
    height: 140,
    borderWidth: 1.5,
    borderRadius: 12,
    position: 'relative',
    transform: [
      { perspective: 400 },
      { rotateX: '50deg' },
      { rotateZ: '-25deg' }
    ] as any,
  },
  gridLine: {
    position: 'absolute',
  },
  routePath: {
    position: 'absolute',
    left: '20%',
    top: '30%',
    width: '60%',
    height: '40%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  pinStart: {
    position: 'absolute',
    left: '18%',
    top: '28%',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinStartLabel: {
    position: 'absolute',
    left: '12%',
    top: '48%',
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
  },
  pinEnd: {
    position: 'absolute',
    left: '72%',
    top: '62%',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinEndLabel: {
    position: 'absolute',
    left: '60%',
    top: '80%',
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '600',
    maxWidth: 80,
  },
  movingTruck: {
    position: 'absolute',
    left: '46%',
    top: '42%',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  mapFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  mapStatus: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500',
  },
});
