import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import LoginScreen, { CashierProfile, TerminalProfile } from './src/screens/login';
import PosBillingScreen from './src/screens/pos_billing';

export default function App() {
  const [currentUser, setCurrentUser] = useState<CashierProfile | null>(null);
  const [currentTerminal, setCurrentTerminal] = useState<TerminalProfile | null>(null);

  const handleLoginSuccess = (user: CashierProfile, terminal: TerminalProfile | null) => {
    setCurrentUser(user);
    setCurrentTerminal(terminal);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  return (
    <View style={styles.container}>
      {!currentUser ? (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      ) : (
        <PosBillingScreen
          onLogout={handleLogout}
          cashierName={currentUser.userName}
          terminalCode={currentTerminal?.terminalCode}
        />
      )}
      <StatusBar style={currentUser ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F0',
  },
});
