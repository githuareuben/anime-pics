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
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { launchCamera, launchImageLibrary, MediaType } from 'react-native-image-picker';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';

export default function App() {
  const [modelStatus, setModelStatus] = useState('Loading AI model...');
  const [session, setSession] = useState(null);
  const [originalPhoto, setOriginalPhoto] = useState(null);
  const [processedPhoto, setProcessedPhoto] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load ONNX model on app start
  useEffect(() => {
    const loadModel = async () => {
      try {
        setModelStatus('Loading AI model...');
        
        const fileName = 'mosaic-9.onnx';
        const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
        
        // Check if model already exists in documents
        const fileExists = await RNFS.exists(destPath);
        if (!fileExists) {
          setModelStatus('Copying model from assets...');
          await RNFS.copyFileAssets(`models/${fileName}`, destPath);
        }
        
        setModelStatus('Initializing AI model...');
        const modelSession = await InferenceSession.create(destPath);
        setSession(modelSession);
        setModelStatus(`AI Model Ready (${modelSession.inputNames.join(', ')})`);
        console.log('ONNX model loaded successfully');
        
      } catch (error) {
        setModelStatus('AI Model Failed to Load');
        console.error('Model loading error:', error);
        Alert.alert(
          'Model Error',
          `Failed to load AI model: ${error.message}`,
          [{ text: 'OK' }]
        );
      }
    };

    loadModel();
  }, []);

  // Request camera and storage permissions
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
        const storageGranted = 
          granted[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] === 'granted' ||
          granted[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] === 'granted';
        
        if (!cameraGranted) {
          Alert.alert('Permission Required', 'Camera access is needed to take photos');
          return false;
        }
        
        return true;
      } catch (error) {
        console.error('Permission error:', error);
        return false;
      }
    }
    return true; // iOS handles permissions automatically
  };

  // Preprocess image for ONNX model
  const preprocessImage = async (imagePath) => {
    try {
      // Note: This is a simplified preprocessing function
      // In a production app, you would need to:
      // 1. Load and decode the actual image
      // 2. Resize to model's expected input size (typically 256x256 or 512x512)
      // 3. Normalize pixel values to range expected by model (usually -1 to 1 or 0 to 1)
      // 4. Convert from RGB to the channel order expected by model
      // 5. Convert to Float32Array in the correct shape
      
      console.log('Preprocessing image:', imagePath);
      
      // For demo purposes, creating dummy tensor data
      // Replace this with actual image processing logic
      const inputSize = 224; // Fixed: Your model expects 224x224 input
      const channels = 3;
      const batchSize = 1;
      
      // Create random normalized data as placeholder
      const imageData = new Float32Array(batchSize * channels * inputSize * inputSize);
      for (let i = 0; i < imageData.length; i++) {
        imageData[i] = (Math.random() - 0.5) * 2; // Random values between -1 and 1
      }
      
      // Create tensor with correct shape [batch, channels, height, width]
      const inputTensor = new Tensor('float32', imageData, [batchSize, channels, inputSize, inputSize]);
      
      return inputTensor;
    } catch (error) {
      console.error('Preprocessing error:', error);
      throw new Error(`Image preprocessing failed: ${error.message}`);
    }
  };

  // Process image with ONNX model
  const processImageWithAI = async (imagePath) => {
    if (!session) {
      throw new Error('AI model not loaded');
    }

    try {
      console.log('Starting AI processing...');
      setIsProcessing(true);
      
      // Preprocess image
      const inputTensor = await preprocessImage(imagePath);
      
      // Run inference
      // Note: Input name depends on your specific model
      // Check your model's input names with session.inputNames
      const inputName = session.inputNames[0] || 'input';
      const feeds = { [inputName]: inputTensor };
      
      console.log(`Running inference with input: ${inputName}`);
      const results = await session.run(feeds);
      
      // Get output tensor
      const outputName = session.outputNames[0] || Object.keys(results)[0];
      const outputTensor = results[outputName];
      
      if (!outputTensor) {
        throw new Error('No output received from model');
      }
      
      console.log(`Output tensor shape: ${outputTensor.dims}`);
      console.log('AI processing completed');
      
      // Note: In a complete implementation, you would:
      // 1. Post-process the output tensor back to image format
      // 2. Convert from CHW to HWC format if needed
      // 3. Denormalize pixel values
      // 4. Save as new image file
      // 5. Return the processed image path
      
      // For now, return original path as placeholder
      return imagePath;
      
    } catch (error) {
      console.error('AI processing error:', error);
      throw new Error(`AI processing failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Take photo with camera
  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.9,
      maxWidth: 1024,
      maxHeight: 1024,
      includeBase64: false,
    };

    launchCamera(options, async (response) => {
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setOriginalPhoto(asset.uri);
        setProcessedPhoto(null); // Clear previous processed photo
        
        // Auto-process with AI if model is ready
        if (session) {
          try {
            const processedPath = await processImageWithAI(asset.uri);
            setProcessedPhoto(processedPath);
            Alert.alert('Success!', 'Photo processed with AI anime style');
          } catch (error) {
            Alert.alert('Processing Error', error.message);
            console.error('Auto-processing failed:', error);
          }
        }
      } else if (response.errorMessage) {
        Alert.alert('Camera Error', response.errorMessage);
      }
    });
  };

  // Select photo from gallery
  const selectFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.9,
      maxWidth: 1024,
      maxHeight: 1024,
      includeBase64: false,
    };

    launchImageLibrary(options, async (response) => {
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setOriginalPhoto(asset.uri);
        setProcessedPhoto(null);
        
        if (session) {
          try {
            const processedPath = await processImageWithAI(asset.uri);
            setProcessedPhoto(processedPath);
            Alert.alert('Success!', 'Photo processed with AI anime style');
          } catch (error) {
            Alert.alert('Processing Error', error.message);
            console.error('Auto-processing failed:', error);
          }
        }
      } else if (response.errorMessage) {
        Alert.alert('Gallery Error', response.errorMessage);
      }
    });
  };

  // Manually process current photo
  const processCurrentPhoto = async () => {
    if (!originalPhoto) {
      Alert.alert('No Photo', 'Please take or select a photo first');
      return;
    }

    if (!session) {
      Alert.alert('Model Not Ready', 'AI model is still loading');
      return;
    }

    try {
      const processedPath = await processImageWithAI(originalPhoto);
      setProcessedPhoto(processedPath);
      Alert.alert('Success!', 'Photo processed with anime style');
    } catch (error) {
      Alert.alert('Processing Error', error.message);
      console.error('Manual processing failed:', error);
    }
  };

  // Save processed photo to gallery
  const saveToGallery = async () => {
    if (!processedPhoto) {
      Alert.alert('No Processed Photo', 'Please process a photo first');
      return;
    }

    try {
      await CameraRoll.save(processedPhoto, { type: 'photo' });
      Alert.alert('Saved!', 'Anime-style photo saved to gallery');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Save Error', `Failed to save: ${error.message}`);
    }
  };

  // Clear all photos
  const clearPhotos = () => {
    setOriginalPhoto(null);
    setProcessedPhoto(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>AniSnap</Text>
          <Text style={styles.subtitle}>AI Anime Photo Converter</Text>
          <Text style={[
            styles.status,
            modelStatus.includes('Ready') && styles.statusReady,
            modelStatus.includes('Failed') && styles.statusError
          ]}>
            {modelStatus}
          </Text>
        </View>

        {/* Photo Display */}
        <View style={styles.photoContainer}>
          {originalPhoto && (
            <View style={styles.photoSection}>
              <Text style={styles.photoLabel}>Original</Text>
              <Image source={{ uri: originalPhoto }} style={styles.photo} />
            </View>
          )}
          
          {processedPhoto && (
            <View style={styles.photoSection}>
              <Text style={styles.photoLabel}>Anime Style</Text>
              <Image source={{ uri: processedPhoto }} style={styles.photo} />
            </View>
          )}
          
          {!originalPhoto && !processedPhoto && (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>
                No photos yet. Take or select a photo to get started!
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={takePhoto}
            disabled={isProcessing}
          >
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={selectFromGallery}
            disabled={isProcessing}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>
              Choose from Gallery
            </Text>
          </TouchableOpacity>

          {originalPhoto && (
            <TouchableOpacity
              style={[
                styles.button,
                styles.processButton,
                (!session || isProcessing) && styles.buttonDisabled
              ]}
              onPress={processCurrentPhoto}
              disabled={!session || isProcessing}
            >
              {isProcessing ? (
                <View style={styles.processingContainer}>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={[styles.buttonText, { marginLeft: 8 }]}>
                    Processing...
                  </Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>Apply Anime Style</Text>
              )}
            </TouchableOpacity>
          )}

          {processedPhoto && (
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={saveToGallery}
            >
              <Text style={styles.buttonText}>Save to Gallery</Text>
            </TouchableOpacity>
          )}

          {(originalPhoto || processedPhoto) && (
            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={clearPhotos}
            >
              <Text style={[styles.buttonText, styles.clearButtonText]}>
                Clear Photos
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'white',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2563eb',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  status: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  statusReady: {
    color: '#059669',
    fontWeight: '600',
  },
  statusError: {
    color: '#dc2626',
    fontWeight: '600',
  },
  photoContainer: {
    marginHorizontal: 20,
    marginBottom: 20,
    minHeight: 200,
  },
  photoSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  photo: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  processButton: {
    backgroundColor: '#7c3aed',
  },
  saveButton: {
    backgroundColor: '#059669',
  },
  clearButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  secondaryButtonText: {
    color: '#2563eb',
  },
  clearButtonText: {
    color: '#6b7280',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});