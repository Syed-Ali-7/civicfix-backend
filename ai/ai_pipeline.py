#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CivicFix AI Pipeline
Runs pothole detection + severity classification and prints JSON to stdout.
Usage: python ai_pipeline.py <image_path>
Output: JSON { success, is_pothole, detection_confidence, severity, sla_days, message }
"""

import sys
import os
import json
import numpy as np
import cv2

IMG_SIZE = 224

# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def load_image(image_path):
    """Load and preprocess image to model input format (float32, [0,255] range)."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_AREA)
    return img.astype(np.float32)


def load_keras_model(model_path):
    """Load a .keras model lazily (import tf only when needed)."""
    import tensorflow as tf
    return tf.keras.models.load_model(model_path)


def resolve_path(relative_path):
    """Resolve path relative to this script's directory."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, relative_path)


# ──────────────────────────────────────────────────────────────
# Main pipeline
# ──────────────────────────────────────────────────────────────

def run_pipeline(image_path):
    pothole_model_path  = resolve_path("pothole_model.keras")
    severity_model_path = resolve_path("severity_model.keras")
    pothole_meta_path   = resolve_path("pothole_model_metadata.json")

    # ── Read optimal threshold from metadata if available ──
    detection_threshold = 0.5
    try:
        with open(pothole_meta_path, "r") as f:
            meta = json.load(f)
        detection_threshold = float(meta.get("optimal_threshold", 0.5))
    except Exception:
        pass

    # ── Load image ──
    img = load_image(image_path)
    img_batch = np.expand_dims(img, axis=0)  # shape: (1, 224, 224, 3)

    # ── Step 1: Pothole Detection ──
    pothole_model = load_keras_model(pothole_model_path)
    pred = pothole_model.predict(img_batch, verbose=0)
    detection_confidence = float(pred[0][0])
    is_pothole = detection_confidence > detection_threshold

    if not is_pothole:
        return {
            "success": True,
            "is_pothole": False,
            "detection_confidence": round(detection_confidence, 4),
            "severity": "low",
            "sla_days": 15,
            "message": f"No pothole detected (confidence {detection_confidence*100:.1f}%)"
        }

    # ── Step 2: Severity Classification ──
    severity = "low"
    sla_days = 15
    severity_confidence = None

    try:
        severity_model = load_keras_model(severity_model_path)

        # severity_model uses mobilenet_v2 preprocess_input style internally
        sev_pred = severity_model.predict(img_batch, verbose=0)
        severity_confidence = float(sev_pred[0][0])
        # sigmoid output: >0.5 → high severity
        severity = "high" if severity_confidence > 0.5 else "low"
        sla_days = 7 if severity == "high" else 15
    except Exception as sev_err:
        # Severity model unavailable — safe default
        severity = "low"
        sla_days = 15

    return {
        "success": True,
        "is_pothole": True,
        "detection_confidence": round(detection_confidence, 4),
        "severity": severity,
        "sla_days": sla_days,
        "message": (
            f"Pothole detected ({detection_confidence*100:.1f}% confidence). "
            f"Severity: {severity.upper()} — SLA: {sla_days} days."
        )
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "is_pothole": True,
            "detection_confidence": 0.0,
            "severity": "low",
            "sla_days": 15,
            "message": "No image path provided"
        }))
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.isfile(image_path):
        print(json.dumps({
            "success": False,
            "is_pothole": True,
            "detection_confidence": 0.0,
            "severity": "low",
            "sla_days": 15,
            "message": f"Image file not found: {image_path}"
        }))
        sys.exit(1)

    try:
        result = run_pipeline(image_path)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "is_pothole": True,
            "detection_confidence": 0.0,
            "severity": "low",
            "sla_days": 15,
            "message": f"Pipeline error: {str(e)}"
        }))
        sys.exit(1)
