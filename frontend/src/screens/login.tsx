import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
} from 'react-native';

export default function LoginScreen() {
  const [cashierId, setCashierId] = useState('');
  const [pin, setPin] = useState('');
  const [terminalId, setTerminalId] = useState('POS-01');

  const handleLogin = () => {
    // Handled in upcoming authentication flow
    console.log('Cashier login attempt:', { cashierId, terminalId });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerContainer}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>SUPERMARKET POS</Text>
            </View>
            <Text style={styles.title}>Cashier Login</Text>
            <Text style={styles.subtitle}>Enter your credentials to start your shift</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Terminal ID</Text>
              <TextInput
                style={styles.input}
                value={terminalId}
                onChangeText={setTerminalId}
                placeholder="e.g. POS-01"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Cashier / Staff ID</Text>
              <TextInput
                style={styles.input}
                value={cashierId}
                onChangeText={setCashierId}
                placeholder="Enter cashier ID or badge"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Security PIN / Password</Text>
              <TextInput
                style={styles.input}
                value={pin}
                onChangeText={setPin}
                placeholder="••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry
                keyboardType="numeric"
              />
            </View>

            <TouchableOpacity
              style={styles.loginButton}
              activeOpacity={0.8}
              onPress={handleLogin}
            >
              <Text style={styles.loginButtonText}>Open Shift & Log In</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>Retail POS • MS SQL Edition</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  badge: {
    backgroundColor: '#1e293b',
    borderColor: '#38bdf8',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 15,
  },
  loginButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: '#64748b',
    fontSize: 12,
  },
});
