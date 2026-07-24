/**
 * Action inbox — mismatches and pending draft messages to approve.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  Body,
  Card,
  ErrorText,
  Loading,
  Muted,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Title,
} from '@/components/Ui';
import { api, InboxResponse, kes } from '@/lib/api';

export default function InboxScreen() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.inbox());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
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

  const onReconcile = async (transactionId: number) => {
    setBusyId(transactionId);
    try {
      const result = await api.reconcile(transactionId);
      Alert.alert(
        'Reconcile',
        result.discrepancy_notes
          ? String(result.discrepancy_notes)
          : `Status: ${result.status}`,
      );
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Reconcile failed');
    } finally {
      setBusyId(null);
    }
  };

  const onApprove = async (draftId: number) => {
    setBusyId(draftId);
    try {
      const result = await api.approveDraft(draftId);
      Alert.alert(
        'Approved',
        result.sms_sent ? 'Draft approved and SMS sent (sandbox).' : 'Draft approved.',
      );
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !data) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const mismatches = data?.mismatches ?? [];
  const drafts = data?.pending_drafts ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        <Title>Inbox</Title>
        <Muted>Mismatches and drafts waiting for your OK</Muted>
        {error ? <ErrorText message={error} /> : null}

        <View style={{ marginTop: 16 }}>
          <Muted>Mismatches</Muted>
          {mismatches.length === 0 ? (
            <Card>
              <Body>No open mismatches.</Body>
            </Card>
          ) : (
            mismatches.map((m) => (
              <Card key={m.id}>
                <Body>
                  #{m.id} · {m.counterparty_name}
                </Body>
                <Muted>
                  {kes(m.amount)} · {m.transaction_date} · {m.direction}
                </Muted>
                {m.notes ? <Body>{m.notes}</Body> : null}
                <SecondaryButton
                  label={busyId === m.id ? 'Working…' : 'Run reconcile'}
                  onPress={() => onReconcile(m.id)}
                  disabled={busyId != null}
                />
              </Card>
            ))
          )}
        </View>

        <View style={{ marginTop: 8 }}>
          <Muted>Pending drafts</Muted>
          {drafts.length === 0 ? (
            <Card>
              <Body>No pending drafts. Open a matched receivable in the API to generate one.</Body>
            </Card>
          ) : (
            drafts.map((d) => (
              <Card key={d.id}>
                <Body>
                  {d.draft_type} · {d.counterparty_name}
                </Body>
                <Muted>
                  Tx #{d.transaction_id} · {kes(d.amount)}
                </Muted>
                <Body>{d.message_text}</Body>
                <PrimaryButton
                  label={busyId === d.id ? 'Sending…' : 'Approve & SMS'}
                  onPress={() => onApprove(d.id)}
                  disabled={busyId != null}
                />
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 40 },
});
