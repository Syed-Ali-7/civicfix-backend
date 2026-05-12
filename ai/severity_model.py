#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CivicFix - Pothole Severity Classification Model
MobileNetV2 Transfer Learning — Minor / Moderate / Severe
Updated: Stronger augmentation, class weights, increased epochs
"""

import os
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import cv2
from pathlib import Path
import json
from datetime import datetime
import argparse

# Configuration
IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 40          # EDIT 3: Increased from 30 to 40
LEARNING_RATE = 0.0005
CLASSES = ['low', 'high']  # low = minor, high = moderate + severe merged

class SeverityModel:
    def __init__(self, model_path="severity_model.keras"):
        self.model_path = model_path
        self.model = None
        self.history = None

    def build_model(self):
        print("[BUILD] Building MobileNetV2 severity classifier...")

        base_model = tf.keras.applications.MobileNetV2(
            weights='imagenet',
            include_top=False,
            input_shape=(IMG_SIZE, IMG_SIZE, 3)
        )
        base_model.trainable = False

        # FIX: Reduced augmentation — vertical flip removed, values tuned down
        data_augmentation = models.Sequential([
            layers.RandomFlip("horizontal"),      # natural for road photos
            layers.RandomRotation(0.1),           # reduced: less distortion
            layers.RandomZoom(0.1),               # reduced: less distortion
            layers.RandomBrightness(0.2),         # reduced: handles lighting
            layers.RandomContrast(0.1),           # slight contrast variation only
        ], name='data_augmentation')

        inputs = layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
        x = data_augmentation(inputs)
        x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
        x = base_model(x, training=False)
        x = layers.GlobalAveragePooling2D()(x)
        x = layers.Dense(128, activation='relu')(x)
        x = layers.BatchNormalization()(x)
        x = layers.Dropout(0.3)(x)
        # 2-class binary output — sigmoid
        outputs = layers.Dense(1, activation='sigmoid')(x)

        self.model = keras.Model(inputs, outputs)
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE),
            loss='binary_crossentropy',
            metrics=['accuracy',
                     keras.metrics.Precision(name='precision'),
                     keras.metrics.Recall(name='recall'),
                     keras.metrics.AUC(name='auc')]
        )

        print(f"[OK] Model built! Params: {self.model.count_params():,}")
        return self.model

    def load_images(self, data_dir):
        print("\n[LOAD] Loading severity dataset...")
        images, labels = [], []

        for label_idx, class_name in enumerate(CLASSES):
            class_dir = os.path.join(data_dir, class_name)
            if not os.path.exists(class_dir):
                print(f"[ERROR] Folder not found: {class_dir}")
                return None, None

            count = 0
            for file in os.listdir(class_dir):
                if Path(file).suffix.lower() in {'.jpg', '.jpeg', '.png', '.bmp'}:
                    try:
                        img_path = os.path.join(class_dir, file)
                        img = cv2.imread(img_path)
                        if img is None:
                            continue

                        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                        h, w = img.shape[:2]
                        scale = IMG_SIZE / max(h, w)
                        new_h, new_w = int(h * scale), int(w * scale)
                        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

                        padded = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
                        y_off = (IMG_SIZE - new_h) // 2
                        x_off = (IMG_SIZE - new_w) // 2
                        padded[y_off:y_off+new_h, x_off:x_off+new_w] = img

                        images.append(padded)
                        labels.append(label_idx)
                        count += 1
                    except Exception as e:
                        print(f"[WARN] {file}: {e}")

            print(f"[OK] {class_name}: {count} images (label={label_idx})")

        return np.array(images, dtype=np.float32), np.array(labels)

    def train(self, data_dir, epochs=EPOCHS):
        X, y = self.load_images(data_dir)
        if X is None:
            return False

        print(f"\n[INFO] Total: {len(X)} images")

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        X_train, X_val, y_train, y_val = train_test_split(
            X_train, y_train, test_size=0.2, random_state=42, stratify=y_train
        )

        print(f"[INFO] Train: {len(X_train)} | Val: {len(X_val)} | Test: {len(X_test)}")

        if self.model is None:
            self.build_model()

        # Class weights — high has 2x images so balance it
        n_low  = np.sum(y_train == 0)
        n_high = np.sum(y_train == 1)
        class_weight = {
            0: n_high / n_low,   # low gets higher weight (minority)
            1: 1.0               # high is majority
        }
        print(f"\n[INFO] Class weights: {class_weight}")
        print(f"[INFO] Low: {n_low} | High: {n_high}")

        callbacks = [
            keras.callbacks.EarlyStopping(
                monitor='val_auc', patience=8,
                restore_best_weights=True, mode='max'
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor='val_auc', factor=0.5,
                patience=4, min_lr=1e-7, mode='max'
            )
        ]

        # Phase 1 — frozen base
        print("\n[TRAIN] Phase 1: Training with frozen base...")
        self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=epochs,
            batch_size=BATCH_SIZE,
            callbacks=callbacks,
            class_weight=class_weight,    # EDIT 2: added
            verbose=1
        )

        # Phase 2 — fine-tune top layers
        print("\n[TRAIN] Phase 2: Fine-tuning top layers...")
        base_model = self.model.get_layer('mobilenetv2_1.00_224')
        base_model.trainable = True
        for layer in base_model.layers[:-30]:
            layer.trainable = False

        trainable_count = sum(1 for l in base_model.layers if l.trainable)
        print(f"[INFO] Unfroze {trainable_count} layers for fine-tuning")

        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=1e-5),
            loss='binary_crossentropy',
            metrics=['accuracy',
                     keras.metrics.Precision(name='precision'),
                     keras.metrics.Recall(name='recall'),
                     keras.metrics.AUC(name='auc')]
        )

        self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=15,
            batch_size=BATCH_SIZE,
            callbacks=[
                keras.callbacks.EarlyStopping(
                    monitor='val_auc', patience=5,
                    restore_best_weights=True, mode='max'
                )
            ],
            class_weight=class_weight,    # EDIT 2: added
            verbose=1
        )

        print("[OK] Fine-tuning complete!")

        # Evaluate
        print("\n[EVAL] Evaluating on test set...")
        test_loss, test_acc, test_prec, test_rec, test_auc = self.model.evaluate(X_test, y_test, verbose=0)

        # Detailed classification report
        y_pred = (self.model.predict(X_test, verbose=0).flatten() > 0.5).astype(int)
        print("\n[RESULT] Classification Report:")
        print(classification_report(y_test, y_pred, target_names=CLASSES))
        print(f"[RESULT] Test Accuracy:  {test_acc*100:.1f}%")
        print(f"[RESULT] Test Precision: {test_prec*100:.1f}%")
        print(f"[RESULT] Test Recall:    {test_rec*100:.1f}%")
        print(f"[RESULT] Test AUC:       {test_auc*100:.1f}%")

        # Confusion matrix
        cm = confusion_matrix(y_test, y_pred)
        print("\n[RESULT] Confusion Matrix (low | high):")
        print(cm)

        # Save
        self.save_model(test_acc)
        return True

    def save_model(self, accuracy):
        print(f"\n[SAVE] Saving to: {self.model_path}")
        self.model.save(self.model_path)

        metadata = {
            'timestamp': datetime.now().isoformat(),
            'model_path': self.model_path,
            'image_size': IMG_SIZE,
            'classes': CLASSES,
            'test_accuracy': float(accuracy),
            'architecture': 'MobileNetV2 Transfer Learning — Severity Classification'
        }

        metadata_path = self.model_path.replace('.keras', '_metadata.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        print(f"[OK] Saved! Accuracy: {accuracy*100:.1f}%")
        print(f"[OK] Metadata: {metadata_path}")

    def load_model(self):
        if os.path.exists(self.model_path):
            print(f"[LOAD] Loading: {self.model_path}")
            self.model = keras.models.load_model(self.model_path)
            print("[OK] Model loaded!")
            return True
        print(f"[ERROR] Not found: {self.model_path}")
        return False

    def predict_severity(self, image_path):
        if self.model is None:
            self.load_model()

        img = cv2.imread(image_path)
        if img is None:
            return None

        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
        img = img.astype(np.float32)

        prediction = self.model.predict(np.array([img]), verbose=0)
        confidence = float(prediction[0][0])
        severity = 'high' if confidence > 0.5 else 'low'

        return {
            'severity': severity,
            'confidence': confidence,
            'percentage': f"{confidence*100:.1f}%",
            'scores': {
                'low':  float(1 - confidence),
                'high': float(confidence)
            }
        }

def main():
    parser = argparse.ArgumentParser(description='CivicFix Severity Model')
    parser.add_argument('--train', action='store_true')
    parser.add_argument('--predict', type=str)
    parser.add_argument('--data-dir', type=str, default='severity_dataset')
    parser.add_argument('--model', type=str, default='severity_model.keras')
    parser.add_argument('--epochs', type=int, default=EPOCHS)
    args = parser.parse_args()

    model = SeverityModel(model_path=args.model)

    if args.train:
        print("="*50)
        print("[TRAIN] CivicFix Severity Model — Training Mode")
        print("="*50)
        model.train(args.data_dir, epochs=args.epochs)

    elif args.predict:
        print("="*50)
        print("[PREDICT] CivicFix Severity Model — Prediction Mode")
        print("="*50)
        result = model.predict_severity(args.predict)
        if result:
            print(f"\n[RESULT] Severity: {result['severity'].upper()}")
            print(f"   Confidence: {result['percentage']}")
            print(f"   Scores: {result['scores']}")

if __name__ == '__main__':
    main()
