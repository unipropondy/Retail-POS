// ==============================================================================
// Author: JAVITH 28-10-2026
// Project: Supermarket Retail POS
// File: App.tsx
// Description: Main application root shell rendering the POS station screens.
// ==============================================================================

import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import LoginScreen from './src/screens/login';

export default function App() {
  return (
    <View style={styles.container}>
      {/* Active screen: Cashier Login & Station Navigation */}
      <LoginScreen />
      {/* Dark icons for status bar on light warm background */}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F0',
  },
});
