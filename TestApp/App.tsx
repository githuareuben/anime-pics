import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { launchCamera, launchImageLibrary, MediaType } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [detectedAmounts, setDetectedAmounts] = useState([]);
  const [selectedAmount, setSelectedAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load saved expenses when app starts
  useEffect(() => {
    loadExpenses();
  }, []);

  // Load expenses from storage
  const loadExpenses = async () => {
    try {
      const savedExpenses = await AsyncStorage.getItem('expenses');
      if (savedExpenses) {
        const expenseList = JSON.parse(savedExpenses);
        setExpenses(expenseList);
        calculateTotal(expenseList);
      }
    } catch (error) {
      console.error('Error loading expenses:', error);
    }
  };

  // Save expenses to storage
  const saveExpenses = async (expenseList) => {
    try {
      await AsyncStorage.setItem('expenses', JSON.stringify(expenseList));
    } catch (error) {
      console.error('Error saving expenses:', error);
    }
  };

  // Calculate total spending
  const calculateTotal = (expenseList) => {
    const total = expenseList.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
    setTotalSpent(total);
  };

  // Request permissions
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        ]);
        
        const cameraGranted = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted';
        
        if (!cameraGranted) {
          Alert.alert('Permission Required', 'Camera access is needed to scan receipts');
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('Permission error:', error);
        return false;
      }
    }
    return true;
  };

  // Extract text from image using ML Kit
  const extractTextFromImage = async (imageUri) => {
    try {
      setIsProcessing(true);
      console.log('Starting OCR processing for:', imageUri);
      
      // Use ML Kit text recognition
      const result = await TextRecognition.recognize(imageUri);
      
      console.log('OCR completed. Found text blocks:', result.blocks.length);
      
      // Combine all text blocks
      const fullText = result.blocks.map(block => block.text).join('\n');
      setExtractedText(fullText);
      
      // Extract potential amounts from the text
      const amounts = extractAmountsFromText(fullText);
      setDetectedAmounts(amounts);
      
      // Auto-select the highest amount as likely total
      if (amounts.length > 0) {
        const likelyTotal = Math.max(...amounts);
        setSelectedAmount(likelyTotal.toString());
      }
      
      // Try to extract merchant name from first few lines
      const lines = fullText.split('\n').filter(line => line.trim().length > 2);
      if (lines.length > 0) {
        const merchantName = lines[0].trim();
        // Clean up common receipt artifacts
        const cleanMerchant = merchantName
          .replace(/[^\w\s&-]/g, '') // Remove special chars except &, -, spaces
          .replace(/\s+/g, ' ') // Normalize spaces
          .trim();
        
        if (cleanMerchant.length > 0) {
          setMerchant(cleanMerchant);
        }
      }
      
      console.log('Extracted amounts:', amounts);
      console.log('Full text extracted:', fullText.substring(0, 200) + '...');
      
    } catch (error) {
      console.error('OCR error:', error);
      Alert.alert('OCR Error', `Failed to extract text: ${error.message}`);
      setExtractedText('Failed to extract text from image');
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract dollar amounts from text using comprehensive regex patterns
  const extractAmountsFromText = (text) => {
    const amounts = new Set(); // Use Set to avoid duplicates
    
    // Multiple regex patterns to catch different formats
    const patterns = [
      // $12.34, $1,234.56
      /\$(\d{1,3}(?:,\d{3})*\.\d{2})/g,
      // $12, $1,234 (whole dollars)
      /\$(\d{1,3}(?:,\d{3})*)(?!\.\d)/g,
      // 12.34, 123.45 (without $ symbol, with cents)
      /(?:^|\s)(\d{1,4}\.\d{2})(?:\s|$)/gm,
      // Amounts after "TOTAL", "SUBTOTAL", etc
      /(?:total|subtotal|amount|due)[\s:]*\$?(\d{1,4}(?:,\d{3})*\.?\d{0,2})/gi,
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let amount = match[1].replace(/,/g, ''); // Remove commas
        const numAmount = parseFloat(amount);
        
        // Filter reasonable amounts (between $0.01 and $9999.99)
        if (!isNaN(numAmount) && numAmount > 0 && numAmount < 10000) {
          amounts.add(numAmount);
        }
      }
    });
    
    // Convert Set back to Array and sort descending (largest first)
    return Array.from(amounts).sort((a, b) => b - a);
  };

  // Take photo of receipt
  const takeReceiptPhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 1.0, // High quality for better OCR
      maxWidth: 2048,
      maxHeight: 2048,
      includeBase64: false,
    };

    launchCamera(options, (response) => {
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setReceiptPhoto(asset.uri);
        clearResults();
        
        // Run OCR on the captured image
        extractTextFromImage(asset.uri);
      } else if (response.errorMessage) {
        Alert.alert('Camera Error', response.errorMessage);
      }
    });
  };

  // Select receipt from gallery
  const selectFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 1.0,
      maxWidth: 2048,
      maxHeight: 2048,
      includeBase64: false,
    };

    launchImageLibrary(options, (response) => {
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setReceiptPhoto(asset.uri);
        clearResults();
        
        // Run OCR on the selected image
        extractTextFromImage(asset.uri);
      } else if (response.errorMessage) {
        Alert.alert('Gallery Error', response.errorMessage);
      }
    });
  };

  // Clear OCR results
  const clearResults = () => {
    setExtractedText('');
    setDetectedAmounts([]);
    setSelectedAmount('');
    setMerchant('');
  };

  // Add expense to budget with confirmation
  const addExpense = async () => {
    const amount = parseFloat(selectedAmount);
    
    if (!selectedAmount || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid dollar amount');
      return;
    }

    const merchantName = merchant || 'Unknown Merchant';
    
    // Show confirmation dialog
    Alert.alert(
      'Add Expense',
      `Add $${amount.toFixed(2)} expense from ${merchantName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Add', 
          onPress: async () => {
            const newExpense = {
              id: Date.now().toString(),
              amount: amount,
              merchant: merchantName,
              date: new Date().toLocaleDateString(),
              photo: receiptPhoto,
              extractedText: extractedText,
            };

            const updatedExpenses = [...expenses, newExpense];
            setExpenses(updatedExpenses);
            calculateTotal(updatedExpenses);
            await saveExpenses(updatedExpenses);

            Alert.alert('Success', `$${amount.toFixed(2)} expense added to your budget`);
            
            // Clear form
            clearForm();
          }
        },
      ]
    );
  };

  // Clear the form
  const clearForm = () => {
    setReceiptPhoto(null);
    setExtractedText('');
    setDetectedAmounts([]);
    setSelectedAmount('');
    setMerchant('');
  };

  // Delete expense
  const deleteExpense = async (expenseId) => {
    const updatedExpenses = expenses.filter(expense => expense.id !== expenseId);
    setExpenses(updatedExpenses);
    calculateTotal(updatedExpenses);
    await saveExpenses(updatedExpenses);
  };

  // Retry OCR processing
  const retryOCR = () => {
    if (receiptPhoto) {
      clearResults();
      extractTextFromImage(receiptPhoto);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Smart Receipt Scanner</Text>
          <Text style={styles.subtitle}>OCR-Powered Budget Tracker</Text>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total Spent:</Text>
            <Text style={styles.totalAmount}>${totalSpent.toFixed(2)}</Text>
          </View>
        </View>

        {/* Camera Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scan Receipt</Text>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.cameraButton, isProcessing && styles.buttonDisabled]} 
              onPress={takeReceiptPhoto}
              disabled={isProcessing}
            >
              <Text style={styles.buttonText}>Take Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.galleryButton, isProcessing && styles.buttonDisabled]} 
              onPress={selectFromGallery}
              disabled={isProcessing}
            >
              <Text style={[styles.buttonText, styles.galleryButtonText]}>
                From Gallery
              </Text>
            </TouchableOpacity>
          </View>

          {receiptPhoto && (
            <View style={styles.photoContainer}>
              <Image source={{ uri: receiptPhoto }} style={styles.receiptImage} />
              {!isProcessing && extractedText && (
                <TouchableOpacity style={styles.retryButton} onPress={retryOCR}>
                  <Text style={styles.retryButtonText}>Retry OCR</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* OCR Processing Status */}
        {isProcessing && (
          <View style={styles.section}>
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.processingText}>Extracting text from receipt...</Text>
            </View>
          </View>
        )}

        {/* Detected Amounts */}
        {detectedAmounts.length > 0 && !isProcessing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detected Amounts</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.amountsContainer}>
                {detectedAmounts.map((amount, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.amountChip,
                      selectedAmount === amount.toString() && styles.selectedAmountChip
                    ]}
                    onPress={() => setSelectedAmount(amount.toString())}
                  >
                    <Text style={[
                      styles.amountChipText,
                      selectedAmount === amount.toString() && styles.selectedAmountChipText
                    ]}>
                      ${amount.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Manual Entry Section */}
        {receiptPhoto && !isProcessing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm Details</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Amount ($)</Text>
              <TextInput
                style={styles.textInput}
                value={selectedAmount}
                onChangeText={setSelectedAmount}
                placeholder="0.00"
                keyboardType="numeric"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Merchant</Text>
              <TextInput
                style={styles.textInput}
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Store name"
                placeholderTextColor="#999"
              />
            </View>

            <TouchableOpacity
              style={[
                styles.addButton,
                (!selectedAmount || isNaN(parseFloat(selectedAmount))) && styles.buttonDisabled
              ]}
              onPress={addExpense}
              disabled={!selectedAmount || isNaN(parseFloat(selectedAmount))}
            >
              <Text style={styles.buttonText}>Add to Budget</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearButton} onPress={clearForm}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Extracted Text (Collapsible) */}
        {extractedText && !isProcessing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Extracted Text</Text>
            <ScrollView style={styles.textContainer} nestedScrollEnabled>
              <Text style={styles.extractedText}>{extractedText}</Text>
            </ScrollView>
          </View>
        )}

        {/* Recent Expenses */}
        {expenses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Expenses</Text>
            {expenses.slice().reverse().slice(0, 5).map((expense) => (
              <View key={expense.id} style={styles.expenseItem}>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseAmount}>${expense.amount.toFixed(2)}</Text>
                  <Text style={styles.expenseMerchant}>{expense.merchant}</Text>
                  <Text style={styles.expenseDate}>{expense.date}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteExpense(expense.id)}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'white',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 15,
  },
  totalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  totalLabel: {
    fontSize: 16,
    color: '#475569',
    marginRight: 10,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#059669',
  },
  section: {
    marginHorizontal: 15,
    marginBottom: 15,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  cameraButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  galleryButton: {
    flex: 1,
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  galleryButtonText: {
    color: '#3b82f6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  photoContainer: {
    alignItems: 'center',
  },
  receiptImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  retryButton: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f59e0b',
    borderRadius: 6,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  processingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748b',
  },
  amountsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  amountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  selectedAmountChip: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  amountChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  selectedAmountChipText: {
    color: 'white',
  },
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 5,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: 'white',
    color: '#1f2937',
  },
  addButton: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  clearButton: {
    backgroundColor: 'white',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  textContainer: {
    maxHeight: 120,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
  },
  extractedText: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 14,
  },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  expenseMerchant: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
  },
  deleteButtonText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
});